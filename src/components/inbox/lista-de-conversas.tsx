"use client";

import * as React from "react";
import { Search, X, Loader2, Bot, UserRound, Inbox, Bell, BellOff } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  FILTROS, NOME_DO_CANAL, horaCurta, iniciais,
  type Conversa, type IdDoFiltro, type Resumo,
} from "./tipos";

/** Quem escreveu por último, em duas letras, na prévia da lista. */
function prefixoDaPrevia(papel: string): string {
  if (papel === "human") return "Você: ";
  if (papel === "bot") return "Agente: ";
  return "";
}

function EstadoDaConversa({ c }: { c: Conversa }) {
  if (c.status === "waiting_human") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-danger/12 px-2 py-0.5 text-[10.5px] font-medium text-danger">
        <span className="h-1.5 w-1.5 rounded-full bg-danger" /> Esperando
      </span>
    );
  }
  if (c.status === "human") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[10.5px] font-medium text-accent-300">
        <UserRound size={10} /> {c.assignedTo?.name.split(" ")[0] ?? "Humano"}
      </span>
    );
  }
  if (c.status === "ended") {
    return <span className="text-[10.5px] text-text-tertiary">Encerrada</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10.5px] text-text-tertiary">
      <Bot size={10} /> Agente
    </span>
  );
}

