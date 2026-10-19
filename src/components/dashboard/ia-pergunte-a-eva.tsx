"use client";

import * as React from "react";
import { AlertTriangle, ArrowUp, Loader2, Sparkles, Undo2 } from "lucide-react";
import type { Consulta, FiltrosGlobais, TipoDeCartao } from "@/lib/consulta";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// "Pergunte à Eva": a pessoa descreve o cartão em português e a IA preenche o
// montador. Nada é salvo sozinho — a IA só arruma os campos; a prévia ao vivo
// mostra o resultado e a pessoa revisa antes de adicionar ao painel.
// ---------------------------------------------------------------------------

export const LIMITE_DO_PEDIDO = 500;

export const EXEMPLOS_DE_CARTAO = [
  "Negócios de varejo acima de 10 mil parados há mais de 15 dias no funil B2B",
  "Quanto ganhei por mês este ano, por segmento",
  "Taxa de ganho por origem do lead nos últimos 90 dias",
];

export interface SugestaoDaIa {
  consulta: Consulta;
  tipo: TipoDeCartao;
  titulo: string;
  explicacao?: string;
  avisos?: string[];
}

export interface RespostaIaCartao extends SugestaoDaIa {
  modo: "cartao";
  explicacao: string;
  avisos: string[];
}

export interface RespostaIaGlobais {
  modo: "globais";
  globais: FiltrosGlobais;
  sobras: string[];
  cartao: { consulta: Consulta; tipo: TipoDeCartao; titulo: string } | null;
  explicacao: string;
  avisos: string[];
}

export type RespostaDaEva<M extends "cartao" | "globais"> = M extends "cartao" ? RespostaIaCartao : RespostaIaGlobais;

/** Chama POST /api/analytics/ia/consulta. Nunca lança: erro vira mensagem pronta para mostrar. */
export async function pedirParaEva<M extends "cartao" | "globais">(
  modo: M,
  pedido: string,
  extra: { consultaAtual?: Consulta; globaisAtuais?: FiltrosGlobais } = {}
): Promise<{ ok: true; dados: RespostaDaEva<M> } | { ok: false; erro: string }> {
  try {
    const res = await fetch("/api/analytics/ia/consulta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pedido, modo, ...extra }),
    });
    const d = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, erro: d?.error ?? "Não deu certo agora. Tenta de novo em instantes." };
    return { ok: true, dados: d as RespostaDaEva<M> };
  } catch {
    return { ok: false, erro: "Sem conexão com o servidor. Confere a internet e tenta de novo." };
  }
}

