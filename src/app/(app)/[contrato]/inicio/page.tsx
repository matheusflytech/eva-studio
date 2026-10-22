"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { ArrowRight, Check, ChevronRight, MessageSquare, Minus, Pencil, Plus, Search, SquareCheck, Workflow, Bot } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useBuscaGlobal } from "@/components/busca/paleta-de-busca";
import { FundoVivo } from "@/components/layout/fundo-vivo";
import { OrbeEva } from "@/components/layout/orbe-eva";
import { iniciais } from "@/components/inbox/tipos";
import { buttonVariants } from "@/components/ui/button";
import { avisarNaIlha, pulsar } from "@/lib/fundo/eventos";
import { cn, formatRelativeDate } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Início.
//
// Boas-vindas de verdade e só o que pede ação: quem espera, o que vence hoje e
// três atalhos. O resto vira bloco que cada pessoa liga ou desliga em
// "Personalizar" (fica salvo no navegador dela). Todo número sai do banco
// (/api/inicio); o resumo do dia é montado com esses mesmos números.
// ---------------------------------------------------------------------------

interface Pendencia {
  id: string;
  tipo: "urgente" | "atencao" | "config";
  titulo: string;
  detalhe: string;
  href: string;
  quantidade?: number;
}

interface AgenteResumo {
  id: string;
  nome: string;
  status: string;
  temFluxo: boolean;
  atualizadoEm: string;
}

interface Payload {
  onboardingPendente?: boolean;
  pendencias: Pendencia[];
  resumo: { agentes: number; conversas7d: number; tudoEmDia: boolean };
  agentes: AgenteResumo[];
}

type IdDoBloco = "agentes" | "ajustes" | "atalhos";
const BLOCOS: { id: IdDoBloco; rotulo: string; Icone: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { id: "atalhos", rotulo: "Atalhos", Icone: ArrowRight },
  { id: "agentes", rotulo: "Seus agentes", Icone: Bot },
  { id: "ajustes", rotulo: "Ajustes pendentes", Icone: Workflow },
];
const PADRAO: IdDoBloco[] = ["atalhos", "agentes"];
const CHAVE = "eva.inicio.blocos";

function lerBlocos(): IdDoBloco[] {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE) ?? "null");
    if (Array.isArray(v)) return v.filter((b): b is IdDoBloco => BLOCOS.some((x) => x.id === b));
  } catch {
    // armazenamento bloqueado: usa o padrão
  }
  return PADRAO;
}

function saudacao(h: number) {
  return h < 12 ? "Bom dia," : h < 18 ? "Boa tarde," : "Boa noite,";
}

/** Duas frases com o que mais importa hoje, a partir das pendências. */
function resumoDoDia(p: Pendencia[], conversas7d: number): string {
  const acao = p.filter((x) => x.tipo !== "config").slice(0, 2).map((x) => x.titulo.replace(/\.$/, ""));
  if (acao.length === 0) return `Tudo em dia. ${conversas7d} ${conversas7d === 1 ? "conversa" : "conversas"} nos últimos 7 dias.`;
  return acao.join(". ") + ".";
}

