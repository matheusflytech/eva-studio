"use client";

import * as React from "react";
import { Globe, Loader2, MessageCircle, MessagesSquare, Search, Send, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Peças pequenas que a ficha usa em mais de uma coluna.

/** Bloco com título, contador e ação à direita. */
export function Secao({
  titulo,
  contagem,
  acao,
  children,
  className,
  id,
}: {
  titulo: string;
  contagem?: number;
  acao?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  const idDoTitulo = React.useId();
  return (
    <section
      id={id}
      aria-labelledby={idDoTitulo}
      className={cn("rounded-2xl border border-border-subtle bg-surface-1 p-4", className)}
    >
      <header className="mb-3 flex min-h-7 items-center justify-between gap-2">
        <h2 id={idDoTitulo} className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-text-tertiary">
          {titulo}
          {contagem !== undefined && contagem > 0 && (
            <span className="rounded-md bg-surface-3 px-1.5 py-px text-[11px] font-medium tabular-nums tracking-normal text-text-secondary">
              {contagem}
            </span>
          )}
        </h2>
        {acao}
      </header>
      {children}
    </section>
  );
}

/** Botão discreto de cabeçalho de seção ("+ Vincular"). */
export function BotaoDeSecao({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] font-medium text-accent-400 outline-none transition-colors",
        "hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-accent-500/60 disabled:opacity-40",
        className
      )}
      {...props}
    />
  );
}