export function ListaDeConversas({
  itens, selecionada, onSelecionar,
  filtro, onFiltro, busca, onBusca, canal, onCanal, testes, onTestes,
  resumo, carregando, temMais, carregandoMais, onMais, som, onSom, className,
}: {
  itens: Conversa[];
  selecionada: string | null;
  onSelecionar: (id: string) => void;
  filtro: IdDoFiltro;
  onFiltro: (f: IdDoFiltro) => void;
  busca: string;
  onBusca: (v: string) => void;
  canal: string;
  onCanal: (v: string) => void;
  testes: boolean;
  onTestes: (v: boolean) => void;
  resumo: Resumo | null;
  carregando: boolean;
  temMais: boolean;
  carregandoMais: boolean;
  onMais: () => void;
  som: boolean;
  onSom: (v: boolean) => void;
  className?: string;
}) {
  const contadores: Partial<Record<IdDoFiltro, number>> = {
    esperando: resumo?.esperando,
    minhas: resumo?.minhas,
  };

  return (
    <section className={cn("glass-card flex min-h-0 flex-col overflow-hidden rounded-3xl", className)}>
      <div className="border-b border-border-subtle p-3.5">
        <div className="mb-3 flex items-center justify-between">
          <h1 className="font-display text-[17px] font-semibold text-text-primary">Conversas</h1>
          <div className="flex items-center gap-2">
            {resumo && resumo.naoLidas > 0 && (
              <span className="rounded-full bg-accent-500 px-2 py-0.5 text-[11px] font-semibold text-white">
                {resumo.naoLidas} {resumo.naoLidas === 1 ? "nova" : "novas"}
              </span>
            )}
            <button
              type="button"
              onClick={() => onSom(!som)}
              aria-label={som ? "Desligar o som de mensagem nova" : "Ligar o som de mensagem nova"}
              title={som ? "Som ligado" : "Som desligado"}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-surface-2 hover:text-text-primary"
            >
              {som ? <Bell size={14} /> : <BellOff size={14} />}
            </button>
          </div>
        </div>

        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <input
            value={busca}
            onChange={(e) => onBusca(e.target.value)}
            placeholder="Buscar nome, telefone ou mensagem"
            aria-label="Buscar conversas"
            className="w-full rounded-xl bg-surface-2 py-2 pl-9 pr-8 text-[13px] text-text-primary outline-none placeholder:text-text-tertiary focus:ring-1 focus:ring-accent-500/40"
          />
          {busca && (
            <button
              type="button"
              onClick={() => onBusca("")}
              aria-label="Limpar busca"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary"
            >
              <X size={13} />
            </button>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-1">
          {FILTROS.map((f) => {
            const n = contadores[f.id];
            const ativo = filtro === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => onFiltro(f.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors",
                  ativo ? "bg-ice text-bg-base" : "bg-surface-2 text-text-secondary hover:text-text-primary"
                )}
              >
                {f.rotulo}
                {n !== undefined && n > 0 && (
                  <span
                    className={cn(
                      "rounded-md px-1 text-[10.5px] tabular-nums",
                      ativo ? "bg-bg-base/15" : f.id === "esperando" ? "bg-danger/15 text-danger" : "bg-surface-3 text-text-tertiary"
                    )}
                  >
                    {n}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-2.5 flex items-center justify-between gap-2">
          <select
            value={canal}
            onChange={(e) => onCanal(e.target.value)}
            aria-label="Filtrar por canal"
            className="rounded-lg bg-surface-2 px-2 py-1.5 text-[12px] text-text-secondary outline-none"
          >
            <option value="">Todos os canais</option>
            <option value="whatsapp_meta">WhatsApp oficial</option>
            <option value="whatsapp_qr">WhatsApp (QR)</option>
            <option value="instagram">Instagram</option>
            <option value="messenger">Messenger</option>
            <option value="telegram">Telegram</option>
            <option value="tiktok">TikTok</option>
            <option value="website">Site</option>
          </select>
          <label className="flex cursor-pointer items-center gap-1.5 text-[11.5px] text-text-tertiary">
            <input
              type="checkbox"
              checked={testes}
              onChange={(e) => onTestes(e.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--accent-500)]"
            />
            Mostrar testes
          </label>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {carregando && itens.length === 0 ? (
          <p className="p-6 text-center text-[13px] text-text-tertiary">Carregando...</p>
        ) : itens.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-surface-2 text-text-tertiary">
              <Inbox size={20} />
            </span>
            <p className="text-[13.5px] font-medium text-text-primary">
              {busca ? "Nada encontrado" : filtro === "esperando" ? "Ninguém esperando" : "Nenhuma conversa"}
            </p>
            <p className="mt-1 max-w-[220px] text-[12px] text-text-tertiary">
              {busca
                ? "Tente outro nome, número ou trecho da mensagem."
                : filtro === "esperando"
                  ? "Quando o agente passar uma conversa para uma pessoa, ela aparece aqui."
                  : "As conversas aparecem aqui assim que alguém escrever por um canal conectado."}
            </p>
          </div>
        ) : (
          <ul>
            {itens.map((c) => {
              const ativa = c.id === selecionada;
              const naoLida = c.naoLidas > 0;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onSelecionar(c.id)}
                    className={cn(
                      "flex w-full items-start gap-3 border-b border-border-subtle px-3.5 py-3 text-left transition-colors",
                      ativa ? "bg-surface-3" : "hover:bg-surface-2"
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[12.5px] font-semibold",
                        naoLida ? "bg-accent-500/20 text-accent-300" : "bg-surface-3 text-text-secondary"
                      )}
                    >
                      {iniciais(c.nome) || <UserRound size={17} />}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={cn("truncate text-[13.5px]", naoLida ? "font-semibold text-text-primary" : "font-medium text-text-primary")}>
                          {c.nome}
                        </span>
                        <span className={cn("shrink-0 text-[11px] tabular-nums", naoLida ? "text-accent-300" : "text-text-tertiary")}>
                          {horaCurta(c.lastMessageAt)}
                        </span>
                      </span>

                      <span className="mt-0.5 flex items-center justify-between gap-2">
                        <span className={cn("truncate text-[12.5px]", naoLida ? "text-text-secondary" : "text-text-tertiary")}>
                          {c.lastMessageText
                            ? `${prefixoDaPrevia(c.lastMessageRole)}${c.lastMessageText}`
                            : "Sem mensagens"}
                        </span>
                        {naoLida && (
                          <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-accent-500 px-1 text-[10.5px] font-semibold text-white">
                            {c.naoLidas > 99 ? "99+" : c.naoLidas}
                          </span>
                        )}
                      </span>

                      <span className="mt-1.5 flex items-center gap-2">
                        <EstadoDaConversa c={c} />
                        <span className="text-[10.5px] text-text-tertiary">{NOME_DO_CANAL[c.channel] ?? c.channel}</span>
                        {c.negocio && (
                          <span className="truncate rounded-md bg-surface-3 px-1.5 py-0.5 text-[10.5px] text-text-tertiary">
                            {c.negocio.etapa}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}

            {temMais && (
              <li className="p-3">
                <button
                  type="button"
                  onClick={onMais}
                  disabled={carregandoMais}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-surface-2 py-2 text-[12.5px] text-text-secondary transition-colors hover:text-text-primary disabled:opacity-50"
                >
                  {carregandoMais && <Loader2 size={13} className="animate-spin" />} Carregar mais
                </button>
              </li>
            )}
          </ul>
        )}
      </div>
    </section>
  );
}
