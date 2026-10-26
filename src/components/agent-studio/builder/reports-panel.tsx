"use client";

import * as React from "react";
import { ChevronRight, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface LinhaDoFunil {
  nodeId: string;
  label: string;
  entered: number;
  exited: number;
  noReply: number;
  stopped: number;
  exits: { label: string; count: number }[];
  buttons: { label: string; count: number }[];
}

interface Relatorio {
  funnel: LinhaDoFunil[];
  events: { category: string; action: string; count: number; conversations: number }[];
  channels: string[];
}

const ROTULO_DO_CANAL: Record<string, string> = {
  whatsapp_meta: "WhatsApp oficial",
  whatsapp_qr: "WhatsApp (QR)",
  instagram: "Instagram",
  messenger: "Messenger",
  telegram: "Telegram",
  tiktok: "TikTok",
  website: "Site",
  playground: "Playground",
  builder_preview: "Prévia",
};
const CANAIS_DE_TESTE = new Set(["playground", "builder_preview"]);

/** Data de hoje (ou de n dias atrás) no horário local, como AAAA-MM-DD. */
function dia(diasAtras = 0): string {
  const d = new Date(Date.now() - diasAtras * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const pct = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

// Aba "Relatórios" do Builder: funil por Bloco (quantas conversas entraram,
// seguiram, não responderam no prazo ou pararam) e os eventos da ação
// "Registrar evento", com filtro de período e canal.
export function ReportsPanel({ agentId }: { agentId: string }) {
  const [de, setDe] = React.useState(() => dia(6));
  const [ate, setAte] = React.useState(() => dia());
  const [canal, setCanal] = React.useState("");
  const [dados, setDados] = React.useState<Relatorio | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const [aberto, setAberto] = React.useState<string | null>(null);

  const carregar = React.useCallback(() => {
    const q = new URLSearchParams({ from: de, to: ate, channel: canal });
    fetch(`/api/agents/${agentId}/reports?${q}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error ?? "Não foi possível carregar o relatório.");
        setErro(null);
        setDados(d);
      })
      .catch((e) => setErro(e instanceof Error ? e.message : "Não foi possível carregar o relatório."));
  }, [agentId, de, ate, canal]);

  React.useEffect(() => {
    carregar();
  }, [carregar]);

  const canaisReais = (dados?.channels ?? []).filter((c) => !CANAIS_DE_TESTE.has(c));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
      <div className="flex flex-wrap items-end gap-3 rounded-[18px] border border-border-subtle bg-panel p-4">
        <label className="flex flex-col gap-1 text-caption text-text-tertiary">
          De
          <Input type="date" value={de} max={ate} onChange={(e) => e.target.value && setDe(e.target.value)} className="w-[150px]" />
        </label>
        <label className="flex flex-col gap-1 text-caption text-text-tertiary">
          Até
          <Input type="date" value={ate} min={de} onChange={(e) => e.target.value && setAte(e.target.value)} className="w-[150px]" />
        </label>
        <label className="flex flex-col gap-1 text-caption text-text-tertiary">
          Canal
          <Select value={canal} onChange={(e) => setCanal(e.target.value)} className="w-[190px]">
            <option value="">Todos (sem testes)</option>
            {canaisReais.map((c) => (
              <option key={c} value={c}>
                {ROTULO_DO_CANAL[c] ?? c}
              </option>
            ))}
            <option value="test">Testes (prévia e playground)</option>
          </Select>
        </label>
        <button
          type="button"
          onClick={carregar}
          className="ml-auto flex h-9 items-center gap-1 text-caption font-medium text-text-tertiary hover:text-text-primary"
        >
          <RefreshCw size={12} aria-hidden="true" /> Atualizar
        </button>
      </div>

      {erro && <p role="alert" className="text-small text-danger">{erro}</p>}

      <section className="rounded-[18px] border border-border-subtle bg-panel p-4">
        <h2 className="mb-1 text-body font-semibold text-text-primary">Funil por bloco</h2>
        <p className="mb-3 text-caption text-text-tertiary">Conversas que passaram por cada Bloco no período. Quem passou duas vezes conta uma.</p>
        {dados === null ? (
          <p className="text-small text-text-tertiary">Carregando…</p>
        ) : dados.funnel.length === 0 ? (
          <p className="text-small text-text-tertiary">Nenhuma conversa passou por um Bloco neste período.</p>
        ) : (
          <table className="w-full text-small">
            <thead>
              <tr className="text-left text-caption text-text-tertiary">
                <th className="py-1.5 font-medium">Bloco</th>
                <th className="py-1.5 text-right font-medium">Entraram</th>
                <th className="py-1.5 text-right font-medium">Seguiram</th>
                <th className="py-1.5 text-right font-medium">Não responderam</th>
                <th className="py-1.5 text-right font-medium">Pararam</th>
              </tr>
            </thead>
            <tbody>
              {dados.funnel.map((l) => {
                const detalhe = l.exits.length > 0 || l.buttons.length > 0;
                const expandido = aberto === l.nodeId;
                return (
                  <React.Fragment key={l.nodeId}>
                    <tr className="border-t border-border-subtle">
                      <td className="py-2 pr-3">
                        <button
                          type="button"
                          disabled={!detalhe}
                          aria-expanded={detalhe ? expandido : undefined}
                          onClick={() => setAberto(expandido ? null : l.nodeId)}
                          className="flex items-center gap-1 text-left font-medium text-text-primary disabled:cursor-default"
                        >
                          <ChevronRight
                            size={13}
                            aria-hidden="true"
                            className={cn("shrink-0 text-text-tertiary transition-transform", expandido && "rotate-90", !detalhe && "invisible")}
                          />
                          {l.label}
                        </button>
                      </td>
                      <td className="py-2 text-right font-mono tabular-nums">{l.entered}</td>
                      <td className="py-2 text-right font-mono tabular-nums">
                        {l.exited} <span className="text-text-tertiary">({pct(l.exited, l.entered)}%)</span>
                      </td>
                      <td className="py-2 text-right font-mono tabular-nums">{l.noReply}</td>
                      <td className="py-2 text-right font-mono tabular-nums">
                        {l.stopped} <span className="text-text-tertiary">({pct(l.stopped, l.entered)}%)</span>
                      </td>
                    </tr>
                    {expandido && (
                      <tr>
                        <td colSpan={5} className="pb-3 pl-5">
                          <div className="flex flex-wrap gap-6 text-caption text-text-secondary">
                            {l.exits.length > 0 && (
                              <div>
                                <p className="mb-1 font-medium text-text-tertiary">Saídas</p>
                                {l.exits.map((s) => (
                                  <p key={s.label}>
                                    {s.label}: <span className="font-mono tabular-nums">{s.count}</span>
                                  </p>
                                ))}
                              </div>
                            )}
                            {l.buttons.length > 0 && (
                              <div>
                                <p className="mb-1 font-medium text-text-tertiary">Botões tocados</p>
                                {l.buttons.map((b) => (
                                  <p key={b.label}>
                                    {b.label}: <span className="font-mono tabular-nums">{b.count}</span>
                                  </p>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="rounded-[18px] border border-border-subtle bg-panel p-4">
        <h2 className="mb-1 text-body font-semibold text-text-primary">Eventos</h2>
        <p className="mb-3 text-caption text-text-tertiary">Os da ação &quot;Registrar evento&quot; dentro dos Blocos.</p>
        {dados === null ? (
          <p className="text-small text-text-tertiary">Carregando…</p>
        ) : dados.events.length === 0 ? (
          <p className="text-small text-text-tertiary">Nenhum evento registrado neste período.</p>
        ) : (
          <table className="w-full text-small">
            <thead>
              <tr className="text-left text-caption text-text-tertiary">
                <th className="py-1.5 font-medium">Categoria</th>
                <th className="py-1.5 font-medium">Ação</th>
                <th className="py-1.5 text-right font-medium">Vezes</th>
                <th className="py-1.5 text-right font-medium">Conversas</th>
              </tr>
            </thead>
            <tbody>
              {dados.events.map((e) => (
                <tr key={`${e.category}|${e.action}`} className="border-t border-border-subtle">
                  <td className="py-2 pr-3">{e.category}</td>
                  <td className="py-2 pr-3">{e.action}</td>
                  <td className="py-2 text-right font-mono tabular-nums">{e.count}</td>
                  <td className="py-2 text-right font-mono tabular-nums">{e.conversations}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