/** Botão só de ícone: sempre com aria-label (vem do chamador) e foco visível. */
export function BotaoDeIcone({
  className,
  rotulo,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { rotulo: string }) {
  return (
    <button
      type="button"
      aria-label={rotulo}
      title={rotulo}
      className={cn(
        "grid h-7 w-7 shrink-0 place-items-center rounded-md text-text-tertiary outline-none transition-colors",
        "hover:bg-surface-3 hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent-500/60 disabled:opacity-40",
        className
      )}
      {...props}
    />
  );
}

const ICONE_DO_CANAL: Record<string, { icone: LucideIcon; cor: string }> = {
  whatsapp_meta: { icone: MessageCircle, cor: "text-[#25d366]" },
  whatsapp_qr: { icone: MessageCircle, cor: "text-[#25d366]" },
  telegram: { icone: Send, cor: "text-sky-400" },
  website: { icone: Globe, cor: "text-text-secondary" },
  webchat: { icone: Globe, cor: "text-text-secondary" },
};

/** Ícone do canal. Sem marca de terceiros: só a cor lembra o WhatsApp. */
export function IconeDoCanal({ canal, tamanho = 15 }: { canal: string; tamanho?: number }) {
  const { icone: Icone, cor } = ICONE_DO_CANAL[canal] ?? { icone: MessagesSquare, cor: "text-text-secondary" };
  return <Icone size={tamanho} aria-hidden className={cn("shrink-0", cor)} />;
}

/** "19 de out. de 2026" no calendário de São Paulo. */
export function dataLonga(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Campo editável no lugar: parece texto até o mouse ou o foco chegar. Salva
 * ao sair do campo (ou Enter) e só se mudou; Esc desfaz. O erro fica embaixo
 * do campo que falhou, não num aviso genérico no topo.
 */
export function CampoInline({
  id,
  rotulo,
  valor,
  onSalvar,
  tipo = "texto",
  placeholder,
  prefixo,
  sufixo,
  className,
  rotuloOculto,
}: {
  id: string;
  rotulo: string;
  valor: string;
  /** Devolve a mensagem de erro, ou null. */
  onSalvar: (v: string) => Promise<string | null>;
  tipo?: "texto" | "numero" | "data" | "area";
  placeholder?: string;
  prefixo?: string;
  sufixo?: string;
  className?: string;
  rotuloOculto?: boolean;
}) {
  const [rascunho, setRascunho] = React.useState(valor);
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  // Valor novo do servidor (outra edição, recarga) substitui o rascunho
  // quando não há nada sendo digitado.
  const [valorAnterior, setValorAnterior] = React.useState(valor);
  if (valor !== valorAnterior) {
    setValorAnterior(valor);
    setRascunho(valor);
  }

  async function salvar(v = rascunho) {
    if (v === valor) {
      setErro(null);
      return;
    }
    setSalvando(true);
    const falha = await onSalvar(v);
    setSalvando(false);
    setErro(falha);
    // Falhou: volta ao salvo, para a tela não mostrar o que não foi gravado.
    if (falha) setRascunho(valor);
  }

  const classe = cn(
    "w-full rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-[13px] text-text-primary outline-none transition-colors",
    "placeholder:text-text-tertiary hover:border-border-subtle hover:bg-surface-2",
    "focus:border-accent-500/60 focus:bg-surface-2 focus:ring-2 focus:ring-accent-500/20",
    erro && "border-danger/50",
    prefixo && "pl-8",
    className
  );

  const teclas = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      setRascunho(valor);
      setErro(null);
      e.currentTarget.blur();
    } else if (e.key === "Enter" && (tipo !== "area" || e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      e.currentTarget.blur();
    }
  };

  return (
    <div>
      <label htmlFor={id} className={cn("mb-0.5 block px-2 text-[11.5px] text-text-tertiary", rotuloOculto && "sr-only")}>
        {rotulo}
      </label>
      <div className="relative">
        {prefixo && (
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[12px] text-text-tertiary">{prefixo}</span>
        )}
        {tipo === "area" ? (
          <textarea
            id={id}
            rows={3}
            value={rascunho}
            placeholder={placeholder}
            onChange={(e) => setRascunho(e.target.value)}
            onBlur={() => salvar()}
            onKeyDown={teclas}
            aria-invalid={!!erro}
            className={cn(classe, "resize-y leading-relaxed")}
          />
        ) : (
          <input
            id={id}
            type={tipo === "data" ? "date" : "text"}
            inputMode={tipo === "numero" ? "decimal" : undefined}
            value={rascunho}
            placeholder={placeholder}
            onChange={(e) => {
              setRascunho(e.target.value);
              // Data escolhida no calendário já é a decisão; esperar o blur
              // deixaria a pessoa achando que não pegou.
              if (tipo === "data") salvar(e.target.value);
            }}
            onBlur={() => tipo !== "data" && salvar()}
            onKeyDown={teclas}
            aria-invalid={!!erro}
            className={cn(classe, "h-8", tipo === "data" && "[color-scheme:dark]")}
          />
        )}
        {(salvando || sufixo) && (
          <span className="pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 text-[12px] text-text-tertiary">
            {salvando ? <Loader2 size={13} className="animate-spin" aria-label="Salvando" /> : sufixo}
          </span>
        )}
      </div>
      {erro && (
        <p role="alert" className="mt-1 px-2 text-[11.5px] text-danger">
          {erro}
        </p>
      )}
    </div>
  );
}

export interface OpcaoDeBusca {
  id: string;
  titulo: string;
  sub?: string;
}

/**
 * Busca para vincular contato ou empresa. Abre no lugar (sem modal: a pessoa
 * continua vendo a ficha), Esc fecha, e a primeira opção já é a do Enter.
 */
export function BuscaDeVinculo({
  rotulo,
  placeholder,
  buscar,
  onEscolher,
  onFechar,
  ignorar = [],
}: {
  rotulo: string;
  placeholder: string;
  buscar: (q: string) => Promise<OpcaoDeBusca[]>;
  onEscolher: (id: string) => Promise<void> | void;
  onFechar: () => void;
  ignorar?: string[];
}) {
  const [q, setQ] = React.useState("");
  const [opcoes, setOpcoes] = React.useState<OpcaoDeBusca[]>([]);
  const [buscando, setBuscando] = React.useState(false);
  const [falhou, setFalhou] = React.useState(false);
  const idDaLista = React.useId();
  const buscarRef = React.useRef(buscar);
  React.useEffect(() => {
    buscarRef.current = buscar;
  });

  // Espera a pessoa parar de digitar: uma consulta por tecla na base inteira
  // de contatos é desperdício e ainda chega fora de ordem.
  React.useEffect(() => {
    let vivo = true;
    const t = setTimeout(async () => {
      setBuscando(true);
      try {
        const r = await buscarRef.current(q.trim());
        if (vivo) {
          setOpcoes(r);
          setFalhou(false);
        }
      } catch {
        if (vivo) setFalhou(true);
      } finally {
        if (vivo) setBuscando(false);
      }
    }, 250);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [q]);

  const visiveis = opcoes.filter((o) => !ignorar.includes(o.id)).slice(0, 8);

  return (
    <div
      className="mb-3 rounded-xl border border-border-default bg-surface-2 p-2"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onFechar();
        }
      }}
    >
      <div className="flex items-center gap-1.5">
        <Search size={14} aria-hidden className="ml-1 shrink-0 text-text-tertiary" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && visiveis[0]) {
              e.preventDefault();
              onEscolher(visiveis[0].id);
            }
          }}
          placeholder={placeholder}
          aria-label={rotulo}
          aria-controls={idDaLista}
          className="h-8 min-w-0 flex-1 bg-transparent text-[13px] text-text-primary outline-none placeholder:text-text-tertiary"
        />
        {buscando && <Loader2 size={13} className="animate-spin text-text-tertiary" aria-label="Buscando" />}
        <BotaoDeIcone rotulo="Fechar busca" onClick={onFechar}>
          <X size={14} />
        </BotaoDeIcone>
      </div>
      <ul id={idDaLista} className="mt-1 flex flex-col gap-0.5">
        {falhou ? (
          <li className="px-2 py-1.5 text-[12px] text-danger">Não foi possível buscar.</li>
        ) : visiveis.length === 0 && !buscando ? (
          <li className="px-2 py-1.5 text-[12px] text-text-tertiary">{q.trim() ? "Nada encontrado." : "Digite para buscar."}</li>
        ) : (
          visiveis.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => onEscolher(o.id)}
                className="flex w-full flex-col rounded-lg px-2 py-1.5 text-left outline-none hover:bg-surface-3 focus-visible:bg-surface-3 focus-visible:ring-2 focus-visible:ring-accent-500/60"
              >
                <span className="truncate text-[13px] text-text-primary">{o.titulo}</span>
                {o.sub && <span className="truncate text-[11.5px] text-text-tertiary">{o.sub}</span>}
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
