"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { useParams } from "@/lib/contrato/navegacao";
import { useRouter } from "@/lib/contrato/navegacao";
import { AlertCircle, ArrowLeft, Check, FlaskConical, Pause, Play, Redo2, Rocket, Settings2, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { IconButton } from "@/components/ui/icon-button";
import { Modal, ModalContent } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { aplicar as aplicarOperacao, ErroDeOperacao, pontaAlvo, type Operacao } from "@/lib/automacoes/operacoes";
import { validar, podePublicar, type Pendencia } from "@/lib/automacoes/validar";
import { fraseDaAutomacao } from "@/lib/automacoes/frase";
import { NOMES_DOS_OBJETOS } from "@/lib/automacoes/catalogo";
import type { Definicao, Ponta, Regra } from "@/lib/automacoes/tipos";
import { CanvasDaAutomacao, resumoDoPasso, type EstadoDoNo } from "@/components/automacoes/canvas";
import { SeletorDePasso } from "@/components/automacoes/seletor";
import { PainelDeConfiguracoes, PainelDoPasso, type ConfigDaAutomacao } from "@/components/automacoes/painel";
import { duracao, nomesDasOpcoes, STATUS_DA_AUTOMACAO, useOpcoes } from "@/components/automacoes/comum";

// ---------------------------------------------------------------------------
// Editor da automação. Sempre se edita o rascunho (salvo sozinho); a versão
// publicada continua rodando até publicar de novo. Cada mudança é uma
// operação pura: desfazer/refazer com Ctrl+Z / Ctrl+Shift+Z. Pendência nunca
// bloqueia editar, só publicar.
// ---------------------------------------------------------------------------

interface Meta {
  id: string;
  nome: string;
  objeto: Definicao["objeto"];
  status: string;
  pausadaPor: string | null;
  versao: number | null;
  alteracoesNaoPublicadas: boolean;
}

interface PassoDoTeste {
  id: string;
  noId: string;
  status: string;
  caminho: string | null;
  erro: string | null;
  ms: number | null;
  saida: unknown;
}

type Salvo = "salvo" | "salvando" | "pendente" | "erro";

function ModalDeTeste({ aberto, fechar, automacaoId, def, objeto, nomes, aoTerminar }: {
  aberto: boolean;
  fechar: () => void;
  automacaoId: string;
  def: Definicao;
  objeto: Definicao["objeto"];
  nomes: ReturnType<typeof nomesDasOpcoes>;
  aoTerminar: (estados: Record<string, { estado: EstadoDoNo; ms?: number }>) => void;
}) {
  const [q, setQ] = React.useState("");
  const [itens, setItens] = React.useState<{ id: string; nome: string; detalhe?: string }[]>([]);
  const [rodando, setRodando] = React.useState(false);
  const [resultado, setResultado] = React.useState<{ status: string; duracaoMs: number | null; erro: string | null; passos: PassoDoTeste[] } | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    const t = setTimeout(() => {
      void fetch(`/api/automacoes/registros?objeto=${objeto}&q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .catch(() => ({ itens: [] }))
        .then((d) => vivo && setItens(d.itens ?? []));
    }, 250);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [q, aberto, objeto]);

  async function testar(objetoId: string) {
    setRodando(true);
    setErro(null);
    setResultado(null);
    try {
      const r = await fetch(`/api/automacoes/${automacaoId}/testar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ objetoId }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Não deu para testar.");
      const e = await fetch(`/api/automacoes/${automacaoId}/execucoes/${d.execucaoId}`).then((x) => x.json());
      const ex = e.execucao;
      setResultado({ status: ex.status, duracaoMs: ex.duracaoMs, erro: ex.erro, passos: ex.passos });
      const estados: Record<string, { estado: EstadoDoNo; ms?: number }> = { gatilho: { estado: "ok" } };
      for (const p of ex.passos as PassoDoTeste[]) estados[p.noId] = { estado: p.status as EstadoDoNo, ms: p.ms ?? undefined };
      aoTerminar(estados);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não deu para testar.");
    } finally {
      setRodando(false);
    }
  }

  const nomeDoPasso = (noId: string) => (def.nos[noId] ? resumoDoPasso(def, def.nos[noId], nomes).titulo : noId);
  return (
    <Modal open={aberto} onOpenChange={(v) => !v && fechar()}>
      <ModalContent size="md" title="Testar com um registro real" description="Roda o rascunho agora num registro de verdade, sem mudar nada: cada passo só mostra o que faria, e as esperas não esperam.">
        <div className="flex flex-col gap-3 overflow-y-auto px-5 pb-5">
          {erro && <Notice tone="danger">{erro}</Notice>}
          {resultado ? (
            <>
              <div className="flex items-center gap-2">
                <Badge variant={resultado.status === "concluida" || resultado.status === "objetivo" ? "success" : resultado.status === "falhou" ? "danger" : "warning"}>{resultado.status}</Badge>
                <span className="text-[12.5px] text-text-secondary">em {duracao(resultado.duracaoMs)}</span>
              </div>
              {resultado.erro && <Notice tone="danger">{resultado.erro}</Notice>}
              <ol className="flex flex-col gap-1.5">
                {resultado.passos.map((p) => (
                  <li key={p.id} className="flex items-start gap-2 rounded-lg border border-border-subtle px-3 py-2 text-[12.5px]">
                    <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", p.status === "ok" ? "bg-success" : p.status === "falhou" ? "bg-danger" : p.status === "pulado" ? "bg-border-strong" : "bg-warning")} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-text-primary">{nomeDoPasso(p.noId)}</span>
                      <span className="block text-text-tertiary">
                        {p.status === "ok" && (p.saida as { simulado?: boolean } | null)?.simulado ? "simulado (não mudou nada)" : p.status}
                        {p.caminho && p.caminho !== "proximo" ? ` · ${p.caminho}` : ""}
                        {p.erro ? ` · ${p.erro}` : ""}
                      </span>
                    </span>
                    <span className="font-mono text-[11px] text-text-tertiary">{p.ms ?? "—"} ms</span>
                  </li>
                ))}
              </ol>
              <div>
                <Button type="button" variant="secondary" size="sm" onClick={() => setResultado(null)}>Testar com outro</Button>
              </div>
            </>
          ) : (
            <>
              <Input autoFocus placeholder={`Buscar ${NOMES_DOS_OBJETOS[objeto].singular}...`} value={q} onChange={(e) => setQ(e.target.value)} />
              <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
                {itens.map((i) => (
                  <button
                    key={i.id}
                    type="button"
                    disabled={rodando}
                    onClick={() => void testar(i.id)}
                    className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-[13px] hover:bg-hover disabled:opacity-50"
                  >
                    <span className="truncate text-text-primary">{i.nome}</span>
                    <span className="shrink-0 text-[11.5px] text-text-tertiary">{i.detalhe}</span>
                  </button>
                ))}
                {!itens.length && <p className="px-3 py-2 text-[12.5px] text-text-tertiary">Nenhum registro encontrado.</p>}
              </div>
              {rodando && <p className="text-[12.5px] text-text-secondary">Rodando o teste...</p>}
            </>
          )}
        </div>
      </ModalContent>
    </Modal>
  );
}

export default function EditorDaAutomacao() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const opcoes = useOpcoes();
  const nomes = React.useMemo(() => nomesDasOpcoes(opcoes), [opcoes]);

  const [meta, setMeta] = React.useState<Meta | null>(null);
  const [erroDeCarga, setErroDeCarga] = React.useState<string | null>(null);
  const [def, setDef] = React.useState<Definicao | null>(null);
  const [config, setConfig] = React.useState<ConfigDaAutomacao | null>(null);
  const [passado, setPassado] = React.useState<Definicao[]>([]);
  const [futuro, setFuturo] = React.useState<Definicao[]>([]);
  const [selecionado, setSelecionado] = React.useState<string | null>(null);
  const [inserindo, setInserindo] = React.useState<Ponta | null>(null);
  const [salvo, setSalvo] = React.useState<Salvo>("salvo");
  const [publicando, setPublicando] = React.useState(false);
  const [confirmar, setConfirmar] = React.useState(false);
  const [testando, setTestando] = React.useState(false);
  const [estados, setEstados] = React.useState<Record<string, { estado: EstadoDoNo; ms?: number }> | undefined>();
  const carregado = React.useRef(false);

  React.useEffect(() => {
    let vivo = true;
    void fetch(`/api/automacoes/${id}`)
      .then(async (r) => ({ ok: r.ok, d: await r.json().catch(() => ({})) }))
      .then(({ ok, d }) => {
        if (!vivo) return;
        if (!ok) return setErroDeCarga(d.error ?? "Não deu para abrir.");
        const a = d.automacao;
        setMeta({ id: a.id, nome: a.nome, objeto: a.objeto, status: a.status, pausadaPor: a.pausadaPor, versao: a.versao, alteracoesNaoPublicadas: a.alteracoesNaoPublicadas });
        setDef(a.rascunho);
        setConfig({ nome: a.nome, descricao: a.descricao, reinscricao: a.reinscricao, reinscricaoHoras: a.reinscricaoHoras, objetivo: a.objetivo as Regra | null });
        if (!a.rascunho?.gatilho) setSelecionado("gatilho");
        setTimeout(() => (carregado.current = true), 0);
      });
    return () => {
      vivo = false;
    };
  }, [id]);

  const pendencias: Pendencia[] = React.useMemo(() => (def ? validar(def) : []), [def]);
  const erros = pendencias.filter((p) => p.nivel === "erro");

  // Salva sozinho ~1 s depois da última mudança.
  React.useEffect(() => {
    if (!carregado.current || !def || !config) return;
    setSalvo("pendente");
    const t = setTimeout(async () => {
      setSalvo("salvando");
      try {
        const r = await fetch(`/api/automacoes/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rascunho: def, ...config }),
        });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "erro");
        setSalvo("salvo");
        setMeta((m) => (m ? { ...m, nome: config.nome, alteracoesNaoPublicadas: true } : m));
      } catch {
        setSalvo("erro");
      }
    }, 900);
    return () => clearTimeout(t);
  }, [def, config, id]);

  const aplicar = React.useCallback(
    (op: Operacao) => {
      setDef((atual) => {
        if (!atual) return atual;
        try {
          const nova = aplicarOperacao(atual, op);
          setPassado((p) => [...p.slice(-99), atual]);
          setFuturo([]);
          setEstados(undefined);
          if (op.op === "inserir") setSelecionado(op.no.id);
          if (op.op === "apagar") setSelecionado(null);
          return nova;
        } catch (e) {
          toast({ title: e instanceof ErroDeOperacao ? e.message : "Não deu para fazer isso.", tone: "danger" });
          return atual;
        }
      });
    },
    [toast]
  );

  const desfazer = React.useCallback(() => {
    setPassado((p) => {
      if (!p.length || !def) return p;
      setFuturo((f) => [def, ...f]);
      setDef(p[p.length - 1]);
      return p.slice(0, -1);
    });
  }, [def]);
  const refazer = React.useCallback(() => {
    setFuturo((f) => {
      if (!f.length || !def) return f;
      setPassado((p) => [...p, def]);
      setDef(f[0]);
      return f.slice(1);
    });
  }, [def]);

  React.useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
      const alvo = e.target as HTMLElement;
      if (alvo.closest("input, textarea, select, [contenteditable]")) return;
      e.preventDefault();
      if (e.shiftKey) refazer();
      else desfazer();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [desfazer, refazer]);

  async function chamar(caminho: string) {
    const r = await fetch(`/api/automacoes/${id}/${caminho}`, { method: "POST" });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(d.error ?? "Não deu certo."), { pendencias: d.pendencias });
    return d;
  }

  async function publicar() {
    setPublicando(true);
    try {
      const d = await chamar("publicar");
      setMeta((m) => (m ? { ...m, status: "ativa", versao: d.versao, alteracoesNaoPublicadas: false, pausadaPor: null } : m));
      setConfirmar(false);
      toast({ title: `Versão ${d.versao} publicada e ligada.`, tone: "success", description: d.avisos?.length ? `${d.avisos.length} aviso(s) para conferir.` : undefined });
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Não deu para publicar.", tone: "danger" });
    } finally {
      setPublicando(false);
    }
  }

  async function pausarOuLigar() {
    try {
      if (meta?.status === "ativa") {
        await chamar("pausar");
        setMeta((m) => (m ? { ...m, status: "pausada" } : m));
        toast({ title: "Automação pausada. Quem está no meio para no próximo passo." });
      } else {
        await chamar("retomar");
        setMeta((m) => (m ? { ...m, status: "ativa", pausadaPor: null } : m));
        toast({ title: "Automação ligada de novo.", tone: "success" });
      }
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Não deu certo.", tone: "danger" });
    }
  }

  async function apagar() {
    if (!confirm("Apagar esta automação? O histórico de execuções some junto e quem está no meio para.")) return;
    const r = await fetch(`/api/automacoes/${id}`, { method: "DELETE" });
    if (r.ok) router.push("/automacoes");
    else toast({ title: "Não deu para apagar.", tone: "danger" });
  }

  if (erroDeCarga) return <div className="p-8"><Notice tone="danger">{erroDeCarga}</Notice></div>;
  if (!meta || !def || !config) return <div className="p-8 text-[13px] text-text-tertiary">Carregando a automação...</div>;

  const st = STATUS_DA_AUTOMACAO[meta.status] ?? STATUS_DA_AUTOMACAO.rascunho;
  let ocupado = false;
  try {
    ocupado = inserindo ? !!pontaAlvo(def, inserindo) : false;
  } catch {
    ocupado = false;
  }

  return (
    <div className="flex h-[calc(100dvh-0px)] min-h-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-border-subtle px-5 py-3">
        <Link href="/automacoes" className="flex items-center gap-1 text-[12.5px] text-text-secondary hover:text-text-primary">
          <ArrowLeft size={14} /> Automações
        </Link>
        <Input
          aria-label="Nome da automação"
          className="h-8 w-64 border-transparent bg-transparent px-1 text-[15px] font-semibold hover:border-border-default focus:border-border-default"
          value={config.nome}
          onChange={(e) => setConfig({ ...config, nome: e.target.value })}
        />
        <Badge variant={st.variante}>{st.rotulo}</Badge>
        {meta.versao !== null && <span className="text-[11.5px] text-text-tertiary">versão {meta.versao}</span>}
        <span className="text-[11.5px] text-text-tertiary">
          {salvo === "salvo" ? (
            <span className="inline-flex items-center gap-1"><Check size={12} /> salvo</span>
          ) : salvo === "erro" ? (
            <span className="text-danger">não salvou</span>
          ) : (
            "salvando..."
          )}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <IconButton aria-label="Desfazer" tooltip size="sm" type="button" disabled={!passado.length} onClick={desfazer}>
            <Undo2 size={14} />
          </IconButton>
          <IconButton aria-label="Refazer" tooltip size="sm" type="button" disabled={!futuro.length} onClick={refazer}>
            <Redo2 size={14} />
          </IconButton>
          {erros.length > 0 && (
            <Button type="button" size="sm" variant="ghost" className="text-danger" onClick={() => setSelecionado(erros[0].no ?? "gatilho")}>
              <AlertCircle size={14} /> {erros.length} {erros.length === 1 ? "pendência" : "pendências"}
            </Button>
          )}
          <Button type="button" size="sm" variant="ghost" onClick={() => setSelecionado("config")}>
            <Settings2 size={14} /> Configurações
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => setTestando(true)}>
            <FlaskConical size={14} /> Testar
          </Button>
          {meta.versao !== null && (
            <Button type="button" size="sm" variant="secondary" onClick={() => void pausarOuLigar()}>
              {meta.status === "ativa" ? <><Pause size={14} /> Pausar</> : <><Play size={14} /> Ligar</>}
            </Button>
          )}
          <Button type="button" size="sm" onClick={() => setConfirmar(true)}>
            <Rocket size={14} /> {meta.versao === null ? "Publicar e ligar" : "Publicar alterações"}
          </Button>
          <IconButton aria-label="Apagar automação" tooltip size="sm" type="button" onClick={() => void apagar()}>
            <Trash2 size={14} />
          </IconButton>
        </div>
        <p className="w-full truncate text-[12.5px] text-text-secondary" title={fraseDaAutomacao(def, nomes)}>
          {fraseDaAutomacao(def, nomes)}
        </p>
        {meta.status === "pausada" && meta.pausadaPor && <Notice tone="warning" className="w-full">{meta.pausadaPor}</Notice>}
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          <CanvasDaAutomacao def={def} nomes={nomes} pendencias={pendencias} selecionado={selecionado} selecionar={setSelecionado} inserir={setInserindo} estados={estados} />
        </div>
        {selecionado && (selecionado === "config" || selecionado === "gatilho" || def.nos[selecionado]) && (
          <aside className="w-[400px] shrink-0 border-l border-border-subtle bg-panel">
            {selecionado === "config" ? (
              <PainelDeConfiguracoes def={def} config={config} mudar={(c) => setConfig({ ...config, ...c })} opcoes={opcoes} fechar={() => setSelecionado(null)} />
            ) : (
              <PainelDoPasso def={def} selecionado={selecionado} aplicar={aplicar} opcoes={opcoes} nomes={nomes} pendencias={pendencias} fechar={() => setSelecionado(null)} />
            )}
          </aside>
        )}
      </div>

      <SeletorDePasso
        aberto={!!inserindo}
        fechar={() => setInserindo(null)}
        objeto={def.objeto}
        ocupado={ocupado}
        escolher={(no, seguintesPor) => {
          if (inserindo) aplicar({ op: "inserir", ponta: inserindo, no, ...(seguintesPor ? { seguintesPor } : {}) });
          setInserindo(null);
        }}
      />

      <Modal open={confirmar} onOpenChange={setConfirmar}>
        <ModalContent
          size="md"
          title={meta.versao === null ? "Publicar e ligar" : "Publicar alterações"}
          description="Vira uma versão nova. Quem já está no meio continua na versão em que entrou."
          footer={
            <>
              <Button type="button" variant="ghost" onClick={() => setConfirmar(false)}>Cancelar</Button>
              <Button type="button" disabled={publicando || !podePublicar(pendencias)} onClick={() => void publicar()}>
                {publicando ? "Publicando..." : "Publicar"}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-2 px-5 pb-2">
            <p className="text-[13px] text-text-secondary">{fraseDaAutomacao(def, nomes)}</p>
            {erros.length > 0 ? (
              <Notice tone="danger">
                <span className="block font-medium">Corrija antes de publicar:</span>
                {erros.slice(0, 8).map((p, i) => (
                  <button key={i} type="button" className="block text-left underline-offset-2 hover:underline" onClick={() => { setConfirmar(false); setSelecionado(p.no ?? "gatilho"); }}>
                    • {p.mensagem}
                  </button>
                ))}
              </Notice>
            ) : (
              <Notice tone="info">Tudo certo para publicar. Quem atender o gatilho a partir de agora entra.</Notice>
            )}
            {pendencias.filter((p) => p.nivel === "aviso").map((p, i) => (
              <p key={i} className="text-[12px] text-warning">Aviso: {p.mensagem}</p>
            ))}
          </div>
        </ModalContent>
      </Modal>

      <ModalDeTeste aberto={testando} fechar={() => setTestando(false)} automacaoId={id} def={def} objeto={def.objeto} nomes={nomes} aoTerminar={setEstados} />
    </div>
  );
}
