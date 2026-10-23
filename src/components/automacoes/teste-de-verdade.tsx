"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, ExternalLink, FlaskConical, Loader2, Play, RotateCcw, Trash2, X } from "lucide-react";
import Link from "@/components/contrato/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LogoOficial } from "@/components/ui/logo-oficial";
import { avisarNaIlha } from "@/lib/fundo/eventos";
import { NOMES_DOS_OBJETOS } from "@/lib/automacoes/catalogo";
import { planoDoTeste } from "@/lib/automacoes/teste";
import type { Definicao } from "@/lib/automacoes/tipos";
import { cn } from "@/lib/utils";
import type { EstadoDoNo } from "./canvas";

// ---------------------------------------------------------------------------
// Testar de verdade, sem janela por cima do quadro: uma confirmação curta
// (WhatsApp do teste) e depois um painel flutuante com o andamento enquanto o
// quadro acende passo a passo. O servidor cria um registro de teste que cumpre
// o gatilho e as condições e roda tudo nele (o WhatsApp só vai para o número
// informado). Esperas viram 10 s; quando vence, a tela pede para continuar.
// ---------------------------------------------------------------------------

type Estados = Record<string, { estado: EstadoDoNo; ms?: number }>;
interface Passo { noId: string; status: string; ms: number | null; erro: string | null }
interface Execucao { status: string; erro: string | null; noAtual: string | null; proximaEm: string | null; passos: Passo[] }
interface Inicio { execucaoId: string; objeto: Definicao["objeto"]; objetoId: string; cumpridas: string[]; naoCumpridas: string[] }

const CHAVE_DO_TELEFONE = "eva:teste:whatsapp";
const CHAVE_DO_EMAIL = "eva:teste:email";
const FIM = new Set(["concluida", "falhou", "cancelada", "objetivo"]);
const MOLA = { type: "spring", stiffness: 420, damping: 34, mass: 0.8 } as const;

function lerGuardado(chave: string): string {
  try {
    return localStorage.getItem(chave) ?? "";
  } catch {
    return "";
  }
}
function guardar(chave: string, valor: string) {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    /* navegador sem armazenamento: segue */
  }
}

const caminhoDoRegistro = (objeto: Definicao["objeto"], id: string) =>
  objeto === "deal" ? `/negocios/${id}` : objeto === "contact" ? `/contatos?abrir=${id}` : objeto === "company" ? `/empresas/${id}` : objeto === "task" ? "/tarefas" : "/conversas";

