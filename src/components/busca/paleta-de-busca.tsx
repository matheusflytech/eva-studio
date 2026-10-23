"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  Building2,
  CheckSquare,
  Contact,
  Handshake,
  History,
  MessageCircle,
  Plus,
  Send,
  StickyNote,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { LogoOficial, marcaDoCanal } from "@/components/ui/logo-oficial";
import { useAuth } from "@/lib/auth/auth-context";
import { useContrato, useRouter } from "@/lib/contrato/navegacao";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, Kbd } from "@/components/ui/command";
import { Modal, ModalContent } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { QuickAdd } from "@/components/tarefas/quick-add";
import { normalizarConsulta } from "@/lib/busca/consulta";
import { combina, montarGrupos, type IdDaAcao, type ItemDaPaleta } from "@/lib/busca/grupos";
import { chaveDosRecentes, lerRecentes, type Recente } from "@/lib/busca/recentes";
import { RESULTADO_VAZIO, TIPOS_DE_BUSCA, type RegistroEncontrado, type ResultadoDaBusca } from "@/lib/busca/resultado";
import { partesDoTrecho, type Trecho } from "@/lib/busca/trecho";
import {
  ATALHOS_DA_PALETA,
  ATALHOS_DAS_TELAS,
  ATALHOS_GLOBAIS,
  IR_PARA_COM_G,
  ehMac,
  interpretarTecla,
  rotuloDoAtalho,
  type AtalhoDescrito,
  type EstadoDosAtalhos,
} from "@/lib/busca/atalhos";
import { acaoDeUmClique } from "@/lib/tarefas/tipos";
import { contextoDoRegistro, useRegistroEmFocoStore, type RegistroEmFoco } from "./registro-em-foco";

// ---------------------------------------------------------------------------
// Busca global: Ctrl+K (⌘K no Mac) ou o botão "Buscar" do menu. Um só
// componente por contrato (montado em src/app/(app)/[contrato]/layout.tsx),
// que também escuta os atalhos G depois D/N/C/E/T e ? (folha de atalhos).
// Prioridade entre atalhos: src/lib/busca/atalhos.ts.
// ---------------------------------------------------------------------------

const ESPERA_DA_DIGITACAO = 150;

type Modo = "principal" | "etapas" | "atribuir" | "whatsapp" | "tarefa";

interface ApiDaBusca {
  abrir: () => void;
  abrirAtalhos: () => void;
  mac: boolean;
}

const BuscaContexto = React.createContext<ApiDaBusca>({ abrir: () => {}, abrirAtalhos: () => {}, mac: false });

export function useBuscaGlobal(): ApiDaBusca {
  return React.useContext(BuscaContexto);
}

const nenhumaInscricao = () => () => {};
/** ⌘ no Mac, Ctrl no resto. No servidor (e na 1ª pintura) vale Ctrl. */
function useMac(): boolean {
  return React.useSyncExternalStore(
    nenhumaInscricao,
    () => ehMac(navigator.platform || navigator.userAgent),
    () => false
  );
}

const ehCampo = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));