export default function InicioPage() {
  const { session } = useAuth();
  const { abrir } = useBuscaGlobal();
  const [dados, setDados] = React.useState<Payload | null>(null);
  const [carregando, setCarregando] = React.useState(true);
  const [blocos, setBlocos] = React.useState<IdDoBloco[]>(PADRAO);
  const [editando, setEditando] = React.useState(false);
  const [hora, setHora] = React.useState(9);
  const [falando, setFalando] = React.useState(false);

  React.useEffect(() => {
    setBlocos(lerBlocos());
    setHora(new Date().getHours());
    fetch("/api/inicio")
      .then((r) => r.json())
      .then((d) => setDados(d.error ? null : d))
      .catch(() => setDados(null))
      .finally(() => setCarregando(false));
  }, []);

  // A esfera "fala" enquanto o resumo aparece.
  React.useEffect(() => {
    if (!dados) return;
    setFalando(true);
    const t = setTimeout(() => setFalando(false), 2600);
    return () => clearTimeout(t);
  }, [dados]);

  function guardar(novos: IdDoBloco[]) {
    setBlocos(novos);
    try {
      localStorage.setItem(CHAVE, JSON.stringify(novos));
    } catch {
      // sem armazenamento: vale só nesta visita
    }
  }

  function tirar(id: IdDoBloco) {
    const antes = blocos;
    guardar(blocos.filter((b) => b !== id));
    avisarNaIlha({ titulo: "Bloco tirado do Início", detalhe: BLOCOS.find((b) => b.id === id)?.rotulo, acao: { rotulo: "Desfazer", aoClicar: () => guardar(antes) } });
  }

  function por(id: IdDoBloco, el: HTMLElement) {
    guardar([...blocos, id]);
    pulsar(el, 1.6);
  }

  const primeiroNome = session?.name?.split(" ")[0] ?? "";
  const pendencias = dados?.pendencias ?? [];
  const agora = pendencias.filter((p) => p.tipo !== "config").slice(0, 3);
  const ajustes = pendencias.filter((p) => p.tipo === "config");
  const semAgente = !!dados && dados.resumo.agentes === 0;
  const comecar = !!dados?.onboardingPendente;
  const fora = BLOCOS.filter((b) => !blocos.includes(b.id));

  return (
    <div className="relative -mt-11 flex flex-1 flex-col gap-4 pb-6">
      {/* Topo iridescente com as curvas vivas por cima, como uma tela de boas-vindas. */}
      <section className="heroi-iridescente relative flex min-h-[300px] shrink-0 flex-col overflow-hidden rounded-b-[34px] px-7 pb-5 pt-16 text-[#121214]">
        <FundoVivo escuro={false} forca={3.2} niveis={14} className="pointer-events-none absolute inset-0 h-full w-full mix-blend-multiply" />
        <div className="relative flex items-start gap-3">
          <h1 className="min-w-0 text-[30px] font-light leading-[1.08] tracking-[-0.035em] sm:text-[38px]">
            {saudacao(hora)}
            <b className="block font-bold">{primeiroNome ? `${primeiroNome}!` : "bem-vindo!"}</b>
          </h1>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {!semAgente && !comecar && (
              <button
                type="button"
                onClick={() => setEditando((v) => !v)}
                aria-label={editando ? "Pronto" : "Personalizar"}
                className="inline-flex h-[38px] items-center gap-2 rounded-full bg-[#121214] px-3 text-small font-semibold text-[#f2f2f4] sm:px-4"
              >
                {editando ? <Check size={15} /> : <Pencil size={15} />}
                <span className="hidden sm:inline">{editando ? "Pronto" : "Personalizar"}</span>
              </button>
            )}
            <button type="button" onClick={abrir} aria-label="Buscar" className="hidden h-[38px] w-[38px] place-items-center rounded-full bg-[#121214] text-[#f2f2f4] sm:grid">
              <Search size={16} />
            </button>
            <span className="hidden h-[38px] w-[38px] place-items-center rounded-full bg-white/60 text-small font-semibold sm:grid">{iniciais(session?.name ?? "") || "?"}</span>
          </div>
        </div>

        <div className="relative mt-auto grid gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-1.5 rounded-[22px] bg-[#121214] px-5 py-4 text-[#f2f2f4]">
            <span className="text-small text-[#a8a8ad]">Conversas nos últimos 7 dias</span>
            <b className="self-end text-[34px] font-medium leading-none tracking-[-0.035em] tabular-nums">{dados ? dados.resumo.conversas7d : "—"}</b>
          </div>
          <div className="flex items-center gap-1.5 rounded-[22px] bg-[#121214]/90 py-2.5 pl-1 pr-5 text-[#f2f2f4]">
            <OrbeEva falando={falando} className="-my-4 -mr-2 h-[116px] w-[116px] shrink-0 cursor-pointer" />
            <span className="flex min-w-0 flex-col gap-1">
              <span className="font-mono text-caption text-[#8a8a90]">Eva · resumo do dia</span>
              <span className="text-small leading-snug text-[#d6d6da]">
                {carregando ? "Vendo o que precisa de você…" : comecar ? "Vamos montar o seu CRM: funil, campos e WhatsApp em um minuto." : semAgente ? "Nada por aqui ainda. Comece criando um agente." : resumoDoDia(pendencias, dados?.resumo.conversas7d ?? 0)}
              </span>
            </span>
          </div>
        </div>
      </section>

      {(comecar || semAgente) && (
        <div className="px-6">
          {comecar ? (
            <Link href="/comecar" className={buttonVariants({ variant: "solid", size: "lg" })}>
              Montar o meu CRM <ArrowRight size={15} />
            </Link>
          ) : (
            <Link href="/agent-studio/new" className={buttonVariants({ variant: "solid", size: "lg" })}>
              <Plus size={15} /> Criar o primeiro agente
            </Link>
          )}
        </div>
      )}

      {!carregando && !semAgente && !comecar && (
        <div className="grid gap-4 px-6 lg:grid-cols-2">
          <div className="flex flex-col gap-3">
            {/* Só o que pede ação agora. */}
            <div className={cn("rounded-[20px] border border-border-subtle bg-panel px-5", editando && "motion-safe:animate-[eva-tremer_.32s_ease-in-out_infinite_alternate]")}>
              {agora.length === 0 ? (
                <p className="flex h-[52px] items-center gap-2 text-small text-text-secondary">
                  <Check size={15} className="text-success" /> Nada pedindo você agora.
                </p>
              ) : (
                agora.map((p, i) => (
                  <Link key={p.id} href={p.href} className={cn("flex h-[52px] items-center gap-3 text-small text-text-secondary hover:text-text-primary", i > 0 && "border-t border-border-subtle")}>
                    <span className="min-w-0 flex-1 truncate">{p.titulo.replace(/^\d+\s*/, "").replace(/^Uma\s/, "")}</span>
                    <b className={cn("inline-flex items-center gap-2 font-semibold tabular-nums", p.tipo === "urgente" ? "text-danger" : "text-text-primary")}>
                      {p.quantidade ?? 1}
                      <ChevronRight size={14} className="text-text-tertiary" />
                    </b>
                  </Link>
                ))
              )}
            </div>
            {blocos.includes("atalhos") && (
              <Bloco editando={editando} onTirar={() => tirar("atalhos")} semMoldura>
                <div className="grid grid-cols-3 gap-2.5">
                  <Atalho href="/negocios" rotulo="Criar" titulo="Negócio" Icone={Plus} />
                  <Atalho href="/conversas" rotulo="Abrir" titulo="Conversas" Icone={MessageSquare} />
                  <Atalho href="/tarefas" rotulo="Ver" titulo="Tarefas" Icone={SquareCheck} />
                </div>
              </Bloco>
            )}
          </div>

          <div className="flex flex-col gap-3">
            {blocos.includes("agentes") && dados && dados.agentes.length > 0 && (
              <Bloco editando={editando} onTirar={() => tirar("agentes")} titulo="Seus agentes" extra={`${dados.agentes.length}`}>
                {dados.agentes.slice(0, 3).map((a) => (
                  <Link key={a.id} href={`/agent-studio/${a.id}`} className="flex h-11 items-center gap-3 border-t border-border-subtle text-small first:border-t-0">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-inverse text-caption font-semibold text-inverse-fg">{a.nome.charAt(0).toUpperCase()}</span>
                    <span className="min-w-0 flex-1 truncate font-medium text-text-primary">{a.nome}</span>
                    <span className="font-mono text-caption text-text-tertiary">{a.temFluxo ? `editado ${formatRelativeDate(a.atualizadoEm)}` : "sem fluxo"}</span>
                  </Link>
                ))}
              </Bloco>
            )}
            {blocos.includes("ajustes") && (
              <Bloco editando={editando} onTirar={() => tirar("ajustes")} titulo="Ajustes pendentes" extra={`${ajustes.length}`}>
                {ajustes.length === 0 ? (
                  <p className="text-small text-text-tertiary">Nenhum agente travado.</p>
                ) : (
                  ajustes.slice(0, 3).map((p) => (
                    <Link key={p.id} href={p.href} className="flex h-11 items-center gap-3 border-t border-border-subtle text-small first:border-t-0">
                      <span className="min-w-0 flex-1 truncate text-text-primary">{p.titulo}</span>
                      <ChevronRight size={14} className="text-text-tertiary" />
                    </Link>
                  ))
                )}
              </Bloco>
            )}
          </div>
        </div>
      )}

      {/* Folha de "Personalizar": os blocos que estão fora do Início. */}
      {editando && (
        <div className="sticky bottom-4 z-20 mx-6 rounded-[26px] border border-border-subtle bg-overlay/90 p-4 shadow-overlay backdrop-blur-xl motion-safe:animate-[ds-pop-in_300ms_var(--ease-standard)]">
          <div className="mb-3 flex items-center">
            <p className="text-body font-semibold text-text-primary">Adicionar ao Início</p>
            <button type="button" onClick={() => setEditando(false)} className="ml-auto text-small font-medium text-accent-fg">
              Pronto
            </button>
          </div>
          {fora.length === 0 ? (
            <p className="text-small text-text-tertiary">Todos os blocos já estão no Início. Toque no "−" de um bloco para tirar.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {fora.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={(e) => por(b.id, e.currentTarget)}
                  className="flex flex-col gap-3 rounded-2xl border border-border-subtle bg-raised p-3 text-left text-small text-text-primary hover:bg-hover"
                >
                  <b.Icone size={15} className="text-text-secondary" />
                  {b.rotulo}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Bloco({
  titulo, extra, editando, onTirar, semMoldura, children,
}: {
  titulo?: string;
  extra?: string;
  editando: boolean;
  onTirar: () => void;
  semMoldura?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "relative",
        !semMoldura && "rounded-[20px] border border-border-subtle bg-panel px-5 py-4",
        editando && "motion-safe:animate-[eva-tremer_.32s_ease-in-out_infinite_alternate]"
      )}
    >
      {editando && (
        <button
          type="button"
          onClick={onTirar}
          aria-label={`Tirar ${titulo ?? "bloco"} do Início`}
          className="absolute -left-2 -top-2 z-10 grid h-6 w-6 place-items-center rounded-full bg-inverse text-inverse-fg shadow-overlay"
        >
          <Minus size={12} strokeWidth={2.6} />
        </button>
      )}
      {titulo && (
        <h2 className="mb-2 flex items-center text-body font-medium text-text-primary">
          {titulo}
          {extra && <span className="ml-auto font-mono text-caption text-text-tertiary">{extra}</span>}
        </h2>
      )}
      {children}
    </section>
  );
}

function Atalho({ href, rotulo, titulo, Icone }: { href: string; rotulo: string; titulo: string; Icone: React.ComponentType<{ size?: number; className?: string }> }) {
  return (
    <Link href={href} className="relative flex h-[94px] flex-col justify-end rounded-[20px] border border-border-subtle bg-panel px-3.5 pb-3 transition-colors hover:bg-raised">
      <span className="absolute right-3 top-3 grid h-[26px] w-[26px] place-items-center rounded-full ring-[1.5px] ring-text-secondary">
        <Icone size={13} className="text-text-primary" />
      </span>
      <span className="text-caption text-text-tertiary">{rotulo}</span>
      <b className="text-body-lg font-medium tracking-tight text-text-primary">{titulo}</b>
    </Link>
  );
}