export function TesteDeVerdade({
  automacaoId,
  def,
  nomeDoPasso,
  aoMudarEstados,
  fechar,
  simular,
}: {
  automacaoId: string;
  def: Definicao;
  nomeDoPasso: (noId: string) => string;
  aoMudarEstados: (e: Estados | undefined) => void;
  fechar: () => void;
  /** Abre o teste simulado num registro que já existe (o modo antigo). */
  simular: () => void;
}) {
  const calmo = useReducedMotion();
  // Lê o fluxo antes: só pede o WhatsApp/e-mail se algum passo usa.
  const plano = React.useMemo(() => planoDoTeste(def), [def]);
  const [telefone, setTelefone] = React.useState(() => lerGuardado(CHAVE_DO_TELEFONE));
  const [email, setEmail] = React.useState(() => lerGuardado(CHAVE_DO_EMAIL));
  const pronto = (!plano.precisaWhatsApp || telefone.replace(/\D/g, "").length >= 10) && (!plano.precisaEmail || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()));
  const [fase, setFase] = React.useState<"confirmar" | "rodando">("confirmar");
  const [erro, setErro] = React.useState<string | null>(null);
  const [inicio, setInicio] = React.useState<Inicio | null>(null);
  const [exec, setExec] = React.useState<Execucao | null>(null);
  const [mostrados, setMostrados] = React.useState(0);
  const [apagando, setApagando] = React.useState(false);
  const [apagado, setApagado] = React.useState(false);
  const [agora, setAgora] = React.useState(() => Date.now());
  const pedindo = React.useRef(false);
  const acabou = React.useRef(false);
  const nome = NOMES_DOS_OBJETOS[def.objeto];

  async function rodar() {
    setErro(null);
    if (plano.precisaWhatsApp) guardar(CHAVE_DO_TELEFONE, telefone);
    if (plano.precisaEmail) guardar(CHAVE_DO_EMAIL, email);
    setFase("rodando");
    setMostrados(0);
    setExec(null);
    setApagado(false);
    aoMudarEstados(undefined);
    try {
      const r = await fetch(`/api/automacoes/${automacaoId}/testar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modo: "real", telefone: plano.precisaWhatsApp ? telefone : undefined, email: plano.precisaEmail ? email : undefined }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Não deu para testar.");
      setInicio(d as Inicio);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não deu para testar.");
      setFase("confirmar");
    }
  }

  // Acompanha a execução: busca a cada segundo e, quando a espera curta vence,
  // pede para continuar.
  React.useEffect(() => {
    if (!inicio || fase === "confirmar") return;
    let vivo = true;
    const buscar = async () => {
      const r = await fetch(`/api/automacoes/${automacaoId}/execucoes/${inicio.execucaoId}`).then((x) => x.json()).catch(() => null);
      if (!vivo || !r?.execucao) return;
      const e = r.execucao as Execucao;
      acabou.current = FIM.has(e.status);
      setExec(e);
      if (e.status === "esperando" && e.proximaEm && Date.parse(e.proximaEm) <= Date.now() && !pedindo.current) {
        pedindo.current = true;
        await fetch(`/api/automacoes/${automacaoId}/testar/${inicio.execucaoId}`, { method: "POST" }).catch(() => null);
        pedindo.current = false;
      }
    };
    acabou.current = false;
    void buscar();
    const t = setInterval(() => {
      setAgora(Date.now());
      if (!acabou.current) void buscar();
    }, 1000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [inicio, automacaoId, fase === "confirmar"]); // eslint-disable-line react-hooks/exhaustive-deps

  // Revela um passo por vez (o quadro acende em sequência, não tudo de uma vez).
  const total = exec?.passos.length ?? 0;
  React.useEffect(() => {
    if (mostrados >= total) return;
    const t = setTimeout(() => setMostrados((m) => m + 1), calmo ? 700 : 380);
    return () => clearTimeout(t);
  }, [mostrados, total, calmo]);

  const terminou = !!exec && FIM.has(exec.status) && mostrados >= total;
  React.useEffect(() => {
    if (!exec) return;
    const estados: Estados = { gatilho: { estado: "ok" } };
    for (const p of exec.passos.slice(0, mostrados)) estados[p.noId] = { estado: p.status as EstadoDoNo, ms: p.ms ?? undefined };
    const proximo = exec.passos[mostrados];
    if (proximo) estados[proximo.noId] = { estado: "rodando" };
    else if (!FIM.has(exec.status) && exec.noAtual && !estados[exec.noAtual]) estados[exec.noAtual] = { estado: "rodando" };
    aoMudarEstados(estados);
  }, [exec, mostrados, aoMudarEstados]);

  // "fim" é derivado: rodando + execução terminada e todos os passos já mostrados.
  const etapa = fase === "confirmar" ? "confirmar" : terminou ? "fim" : "rodando";
  const avisou = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (etapa !== "fim" || !inicio || avisou.current === inicio.execucaoId) return;
    avisou.current = inicio.execucaoId;
    avisarNaIlha({
      titulo: exec!.status === "falhou" ? "O teste parou num erro" : "Teste de verdade concluído",
      detalhe: `${total} ${total === 1 ? "passo" : "passos"} · ${nome.singular} de teste criado`,
    });
  }, [etapa, inicio, exec, total, nome.singular]);

  async function apagar() {
    if (!inicio) return;
    setApagando(true);
    const r = await fetch(`/api/automacoes/${automacaoId}/testar/${inicio.execucaoId}`, { method: "DELETE" }).catch(() => null);
    setApagando(false);
    if (r?.ok) {
      setApagado(true);
      avisarNaIlha({ titulo: "Dados do teste apagados" });
    } else setErro("Não deu para apagar os dados do teste.");
  }

  const esperandoAte = exec?.status === "esperando" && exec.proximaEm ? Math.max(0, Math.ceil((Date.parse(exec.proximaEm) - agora) / 1000)) : null;
  const atual = exec?.passos[mostrados] ?? null;

  return (
    <motion.div
      initial={calmo ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={calmo ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98 }}
      transition={MOLA}
      role="dialog"
      aria-label="Testar de verdade"
      className="pointer-events-auto w-[380px] max-w-[calc(100vw-48px)] overflow-hidden rounded-[22px] border border-border-default bg-overlay/95 shadow-[var(--elevation-overlay)] backdrop-blur-xl"
    >
      <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-3">
        <FlaskConical size={15} aria-hidden="true" className="text-accent-fg" />
        <p className="text-small font-semibold text-text-primary">Testar de verdade</p>
        <button type="button" onClick={fechar} aria-label="Fechar o teste" className="ml-auto grid h-7 w-7 place-items-center rounded-full text-text-tertiary hover:bg-hover hover:text-text-primary">
          <X size={14} aria-hidden="true" />
        </button>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {etapa === "confirmar" ? (
          <motion.div key="confirmar" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-3 px-4 py-4">
            <p className="text-small leading-snug text-text-secondary">
              Roda <b className="text-text-primary">todos os passos de verdade</b> {nome.artigo === "a" ? "numa" : "num"} {nome.singular} de teste que atende ao gatilho e às condições. Esperas viram 10 segundos. Nada vai para cliente.
            </p>
            {/* O que vai acontecer, lido do próprio fluxo. */}
            <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-caption text-text-secondary">
              {plano.oQueFaz.map((o, i) => (
                <li key={o} className="flex items-center gap-1.5">
                  {i > 0 && <span aria-hidden="true" className="text-text-disabled">→</span>}
                  <span className="rounded-full bg-raised px-2 py-0.5">{o}</span>
                </li>
              ))}
            </ol>
            {plano.precisaWhatsApp && (
              <label className="flex flex-col gap-1.5">
                <span className="flex items-center gap-1.5 text-caption font-medium text-text-secondary">
                  <LogoOficial marca="whatsapp" tamanho={13} /> Este fluxo manda WhatsApp: número que recebe o teste
                </span>
                <Input autoFocus inputMode="tel" placeholder="47 99999-9999" value={telefone} onChange={(e) => setTelefone(e.target.value)} onKeyDown={(e) => e.key === "Enter" && pronto && void rodar()} />
              </label>
            )}
            {plano.precisaEmail && (
              <label className="flex flex-col gap-1.5">
                <span className="text-caption font-medium text-text-secondary">Este fluxo manda e-mail: e-mail que recebe o teste</span>
                <Input autoFocus={!plano.precisaWhatsApp} type="email" placeholder="voce@empresa.com" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && pronto && void rodar()} />
              </label>
            )}
            {erro && <p className="text-caption text-danger">{erro}</p>}
            <div className="flex items-center gap-2">
              <Button type="button" variant="primary" onClick={() => void rodar()} disabled={!pronto}>
                <Play size={13} aria-hidden="true" /> Rodar teste
              </Button>
              <button type="button" onClick={simular} className="ml-auto text-caption text-text-tertiary underline-offset-2 hover:text-text-primary hover:underline">
                ou simular num registro existente
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div key="andamento" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-3 px-4 py-4">
            <div className="flex items-center gap-2 text-small">
              {etapa === "fim" ? (
                exec?.status === "falhou" ? <X size={15} className="text-danger" aria-hidden="true" /> : <Check size={15} className="text-success" aria-hidden="true" />
              ) : (
                <Loader2 size={15} className="animate-spin text-accent-fg motion-reduce:animate-[spin_3s_linear_infinite]" aria-hidden="true" />
              )}
              <span className="font-medium text-text-primary">
                {etapa === "fim"
                  ? exec?.status === "falhou"
                    ? "Parou num erro"
                    : exec?.status === "cancelada"
                      ? "Teste interrompido"
                      : "Concluído"
                  : !inicio
                    ? `Criando ${nome.artigo === "a" ? "a" : "o"} ${nome.singular} de teste…`
                    : esperandoAte !== null && mostrados >= total
                      ? `Esperando ${esperandoAte} s…`
                      : atual
                        ? nomeDoPasso(atual.noId)
                        : "Rodando…"}
              </span>
              <span className="ml-auto font-mono text-caption tabular-nums text-text-tertiary">
                {Math.min(mostrados, total)} {mostrados === 1 ? "passo" : "passos"}
              </span>
            </div>

            {exec?.erro && etapa === "fim" && <p className="rounded-[12px] bg-danger/10 px-3 py-2 text-caption text-danger">{exec.erro}</p>}

            {inicio && (inicio.cumpridas.length > 0 || inicio.naoCumpridas.length > 0) && (
              <p className="text-caption leading-snug text-text-tertiary">
                {inicio.cumpridas.length > 0 && <>Preenchi para passar: {inicio.cumpridas.join(", ")}. </>}
                {inicio.naoCumpridas.length > 0 && <span className="text-warning">Não deu para cumprir: {inicio.naoCumpridas.join(", ")}.</span>}
              </p>
            )}

            {inicio && (
              <div className="flex flex-wrap items-center gap-2">
                {!apagado && (
                  <Link
                    href={caminhoDoRegistro(inicio.objeto, inicio.objetoId)}
                    target="_blank"
                    className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border-default px-3 text-caption font-medium text-text-primary hover:bg-hover"
                  >
                    <ExternalLink size={12} aria-hidden="true" /> Ver {nome.singular} de teste
                  </Link>
                )}
                {etapa === "fim" && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setFase("confirmar");
                        setInicio(null);
                        aoMudarEstados(undefined);
                      }}
                      className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border-default px-3 text-caption font-medium text-text-primary hover:bg-hover"
                    >
                      <RotateCcw size={12} aria-hidden="true" /> Testar de novo
                    </button>
                    <button
                      type="button"
                      disabled={apagando || apagado}
                      onClick={() => void apagar()}
                      className={cn(
                        "ml-auto inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-caption font-medium",
                        apagado ? "text-text-tertiary" : "text-danger hover:bg-danger/10"
                      )}
                    >
                      <Trash2 size={12} aria-hidden="true" /> {apagado ? "Dados apagados" : apagando ? "Apagando…" : "Apagar dados do teste"}
                    </button>
                  </>
                )}
              </div>
            )}
            {erro && <p className="text-caption text-danger">{erro}</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