/** Explicação e avisos da última resposta. */
export function EntendiAssim({ explicacao, avisos, className }: { explicacao?: string; avisos?: string[]; className?: string }) {
  if (!explicacao && !avisos?.length) return null;
  return (
    <div className={cn("rounded-xl bg-accent-soft px-3 py-2.5 text-[12.5px] leading-relaxed", className)} role="status">
      {explicacao && (
        <p className="text-text-primary">
          <span className="font-medium text-accent-400">Entendi assim:</span> {explicacao}
        </p>
      )}
      {!!avisos?.length && (
        <ul className={cn("flex flex-col gap-1 text-text-secondary", explicacao && "mt-1.5")}>
          {avisos.map((a) => (
            <li key={a} className="flex items-start gap-1.5">
              <AlertTriangle size={12} className="mt-[3px] shrink-0 text-amber-300" aria-hidden />
              <span>{a}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Campo de pedido + exemplos. Reusado no montador e na barra de filtros. */
export function CampoDePedido({
  id,
  placeholder,
  exemplos,
  carregando,
  aoEnviar,
  autoFocus,
}: {
  id: string;
  placeholder: string;
  exemplos: string[];
  carregando: boolean;
  aoEnviar: (pedido: string) => void;
  autoFocus?: boolean;
}) {
  const [texto, setTexto] = React.useState("");
  const pedido = texto.trim();

  function enviar(t: string) {
    const p = t.trim();
    if (!p || carregando) return;
    setTexto(p);
    aoEnviar(p);
  }

  return (
    <div className="flex flex-col gap-2">
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          enviar(texto);
        }}
      >
        <div className="relative flex-1">
          <Sparkles size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-accent-400" aria-hidden />
          <input
            id={id}
            value={texto}
            onChange={(e) => setTexto(e.target.value.slice(0, LIMITE_DO_PEDIDO))}
            placeholder={placeholder}
            maxLength={LIMITE_DO_PEDIDO}
            autoFocus={autoFocus}
            disabled={carregando}
            className="h-10 w-full rounded-xl border border-border-default bg-surface-2 pl-9 pr-3 text-[13px] text-text-primary outline-none transition-colors placeholder:text-text-tertiary focus:border-accent-500/60 focus:ring-2 focus:ring-accent-500/20 disabled:opacity-60"
          />
        </div>
        <button
          type="submit"
          disabled={!pedido || carregando}
          aria-label="Enviar para a Eva"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-500 text-text-on-accent transition-colors hover:bg-accent-400 disabled:pointer-events-none disabled:opacity-40"
        >
          {carregando ? <Loader2 size={16} className="animate-spin" /> : <ArrowUp size={16} />}
        </button>
      </form>
      <div className="flex flex-wrap gap-1.5">
        {exemplos.map((ex) => (
          <button
            key={ex}
            type="button"
            disabled={carregando}
            onClick={() => enviar(ex)}
            className="rounded-lg bg-surface-2 px-2.5 py-1 text-left text-[11.5px] text-text-secondary ring-1 ring-border-subtle transition-colors hover:text-text-primary hover:ring-border-strong disabled:opacity-50"
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Bloco do topo do montador. `aoAplicar` recebe a consulta já conferida pelo
 * servidor; quem guarda o estado anterior (para o desfazer) é o montador.
 */
export function PergunteAEva({
  consultaAtual,
  aoAplicar,
  podeDesfazer,
  aoDesfazer,
  inicial,
}: {
  consultaAtual: Consulta;
  aoAplicar: (r: RespostaIaCartao) => void;
  podeDesfazer: boolean;
  aoDesfazer: () => void;
  /** Quando o montador já abre preenchido pela IA (vindo da barra do painel). */
  inicial?: { explicacao?: string; avisos?: string[] };
}) {
  const [carregando, setCarregando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [ultima, setUltima] = React.useState<{ explicacao?: string; avisos?: string[] } | null>(inicial ?? null);

  async function enviar(pedido: string) {
    setCarregando(true);
    setErro(null);
    const r = await pedirParaEva("cartao", pedido, { consultaAtual });
    setCarregando(false);
    if (!r.ok) {
      setErro(r.erro);
      return;
    }
    aoAplicar(r.dados);
    setUltima({ explicacao: r.dados.explicacao, avisos: r.dados.avisos });
  }

  return (
    <section className="rounded-2xl bg-surface-2/60 p-4 ring-1 ring-border-subtle">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <label htmlFor="q-ia" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-text-primary">
          <Sparkles size={14} className="text-accent-400" aria-hidden /> Pergunte à Eva
        </label>
        {podeDesfazer && (
          <button
            type="button"
            onClick={() => {
              aoDesfazer();
              setUltima(null);
            }}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] text-text-tertiary transition-colors hover:bg-surface-3 hover:text-text-primary"
          >
            <Undo2 size={13} /> Desfazer
          </button>
        )}
      </div>
      <p className="mb-2.5 text-[12px] text-text-tertiary">
        Me diz o que você quer ver, do seu jeito. Eu monto o cartão e você confere na prévia antes de salvar.
      </p>
      <CampoDePedido
        id="q-ia"
        placeholder="Ex.: quanto ganhei por mês este ano"
        exemplos={EXEMPLOS_DE_CARTAO}
        carregando={carregando}
        aoEnviar={enviar}
      />
      {erro && (
        <p className="mt-2.5 text-[12.5px] text-danger" role="alert">
          {erro}
        </p>
      )}
      {!erro && ultima && <EntendiAssim className="mt-2.5" explicacao={ultima.explicacao} avisos={ultima.avisos} />}
    </section>
  );
}