export function BuscaGlobal({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const contrato = useContrato();
  const { session } = useAuth();
  const toast = useToast();
  const mac = useMac();

  const [aberta, setAberta] = React.useState(false);
  const [folha, setFolha] = React.useState(false);
  const [consulta, setConsulta] = React.useState("");
  const [modo, setModo] = React.useState<Modo>("principal");
  const [resultado, setResultado] = React.useState<ResultadoDaBusca | null>(null);
  const [buscando, setBuscando] = React.useState(false);
  const [recentes, setRecentes] = React.useState<Recente[]>([]);
  const [membros, setMembros] = React.useState<{ id: string; name: string }[] | null>(null);
  const [tarefaDoRegistro, setTarefaDoRegistro] = React.useState(false);
  const registro = useRegistroEmFocoStore((s) => s.registro);

  const temporizador = React.useRef<number | undefined>(undefined);
  const controle = React.useRef<AbortController | null>(null);
  const atalhos = React.useRef<EstadoDosAtalhos>({ gDesde: null });

  const userId = session?.userId ?? null;
  const permissoesDaSessao = session?.permissoes;
  const permissoes = React.useMemo(() => permissoesDaSessao ?? [], [permissoesDaSessao]);

  const cancelarBusca = React.useCallback(() => {
    window.clearTimeout(temporizador.current);
    controle.current?.abort();
    controle.current = null;
  }, []);

  const abrir = React.useCallback(() => {
    let armazenamento: Storage | null = null;
    try {
      armazenamento = window.localStorage;
    } catch {
      /* bloqueado */
    }
    setRecentes(contrato && userId ? lerRecentes(armazenamento, chaveDosRecentes(contrato, userId)) : []);
    cancelarBusca();
    setConsulta("");
    setResultado(null);
    setBuscando(false);
    setModo("principal");
    setAberta(true);
  }, [contrato, userId, cancelarBusca]);

  const fechar = React.useCallback(() => {
    cancelarBusca();
    setBuscando(false);
    setAberta(false);
  }, [cancelarBusca]);

  // Atalhos globais. Captura na janela: roda antes dos ouvintes das telas, e
  // tecla consumida (G depois N) não chega até elas.
  const alternar = React.useRef(() => {});
  React.useEffect(() => {
    alternar.current = () => (aberta ? fechar() : abrir());
  });
  React.useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      const r = interpretarTecla(
        atalhos.current,
        {
          key: e.key,
          ctrl: e.ctrlKey,
          meta: e.metaKey,
          alt: e.altKey,
          repeat: e.repeat,
          emCampo: ehCampo(e.target),
          dialogoAberto: !!document.querySelector("[role='dialog']:not([aria-modal='false']), [role='alertdialog']"),
        },
        Date.now()
      );
      atalhos.current = r.estado;
      if (r.consumir) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (!r.acao) return;
      if (r.acao.tipo === "paleta") alternar.current();
      else if (r.acao.tipo === "folha") setFolha(true);
      else router.push(r.acao.caminho);
    }
    window.addEventListener("keydown", aoTeclar, true);
    return () => window.removeEventListener("keydown", aoTeclar, true);
  }, [router]);

  // ── Busca no servidor: espera 150 ms parado e cancela a anterior ──
  function buscar(texto: string, emModo: Modo) {
    cancelarBusca();
    const c = normalizarConsulta(texto);
    if (c.vazia || (emModo !== "principal" && emModo !== "whatsapp")) {
      setResultado(null);
      setBuscando(false);
      return;
    }
    setBuscando(true);
    temporizador.current = window.setTimeout(async () => {
      const ac = new AbortController();
      controle.current = ac;
      const tipos = emModo === "whatsapp" ? "contatos" : TIPOS_DE_BUSCA.join(",");
      try {
        const res = await fetch(`/api/busca?q=${encodeURIComponent(c.bruta)}&tipos=${tipos}`, { signal: ac.signal });
        if (!res.ok) throw new Error(String(res.status));
        const dados = (await res.json()) as ResultadoDaBusca;
        if (controle.current !== ac) return;
        setResultado(dados);
      } catch {
        if (ac.signal.aborted) return;
        setResultado({ ...RESULTADO_VAZIO, avisos: ["Não foi possível buscar agora. Tente de novo."] });
      }
      if (controle.current === ac) setBuscando(false);
    }, ESPERA_DA_DIGITACAO);
  }

  function aoDigitar(texto: string) {
    setConsulta(texto);
    buscar(texto, modo);
  }

  function trocarModo(novo: Modo) {
    setModo(novo);
    setConsulta("");
    setResultado(null);
    cancelarBusca();
    setBuscando(false);
  }

  function ir(caminho: string) {
    fechar();
    router.push(caminho);
  }

  function abrirWhatsApp(c: { telefone?: string | null; conversaId?: string | null } | null | undefined) {
    const a = c ? acaoDeUmClique("whatsapp", { telefone: c.telefone, conversaId: c.conversaId }) : null;
    if (!a) {
      toast({ title: "Este contato não tem telefone nem conversa de WhatsApp.", tone: "danger" });
      return;
    }
    fechar();
    if (a.externo) window.open(a.href, "_blank", "noopener,noreferrer");
    else router.push(a.href);
  }

  function executarAcao(acao: IdDaAcao, doRegistro: boolean) {
    switch (acao) {
      case "criar-negocio":
        // Carimbo novo a cada pedido: a tela abre o "novo negócio" uma vez por carimbo.
        return ir(`/negocios?novo=${Date.now()}`);
      case "criar-contato":
        return ir(`/contatos?novo=${Date.now()}`);
      case "criar-tarefa":
        setTarefaDoRegistro(doRegistro);
        return trocarModo("tarefa");
      case "enviar-whatsapp":
        return doRegistro ? abrirWhatsApp(registro?.whatsapp) : trocarModo("whatsapp");
      case "mudar-etapa":
        return trocarModo("etapas");
      case "atribuir":
        if (!registro?.membros && membros === null) {
          fetch("/api/members")
            .then((r) => (r.ok ? r.json() : { members: [] }))
            .then((d) => setMembros((d.members ?? []).map((m: { id: string; name: string }) => ({ id: m.id, name: m.name }))))
            .catch(() => setMembros([]));
        }
        return trocarModo("atribuir");
    }
  }

  function executar(item: ItemDaPaleta) {
    if (item.tipo === "acao") return executarAcao(item.acao, item.doRegistro);
    if (item.tipo === "pagina") return ir(item.caminho);
    if (item.tipo === "registro") return ir(item.registro.caminho);
    if (item.tipo === "recente") return ir(item.recente.caminho);
    return ir(item.trecho.caminho);
  }

  const api = React.useMemo<ApiDaBusca>(() => ({ abrir, abrirAtalhos: () => setFolha(true), mac }), [abrir, mac]);

  return (
    <BuscaContexto.Provider value={api}>
      {children}
      <Dialog.Root open={aberta} onOpenChange={(v) => (v ? abrir() : fechar())}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-backdrop data-[state=open]:animate-[ds-fade-in_160ms_var(--ease-standard)]" />
          <Dialog.Content
            aria-describedby={undefined}
            data-busca-global=""
            onEscapeKeyDown={(e) => {
              // Num submenu (etapas, responsável…), Esc volta; no principal, fecha.
              if (modo !== "principal") {
                e.preventDefault();
                trocarModo("principal");
              }
            }}
            className="fixed left-1/2 top-[20vh] z-50 flex w-[calc(100vw-2rem)] max-w-[640px] -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-border-default bg-overlay shadow-overlay outline-none data-[state=open]:animate-[ds-fade-in_200ms_var(--ease-standard)]"
          >
            <Dialog.Title className="sr-only">Buscar no Eva</Dialog.Title>
            {modo === "tarefa" ? (
              <CorpoDaTarefa
                registro={tarefaDoRegistro ? registro : null}
                onVoltar={() => trocarModo("principal")}
                onCriada={fechar}
              />
            ) : (
              <CorpoDaPaleta
                modo={modo}
                consulta={consulta}
                aoDigitar={aoDigitar}
                onVoltar={() => trocarModo("principal")}
                buscando={buscando}
                resultado={resultado}
                registro={registro}
                membros={registro?.membros ?? membros}
                permissoes={permissoes}
                recentes={recentes}
                mac={mac}
                onExecutar={executar}
                onEtapa={(id) => {
                  fechar();
                  registro?.aoMudarEtapa?.(id);
                }}
                onAtribuir={(id) => {
                  fechar();
                  registro?.aoAtribuir?.(id);
                }}
                onWhatsApp={(c) => abrirWhatsApp(c)}
                onAtalhos={() => {
                  fechar();
                  setFolha(true);
                }}
              />
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <FolhaDeAtalhos aberta={folha} onFechar={() => setFolha(false)} mac={mac} />
    </BuscaContexto.Provider>
  );
}

// ── Corpo da paleta ──────────────────────────────────────────────────────────

const ICONE_DA_ACAO: Record<IdDaAcao, LucideIcon> = {
  "criar-negocio": Plus,
  "criar-contato": Plus,
  "criar-tarefa": CheckSquare,
  "enviar-whatsapp": Send,
  "mudar-etapa": ArrowRightLeft,
  atribuir: UserRound,
};
const ICONE_DO_REGISTRO = { negocio: Handshake, contato: Contact, empresa: Building2 } as const;

const PLACEHOLDER: Record<Exclude<Modo, "tarefa">, string> = {
  principal: "Buscar negócios, contatos, empresas, telefone, CNPJ… ou digite uma ação",
  etapas: "Mudar para qual etapa?",
  atribuir: "Atribuir a quem?",
  whatsapp: "Enviar WhatsApp para quem? (nome ou telefone)",
};

function CorpoDaPaleta(p: {
  modo: Exclude<Modo, "tarefa">;
  consulta: string;
  aoDigitar: (t: string) => void;
  onVoltar: () => void;
  buscando: boolean;
  resultado: ResultadoDaBusca | null;
  registro: RegistroEmFoco | null;
  membros: { id: string; name: string }[] | null;
  permissoes: readonly string[];
  recentes: Recente[];
  mac: boolean;
  onExecutar: (item: ItemDaPaleta) => void;
  onEtapa: (id: string) => void;
  onAtribuir: (id: string | null) => void;
  onWhatsApp: (c: RegistroEncontrado) => void;
  onAtalhos: () => void;
}) {
  const { termos, vazia } = normalizarConsulta(p.consulta);
  const filtro = vazia ? [] : termos;

  const grupos = React.useMemo(
    () =>
      p.modo === "principal"
        ? montarGrupos({
            consulta: p.consulta,
            permissoes: p.permissoes,
            contexto: contextoDoRegistro(p.registro),
            resultados: p.resultado,
            recentes: p.recentes,
          })
        : [],
    [p.modo, p.consulta, p.permissoes, p.registro, p.resultado, p.recentes]
  );

  let conteudo: React.ReactNode;
  let total = 0;
  if (p.modo === "principal") {
    total = grupos.reduce((n, g) => n + g.itens.length, 0);
    conteudo = grupos.map((g) => (
      <CommandGroup key={g.id} heading={g.titulo}>
        {g.itens.map((item) => (
          <CommandItem key={item.chave} value={item.chave} onSelect={() => p.onExecutar(item)}>
            <LinhaDoItem item={item} />
          </CommandItem>
        ))}
      </CommandGroup>
    ));
  } else if (p.modo === "etapas") {
    const etapas = (p.registro?.etapas ?? []).filter((e) => e.id !== p.registro?.etapaAtualId && combina(e.nome, filtro));
    total = etapas.length;
    conteudo = (
      <CommandGroup heading={p.registro ? `Mudar etapa de ${p.registro.titulo}` : "Etapas"}>
        {etapas.map((e) => (
          <CommandItem key={e.id} value={`etapa:${e.id}`} onSelect={() => p.onEtapa(e.id)}>
            <ArrowRightLeft size={16} aria-hidden />
            <span className="truncate">{e.nome}</span>
            {e.tipo !== "open" && (
              <span className="ml-auto text-caption text-text-tertiary">{e.tipo === "won" ? "Ganho" : "Perdido"}</span>
            )}
          </CommandItem>
        ))}
      </CommandGroup>
    );
  } else if (p.modo === "atribuir") {
    const lista = [{ id: "", name: "Sem responsável" }, ...(p.membros ?? [])].filter(
      (m) => m.id !== (p.registro?.donoAtualId ?? "") && combina(m.name, filtro)
    );
    total = lista.length;
    conteudo = (
      <CommandGroup heading={p.registro ? `Responsável por ${p.registro.titulo}` : "Responsável"}>
        {p.membros === null && <p className="px-2 py-2 text-small text-text-secondary">Carregando a equipe…</p>}
        {lista.map((m) => (
          <CommandItem key={m.id || "ninguem"} value={`membro:${m.id || "ninguem"}`} onSelect={() => p.onAtribuir(m.id || null)}>
            <UserRound size={16} aria-hidden />
            <span className="truncate">{m.name}</span>
          </CommandItem>
        ))}
      </CommandGroup>
    );
  } else {
    const contatos = p.resultado?.contatos ?? [];
    total = contatos.length;
    conteudo = contatos.length ? (
      <CommandGroup heading="Contatos">
        {contatos.map((c) => (
          <CommandItem key={c.id} value={`whatsapp:${c.id}`} onSelect={() => p.onWhatsApp(c)}>
            <LogoOficial marca="whatsapp" tamanho={16} />
            <TituloESubtitulo titulo={c.titulo} subtitulo={c.subtitulo} />
          </CommandItem>
        ))}
      </CommandGroup>
    ) : null;
  }

  const avisos = p.modo === "principal" || p.modo === "whatsapp" ? (p.resultado?.avisos ?? []) : [];

  return (
    <Command shouldFilter={false} loop label="Buscar no Eva" className="rounded-xl">
      <CommandInput
        value={p.consulta}
        onValueChange={p.aoDigitar}
        placeholder={PLACEHOLDER[p.modo]}
        onKeyDown={(e) => {
          // Backspace com o campo vazio volta do submenu.
          if (e.key === "Backspace" && !p.consulta && p.modo !== "principal") {
            e.preventDefault();
            p.onVoltar();
          }
        }}
        antes={
          p.modo !== "principal" ? (
            <button
              type="button"
              onClick={p.onVoltar}
              aria-label="Voltar"
              className="-ml-1 flex size-7 shrink-0 items-center justify-center rounded-md text-text-tertiary hover:bg-hover hover:text-text-primary"
            >
              <ArrowLeft size={16} aria-hidden />
            </button>
          ) : undefined
        }
        depois={<Kbd>Esc</Kbd>}
      />
      <CommandList>
        {conteudo}
        {total === 0 && !p.buscando && (
          <CommandEmpty>
            {p.modo === "whatsapp" && vazia
              ? "Digite o nome ou o telefone do contato."
              : p.consulta.trim()
                ? `Nada encontrado para “${p.consulta.trim()}”.`
                : "Nada por aqui."}
          </CommandEmpty>
        )}
      </CommandList>
      <div className="flex h-9 shrink-0 items-center gap-3 border-t border-border-subtle px-3 text-caption text-text-tertiary">
        <span aria-live="polite" className="min-w-0 flex-1 truncate">
          {p.buscando ? "Buscando…" : (avisos[0] ?? "")}
        </span>
        <span className="hidden items-center gap-1 sm:inline-flex">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> escolher
        </span>
        <span className="hidden items-center gap-1 sm:inline-flex">
          <Kbd>Enter</Kbd> abrir
        </span>
        <button type="button" onClick={p.onAtalhos} className="inline-flex items-center gap-1 rounded-sm hover:text-text-primary">
          <Kbd>?</Kbd> atalhos
        </button>
      </div>
    </Command>
  );
}

function TituloESubtitulo({ titulo, subtitulo, extra }: { titulo: string; subtitulo?: string; extra?: React.ReactNode }) {
  return (
    <span className="flex min-w-0 flex-1 items-baseline gap-2">
      <span className="truncate">{titulo}</span>
      {subtitulo && <span className="min-w-0 truncate text-caption text-text-tertiary">{subtitulo}</span>}
      {extra}
    </span>
  );
}

function TextoComDestaque({ trecho }: { trecho: Trecho }) {
  return (
    <>
      {partesDoTrecho(trecho).map((parte, i) =>
        parte.marcado ? (
          <mark key={i} className="rounded-sm bg-accent-subtle px-0.5 font-medium text-accent-fg">
            {parte.texto}
          </mark>
        ) : (
          <React.Fragment key={i}>{parte.texto}</React.Fragment>
        )
      )}
    </>
  );
}

const ATALHO_DA_PAGINA = new Map(Object.entries(IR_PARA_COM_G).map(([k, d]) => [d.caminho, k.toUpperCase()]));

function LinhaDoItem({ item }: { item: ItemDaPaleta }) {
  if (item.tipo === "acao") {
    const Icone = ICONE_DA_ACAO[item.acao];
    return (
      <>
        {item.acao === "enviar-whatsapp" ? <LogoOficial marca="whatsapp" tamanho={16} /> : <Icone size={16} aria-hidden />}
        <span className="truncate">{item.rotulo}</span>
      </>
    );
  }
  if (item.tipo === "pagina") {
    const tecla = ATALHO_DA_PAGINA.get(item.caminho);
    return (
      <>
        <ArrowRight size={16} aria-hidden />
        <span className="truncate">{item.rotulo}</span>
        {tecla && (
          <span className="ml-auto flex items-center gap-1" aria-label={`Atalho G depois ${tecla}`}>
            <Kbd>G</Kbd>
            <Kbd>{tecla}</Kbd>
          </span>
        )}
      </>
    );
  }
  if (item.tipo === "registro") {
    const Icone = ICONE_DO_REGISTRO[item.registro.tipo];
    return (
      <>
        <Icone size={16} aria-hidden />
        <TituloESubtitulo
          titulo={item.registro.titulo}
          subtitulo={item.registro.subtitulo}
          extra={item.registro.aproximado ? <span className="ml-auto shrink-0 text-caption text-text-tertiary">parecido</span> : null}
        />
      </>
    );
  }
  if (item.tipo === "recente") {
    return (
      <>
        <History size={16} aria-hidden />
        <TituloESubtitulo titulo={item.recente.titulo} subtitulo={item.recente.subtitulo} />
      </>
    );
  }
  const Icone = item.trecho.tipo === "nota" ? StickyNote : MessageCircle;
  // Mensagem: o título começa pelo canal ("WhatsApp · Maria"); com marca, mostra o logo oficial.
  const marca = item.trecho.tipo === "mensagem" ? marcaDoCanal(item.trecho.titulo.split(" · ")[0]) : null;
  return (
    <>
      {marca ? <LogoOficial marca={marca} tamanho={16} /> : <Icone size={16} aria-hidden />}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-caption text-text-tertiary">{item.trecho.titulo}</span>
        <span className="truncate">
          <TextoComDestaque trecho={item.trecho.trecho} />
        </span>
      </span>
    </>
  );
}

// ── Criar tarefa (quick add do item 3) ───────────────────────────────────────

function CorpoDaTarefa({
  registro,
  onVoltar,
  onCriada,
}: {
  registro: RegistroEmFoco | null;
  onVoltar: () => void;
  onCriada: () => void;
}) {
  const campo = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    campo.current?.focus();
  }, []);
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onVoltar}
          aria-label="Voltar"
          className="-ml-1 flex size-7 items-center justify-center rounded-md text-text-tertiary hover:bg-hover hover:text-text-primary"
        >
          <ArrowLeft size={16} aria-hidden />
        </button>
        <p className="text-small font-medium text-text-primary">
          {registro ? `Nova tarefa · ${registro.titulo}` : "Nova tarefa"}
        </p>
      </div>
      <QuickAdd
        ref={campo}
        onCriada={onCriada}
        dealId={registro?.tarefa?.dealId}
        contactId={registro?.tarefa?.contactId}
        placeholder="“ligar João amanhã 14h”, “whatsapp Maria sexta 10h”…"
      />
    </div>
  );
}

