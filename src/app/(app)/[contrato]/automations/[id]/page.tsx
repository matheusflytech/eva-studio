"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { useParams } from "@/lib/contrato/navegacao";
import { useRouter } from "@/lib/contrato/navegacao";
import { AlertCircle, ArrowLeft, Check, Ellipsis, Pause, Play, Rocket, Settings2, Trash2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { IconButton } from "@/components/ui/icon-button";
import { Modal, ModalContent } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { avisarNaIlha, pulsar } from "@/lib/fundo/eventos";
import { cn } from "@/lib/utils";
import { aplicar as aplicarOperacao, ErroDeOperacao, pontaAlvo, type Operacao } from "@/lib/automacoes/operacoes";
import { validar, podePublicar, type Pendencia } from "@/lib/automacoes/validar";
import { fraseDaAutomacao } from "@/lib/automacoes/frase";
import { NOMES_DOS_OBJETOS } from "@/lib/automacoes/catalogo";
import type { Definicao, Ponta, Regra } from "@/lib/automacoes/tipos";
import { CanvasDaAutomacao, resumoDoPasso, type EstadoDoNo } from "@/components/automacoes/canvas";
import type { NumerosDoPasso } from "@/lib/server/automacoes/telas";
import { PainelDoProximoPasso } from "@/components/automacoes/seletor";
import { PainelDeConfiguracoes, PainelDoPasso, type ConfigDaAutomacao } from "@/components/automacoes/painel";
import { duracao, nomesDasOpcoes, STATUS_DA_AUTOMACAO, useOpcoes } from "@/components/automacoes/comum";
import { FaixaDeExecucoes } from "@/components/automacoes/faixa-de-execucoes";
import { TesteDeVerdade } from "@/components/automacoes/teste-de-verdade";
import { motivoDoPasso, passosComProblema } from "@/lib/automacoes/teste";
import { MOLA } from "@/lib/design-system/movimento";

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

/** Mesmo formato nos dois lados da comparação (ordem das chaves fixa). */
function assinatura(rascunho: Definicao | null, c: ConfigDaAutomacao): string {
  return JSON.stringify({ rascunho, nome: c.nome, descricao: c.descricao, reinscricao: c.reinscricao, reinscricaoHoras: c.reinscricaoHoras, objetivo: c.objetivo });
}

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
      // O resultado também passa pela ilha: o quadro atrás já mostra o caminho aceso.
      avisarNaIlha({
        titulo: ex.status === "falhou" ? "O teste parou num erro" : `Teste concluído em ${duracao(ex.duracaoMs)}`,
        detalhe: ex.status === "falhou" ? ex.erro || passosComProblema(ex.passos as PassoDoTeste[]).at(-1)?.motivo || "Veja o passo marcado em vermelho." : `${ex.passos.length} ${ex.passos.length === 1 ? "passo" : "passos"} · ${
          (ex.passos as PassoDoTeste[]).some((p) => typeof (p.saida as { status?: unknown } | null)?.status === "number") ? "só o n8n recebeu de verdade" : "nada foi enviado de verdade"
        }`,
      });
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não deu para testar.");
    } finally {
      setRodando(false);
    }
  }

  const nomeDoPasso = (noId: string) => (def.nos[noId] ? resumoDoPasso(def, def.nos[noId], nomes).titulo : noId);
  return (
    <Modal open={aberto} onOpenChange={(v) => !v && fechar()}>
      <ModalContent size="md" title="Testar com um registro real" description={'Roda o rascunho agora num registro de verdade, sem mudar nada no CRM: cada passo só mostra o que faria e as esperas não esperam. “Enviar para o n8n” envia de verdade, com "teste": true no corpo, para você ver o n8n receber.'}>
        <div className="flex flex-col gap-3 overflow-y-auto px-5 pb-5">
          {erro && <Notice tone="danger">{erro}</Notice>}
          {resultado ? (
            <>
              <div className="flex items-center gap-2">
                <Badge variant={resultado.status === "concluida" || resultado.status === "objetivo" ? "success" : resultado.status === "falhou" ? "danger" : "warning"}>{resultado.status}</Badge>
                <span className="font-mono text-caption text-text-secondary">em {duracao(resultado.duracaoMs)}</span>
              </div>
              {resultado.erro && <Notice tone="danger">{resultado.erro}</Notice>}
              <ol className="flex flex-col gap-1.5">
                {resultado.passos.map((p) => (
                  <li key={p.id} className="flex items-start gap-2.5 rounded-[14px] bg-raised px-3 py-2 text-small">
                    <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", p.status === "ok" ? "bg-success" : p.status === "falhou" ? "bg-danger" : p.status === "pulado" ? "bg-border-strong" : "bg-warning")} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-text-primary">{nomeDoPasso(p.noId)}</span>
                      <span className="block text-caption text-text-tertiary">
                        {p.status === "ok" && (p.saida as { simulado?: boolean } | null)?.simulado
                          ? "simulado (não mudou nada)"
                          : p.status === "ok" && typeof (p.saida as { status?: unknown } | null)?.status === "number"
                            ? `enviado de verdade · respondeu ${(p.saida as { status: number }).status}`
                            : p.status}
                        {p.caminho && p.caminho !== "proximo" ? ` · ${p.caminho}` : ""}
                        {motivoDoPasso(p) ? ` · ${motivoDoPasso(p)}` : ""}
                      </span>
                    </span>
                    <span className="font-mono text-caption tabular-nums text-text-tertiary">{p.ms ?? "—"} ms</span>
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
              <div className="flex max-h-72 flex-col overflow-y-auto">
                {itens.map((i) => (
                  <button
                    key={i.id}
                    type="button"
                    disabled={rodando}
                    onClick={() => void testar(i.id)}
                    className="flex min-h-11 items-center justify-between gap-2 border-b border-border-subtle px-3 py-2 text-left text-small last:border-b-0 hover:bg-raised disabled:opacity-50"
                  >
                    <span className="truncate text-text-primary">{i.nome}</span>
                    <span className="shrink-0 text-caption text-text-tertiary">{i.detalhe}</span>
                  </button>
                ))}
                {!itens.length && <p className="px-3 py-2 text-small text-text-tertiary">Nenhum registro encontrado.</p>}
              </div>
              {rodando && <p className="text-small text-text-secondary">Rodando o teste...</p>}
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
  // Testar de verdade: painel flutuante sobre o quadro (o fluxo fica à vista).
  const [testeAberto, setTesteAberto] = React.useState(false);
  const [estados, setEstados] = React.useState<Record<string, { estado: EstadoDoNo; ms?: number }> | undefined>();
  // Quantas vezes cada bloco rodou (30 dias) e o último erro: aparece no canvas.
  const [numeros, setNumeros] = React.useState<Record<string, NumerosDoPasso> | undefined>();
  React.useEffect(() => {
    void fetch(`/api/automacoes/${id}/step-stats`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.passos && setNumeros(d.passos))
      .catch(() => {});
  }, [id]);
  const carregado = React.useRef(false);
  // O que está gravado no servidor (rascunho + configurações, serializado).
  // Só salva quando mudou de verdade: abrir a tela, Fast Refresh ou a corrida
  // entre o setTimeout de "carregado" e o primeiro render não escrevem no banco.
  const gravado = React.useRef<string | null>(null);
  const calmo = useReducedMotion();
  const botaoPublicar = React.useRef<HTMLButtonElement>(null);

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
        gravado.current = assinatura(a.rascunho, { nome: a.nome, descricao: a.descricao, reinscricao: a.reinscricao, reinscricaoHoras: a.reinscricaoHoras, objetivo: a.objetivo as Regra | null });
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
    const agora = assinatura(def, config);
    if (agora === gravado.current) return;
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
        gravado.current = agora;
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
      pulsar(botaoPublicar.current, 1.4);
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
    if (r.ok) router.push("/automations");
    else toast({ title: "Não deu para apagar.", tone: "danger" });
  }

  if (erroDeCarga)
    return (
      <div className="flex flex-1 flex-col gap-3 px-4 pb-6 pt-1 lg:px-6">
        <Notice tone="danger">{erroDeCarga}</Notice>
      </div>
    );
  if (!meta || !def || !config)
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-4 pt-1 lg:px-6" aria-busy="true" aria-label="Carregando a automação">
        <div className="h-10 w-72 max-w-full animate-pulse rounded-[14px] bg-raised motion-reduce:animate-none" />
        <div className="min-h-[420px] flex-1 animate-pulse rounded-[18px] bg-raised motion-reduce:animate-none" />
      </div>
    );

  const st = STATUS_DA_AUTOMACAO[meta.status] ?? STATUS_DA_AUTOMACAO.rascunho;
  let ocupado = false;
  try {
    ocupado = inserindo ? !!pontaAlvo(def, inserindo) : false;
  } catch {
    ocupado = false;
  }
  const frase = fraseDaAutomacao(def, nomes);
  const painelDoPasso = !!selecionado && (selecionado === "config" || selecionado === "gatilho" || !!def.nos[selecionado]);
  // Um painel por vez à direita: o "O que vem depois?" ou o do passo.
  const abrirInsercao = (p: Ponta) => {
    setSelecionado(null);
    setInserindo(p);
  };
  const selecionarPasso = (no: string | null) => {
    setInserindo(null);
    setSelecionado(no);
  };

  return (
    <div className="flex min-h-[560px] flex-1 flex-col gap-3 px-4 pb-4 pt-1 lg:px-6">
      {/* Barra do editor: voltar, nome, status e estado do salvamento; à direita
          pendências, Publicar e o resto no "…". Testar, zoom e desfazer/refazer
          moram na barra flutuante do quadro. */}
      <header className="flex flex-col gap-1">
        <div className="flex min-h-10 flex-wrap items-center gap-x-2 gap-y-2">
          <Link
            href="/automations"
            aria-label="Voltar para Automações"
            title="Automações"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-hover hover:text-text-primary"
          >
            <ArrowLeft size={16} aria-hidden="true" />
          </Link>
          <Input
            aria-label="Nome da automação"
            className="h-9 w-72 max-w-full border-transparent bg-transparent px-1.5 text-title-sm font-semibold tracking-tight hover:bg-raised focus:bg-raised"
            value={config.nome}
            onChange={(e) => setConfig({ ...config, nome: e.target.value })}
          />
          <Badge variant={st.variante} dot={st.variante !== "neutral"}>{st.rotulo}</Badge>
          <span className="font-mono text-caption text-text-tertiary">
            {meta.versao !== null && <>versão {meta.versao} · </>}
            {salvo === "salvo" ? (
              <span className="inline-flex items-center gap-1"><Check size={12} aria-hidden="true" /> salvo</span>
            ) : salvo === "erro" ? (
              <span className="text-danger">não salvou</span>
            ) : (
              "salvando..."
            )}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            {erros.length > 0 && (
              <Button type="button" variant="ghost" className="text-danger" onClick={() => selecionarPasso(erros[0].no ?? "gatilho")}>
                <AlertCircle size={14} aria-hidden="true" /> {erros.length} {erros.length === 1 ? "pendência" : "pendências"}
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton aria-label="Mais ações: configurações, pausar, apagar" variant="secondary">
                  <Ellipsis />
                </IconButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onSelect={() => selecionarPasso("config")}>
                  <Settings2 aria-hidden="true" /> Configurações
                </DropdownMenuItem>
                {meta.versao !== null && (
                  <DropdownMenuItem onSelect={() => void pausarOuLigar()}>
                    {meta.status === "ativa" ? <><Pause aria-hidden="true" /> Pausar</> : <><Play aria-hidden="true" /> Ligar</>}
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-danger" onSelect={() => void apagar()}>
                  <Trash2 aria-hidden="true" /> Apagar automação
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button ref={botaoPublicar} type="button" variant="primary" onClick={() => setConfirmar(true)}>
              <Rocket size={14} aria-hidden="true" /> {meta.versao === null ? "Publicar e ligar" : "Publicar alterações"}
            </Button>
          </div>
        </div>
        <p className="truncate pl-10 text-caption text-text-tertiary" title={frase}>
          {frase}
        </p>
      </header>
      {meta.status === "pausada" && meta.pausadaPor && <Notice tone="warning">{meta.pausadaPor}</Notice>}

      {/* O quadro e o painel da direita dividem o mesmo cartão; no celular o painel cobre o quadro. */}
      <div className="relative flex min-h-[420px] flex-1 overflow-hidden rounded-[18px] border border-border-subtle">
        <div className="min-w-0 flex-1">
          <CanvasDaAutomacao
            def={def}
            nomes={nomes}
            pendencias={pendencias}
            selecionado={selecionado}
            selecionar={selecionarPasso}
            inserir={abrirInsercao}
            inserindo={inserindo}
            estados={estados}
            numeros={numeros}
            barra={{
              testar: () => setTesteAberto(true),
              organizar: () => aplicar({ op: "posicionar", posicoes: null }),
              desfazer,
              refazer,
              podeDesfazer: passado.length > 0,
              podeRefazer: futuro.length > 0,
            }}
            posicionar={(noId, x, y) => aplicar({ op: "posicionar", posicoes: { [noId]: { x, y } } })}
            mover={(noId, ponta) => aplicar({ op: "mover", id: noId, ponta })}
          />
          {/* No canto de cima: o fluxo fica à vista enquanto o teste anda. */}
          <div className="pointer-events-none absolute right-4 top-4 z-20">
            <AnimatePresence>
              {testeAberto && (
                <TesteDeVerdade
                  automacaoId={id}
                  def={def}
                  nomeDoPasso={(noId) => (def.nos[noId] ? resumoDoPasso(def, def.nos[noId], nomes).titulo : noId === "gatilho" ? "Gatilho" : noId)}
                  aoMudarEstados={setEstados}
                  fechar={() => setTesteAberto(false)}
                  simular={() => {
                    setTesteAberto(false);
                    setTestando(true);
                  }}
                />
              )}
            </AnimatePresence>
          </div>
        </div>
        {(inserindo || (painelDoPasso && selecionado)) && (
          <motion.aside
            // Troca de conteúdo (outro passo, outro "+") entra de novo, curta e da direita.
            key={inserindo ? `inserir:${inserindo.de}:${inserindo.saida}` : selecionado}
            initial={calmo ? { opacity: 0 } : { opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            transition={MOLA}
            className="absolute inset-y-0 right-0 z-10 w-full max-w-[400px] border-l border-border-subtle bg-panel lg:static lg:w-[380px] lg:max-w-none lg:shrink-0"
          >
            {inserindo ? (
              <PainelDoProximoPasso
                objeto={def.objeto}
                ocupado={ocupado}
                fechar={() => setInserindo(null)}
                escolher={(no, seguintesPor) => {
                  aplicar({ op: "inserir", ponta: inserindo, no, ...(seguintesPor ? { seguintesPor } : {}) });
                  setInserindo(null);
                }}
              />
            ) : selecionado === "config" ? (
              <PainelDeConfiguracoes def={def} config={config} mudar={(c) => setConfig({ ...config, ...c })} opcoes={opcoes} fechar={() => setSelecionado(null)} />
            ) : (
              <PainelDoPasso automacaoId={id} def={def} selecionado={selecionado!} aplicar={aplicar} opcoes={opcoes} nomes={nomes} pendencias={pendencias} fechar={() => setSelecionado(null)} />
            )}
          </motion.aside>
        )}
      </div>

      <FaixaDeExecucoes automacaoId={id} versao={meta.versao} />

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
            <p className="text-small text-text-secondary">{frase}</p>
            {erros.length > 0 ? (
              <Notice tone="danger">
                <span className="block font-medium">Corrija antes de publicar:</span>
                {erros.slice(0, 8).map((p, i) => (
                  <button key={i} type="button" className="block text-left underline-offset-2 hover:underline" onClick={() => { setConfirmar(false); selecionarPasso(p.no ?? "gatilho"); }}>
                    • {p.mensagem}
                  </button>
                ))}
              </Notice>
            ) : (
              <Notice tone="info">Tudo certo para publicar. Quem atender o gatilho a partir de agora entra.</Notice>
            )}
            {pendencias.filter((p) => p.nivel === "aviso").map((p, i) => (
              <p key={i} className="text-caption text-warning">Aviso: {p.mensagem}</p>
            ))}
          </div>
        </ModalContent>
      </Modal>

      <ModalDeTeste aberto={testando} fechar={() => setTestando(false)} automacaoId={id} def={def} objeto={def.objeto} nomes={nomes} aoTerminar={setEstados} />
    </div>
  );
}