// ── Folha de atalhos (?) ─────────────────────────────────────────────────────

function FolhaDeAtalhos({ aberta, onFechar, mac }: { aberta: boolean; onFechar: () => void; mac: boolean }) {
  return (
    <Modal open={aberta} onOpenChange={(v) => !v && onFechar()}>
      {aberta && (
        <ModalContent title="Atalhos de teclado" size="md">
          <div className="flex flex-col gap-4">
            <SecaoDeAtalhos titulo="Em qualquer tela" atalhos={ATALHOS_GLOBAIS} mac={mac} />
            <SecaoDeAtalhos titulo="Nas telas" atalhos={ATALHOS_DAS_TELAS} mac={mac} />
            <SecaoDeAtalhos titulo="Na busca" atalhos={ATALHOS_DA_PALETA} mac={mac} />
            <p className="text-caption text-text-tertiary">
              Letras soltas não valem enquanto você digita num campo. “G depois N” vai para Negócios mesmo na tela de
              Negócios (o N sozinho continua criando um negócio).
            </p>
          </div>
        </ModalContent>
      )}
    </Modal>
  );
}

function SecaoDeAtalhos({ titulo, atalhos, mac }: { titulo: string; atalhos: AtalhoDescrito[]; mac: boolean }) {
  return (
    <section>
      <h3 className="mb-1 text-caption font-medium text-text-tertiary">{titulo}</h3>
      <ul className="flex flex-col">
        {atalhos.map((a) => (
          <li key={a.teclas.join("+") + a.descricao} className="flex h-9 items-center gap-3 border-b border-border-subtle text-small last:border-b-0">
            <span className="min-w-0 flex-1 truncate">
              {a.descricao}
              {a.onde && <span className="text-text-tertiary"> · {a.onde}</span>}
            </span>
            <TeclasDoAtalho teclas={a.teclas} mac={mac} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** ⌘K / Ctrl K / G depois N, em teclas. */
export function TeclasDoAtalho({ teclas, mac }: { teclas: string[]; mac: boolean }) {
  const rotulo = rotuloDoAtalho(teclas, mac);
  if (teclas[0] === "mod") {
    return (
      <span className="flex items-center gap-1" aria-label={rotulo}>
        <Kbd>{mac ? "⌘" : "Ctrl"}</Kbd>
        {teclas.slice(1).map((t) => (
          <Kbd key={t}>{t}</Kbd>
        ))}
      </span>
    );
  }
  const sequencia = rotulo.includes(" depois ");
  return (
    <span className="flex items-center gap-1 text-caption text-text-tertiary" aria-label={rotulo}>
      {teclas.map((t, i) => (
        <React.Fragment key={t + i}>
          {i > 0 && sequencia && <span>depois</span>}
          <Kbd>{t}</Kbd>
        </React.Fragment>
      ))}
    </span>
  );
}
