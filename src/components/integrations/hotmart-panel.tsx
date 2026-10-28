"use client";

import * as React from "react";
import { Check, Copy, Plus, RefreshCw, Trash2 } from "lucide-react";
import Link from "@/components/contrato/link";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/notice";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { CabecalhoDaSecao, EsqueletoDeLista, LinhaDeConfig, RodapeDaSecao } from "@/components/configuracoes/secao";
import { dataHoraBR } from "@/lib/exportar/csv";
import { ROLES, ROLE_LABELS, type ProductConfig, type StageRole } from "@/lib/hotmart/types";

interface Pipeline {
  id: string;
  name: string;
  stages: { id: string; name: string }[];
  suggestion: Partial<Record<StageRole, string>>;
}
interface Estado {
  connection: { url: string; hasHottok: boolean; products: Record<string, ProductConfig>; status: string; lastEventAt: string | null } | null;
  pipelines: Pipeline[];
}
interface Evento {
  id: string;
  event: string;
  productId: string | null;
  email: string | null;
  result: string;
  detail: string | null;
  dealId: string | null;
  createdAt: string;
}
type Linha = ProductConfig & { hotmartId: string };

const RESULTADO: Record<string, { rotulo: string; variant: "success" | "neutral" | "danger" | "warning" }> = {
  ok: { rotulo: "Aplicado", variant: "success" },
  ignored: { rotulo: "Ignorado", variant: "neutral" },
  error: { rotulo: "Erro", variant: "danger" },
  pending: { rotulo: "Na fila", variant: "warning" },
};

function Copiar({ texto }: { texto: string }) {
  const [ok, setOk] = React.useState(false);
  return (
    <IconButton
      aria-label="Copiar"
      tooltip
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          setOk(true);
          setTimeout(() => setOk(false), 1500);
        } catch {
          /* sem área de transferência */
        }
      }}
    >
      {ok ? <Check size={13} className="text-success" /> : <Copy size={13} />}
    </IconButton>
  );
}

const paraLinhas = (p: Record<string, ProductConfig> | undefined): Linha[] =>
  Object.entries(p ?? {}).map(([hotmartId, c]) => ({ ...c, hotmartId }));

// ---------------------------------------------------------------------------
// Integrações → Hotmart. O contrato recebe o webhook da Hotmart direto: cada
// produto aponta para um funil e cada etapa tem um papel na regra (carrinho,
// aguardando, aprovado...). Os papéis vêm sugeridos pelo nome da etapa.
// ---------------------------------------------------------------------------
export function HotmartPanel() {
  const [estado, setEstado] = React.useState<Estado | null>(null);
  const [linhas, setLinhas] = React.useState<Linha[]>([]);
  const [eventos, setEventos] = React.useState<Evento[]>([]);
  const [hottok, setHottok] = React.useState("");
  const [ocupado, setOcupado] = React.useState(false);
  const [msg, setMsg] = React.useState<{ tom: "info" | "danger"; texto: string } | null>(null);

  const carregar = React.useCallback(async () => {
    const [c, e] = await Promise.all([
      fetch("/api/integrations/hotmart").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/integrations/hotmart/events").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    if (c && "pipelines" in c) {
      setEstado(c);
      setLinhas(paraLinhas(c.connection?.products));
    } else setMsg({ tom: "danger", texto: "Não deu para carregar a conexão Hotmart." });
    if (e?.events) setEventos(e.events);
  }, []);

  React.useEffect(() => {
    void carregar();
  }, [carregar]);

  async function salvar(corpo: unknown, ok: string) {
    setOcupado(true);
    setMsg(null);
    try {
      const res = await fetch("/api/integrations/hotmart", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Não deu certo.");
      setMsg({ tom: "info", texto: ok });
      setHottok("");
      await carregar();
    } catch (err) {
      setMsg({ tom: "danger", texto: err instanceof Error ? err.message : "Não deu certo." });
    } finally {
      setOcupado(false);
    }
  }

  async function reprocessar(id: string) {
    setOcupado(true);
    try {
      const res = await fetch("/api/integrations/hotmart/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const data = await res.json().catch(() => ({}));
      setMsg(res.ok ? { tom: "info", texto: `Reprocessado: ${data.detail ?? data.result}` } : { tom: "danger", texto: data.error ?? "Não deu certo." });
      await carregar();
    } finally {
      setOcupado(false);
    }
  }

  const mudar = (i: number, parte: Partial<Linha>) => setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, ...parte } : l)));

  if (!estado) return msg ? <Notice tone={msg.tom}>{msg.texto}</Notice> : <EsqueletoDeLista />;
  const c = estado.connection;
  const funil = (id: string) => estado.pipelines.find((p) => p.id === id);

  return (
    <div>
      <CabecalhoDaSecao
        nivel={2}
        titulo="Hotmart"
        descricao="As vendas da Hotmart entram direto no CRM: contato, negócio no funil do produto, etapa pela situação da compra e uma linha por venda."
      />

      <div className="flex flex-col gap-2 empty:hidden [&:not(:empty)]:pb-4">{msg && <Notice tone={msg.tom}>{msg.texto}</Notice>}</div>

      {c && (
        <LinhaDeConfig rotulo="URL do webhook" descricao="Cadastre esta URL na Hotmart em Ferramentas › Webhook, versão 2.0, com todos os eventos.">
          <div className="flex items-center gap-1">
            <code className="min-w-0 break-all rounded-[10px] bg-raised px-2 py-1 font-mono text-caption">{c.url}</code>
            <Copiar texto={c.url} />
          </div>
        </LinhaDeConfig>
      )}

      <LinhaDeConfig rotulo="Hottok" htmlFor="hotmart-hottok" descricao="O token que a Hotmart mostra na tela do webhook. Confere que a chamada veio dela.">
        <div className="flex max-w-md gap-2">
          <Input
            id="hotmart-hottok"
            type="password"
            autoComplete="off"
            placeholder={c?.hasHottok ? "••• salvo (digite para trocar)" : "Cole o hottok"}
            value={hottok}
            onChange={(e) => setHottok(e.target.value)}
          />
          <Button type="button" disabled={ocupado || !hottok.trim()} onClick={() => void salvar({ hottok }, c ? "Hottok trocado." : "Conexão criada. Agora ligue os produtos.")}>
            Salvar
          </Button>
        </div>
      </LinhaDeConfig>

      {c && (
        <LinhaDeConfig rotulo="Recebendo vendas" descricao={c.lastEventAt ? `Último evento em ${dataHoraBR(c.lastEventAt)}.` : "Nenhum evento recebido ainda."}>
          <Switch
            aria-label="Recebendo vendas"
            checked={c.status === "active"}
            disabled={ocupado}
            onCheckedChange={(v) => void salvar({ status: v ? "active" : "paused" }, v ? "Recebendo vendas." : "Pausado: os eventos chegam e são ignorados.")}
          />
        </LinhaDeConfig>
      )}

      {c && (
        <>
          <CabecalhoDaSecao nivel={2} titulo="Produtos" descricao="Cada produto da Hotmart aponta para um funil. Produto sem funil é ignorado (aparece nos eventos)." />
          <div className="flex flex-col gap-4">
            {linhas.map((l, i) => {
              const p = funil(l.pipelineId);
              const papeis = ROLES[l.model];
              const faltando = p ? papeis.filter((r) => !l.stages[r]) : [];
              return (
                <div key={i} className="flex flex-col gap-3 rounded-[14px] border border-border-subtle p-3">
                  <div className="grid gap-2 sm:grid-cols-[140px_1fr_160px_1fr_auto]">
                    <Input aria-label="Id do produto na Hotmart" inputMode="numeric" placeholder="Id na Hotmart" value={l.hotmartId} onChange={(e) => mudar(i, { hotmartId: e.target.value.replace(/\D/g, "") })} />
                    <Input aria-label="Nome do produto" placeholder="Nome" value={l.name} onChange={(e) => mudar(i, { name: e.target.value })} />
                    <Select aria-label="Modelo" value={l.model} onChange={(e) => mudar(i, { model: e.target.value as Linha["model"] })}>
                      <option value="one_time">Compra única</option>
                      <option value="subscription">Assinatura</option>
                    </Select>
                    <Select
                      aria-label="Funil"
                      value={l.pipelineId}
                      onChange={(e) => mudar(i, { pipelineId: e.target.value, stages: { ...(funil(e.target.value)?.suggestion ?? {}) } })}
                    >
                      <option value="">Escolha o funil</option>
                      {estado.pipelines.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </Select>
                    <IconButton aria-label="Remover produto" tooltip variant="ghost" onClick={() => setLinhas((ls) => ls.filter((_, j) => j !== i))}>
                      <Trash2 size={14} />
                    </IconButton>
                  </div>
                  {p && (
                    <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
                      {papeis.map((r) => (
                        <label key={r} className="flex flex-col gap-1 text-caption text-text-secondary">
                          {ROLE_LABELS[r]}
                          <Select value={l.stages[r] ?? ""} onChange={(e) => mudar(i, { stages: { ...l.stages, [r]: e.target.value || undefined } })}>
                            <option value="">Sem etapa</option>
                            {p.stages.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </Select>
                        </label>
                      ))}
                    </div>
                  )}
                  {faltando.length > 0 && (
                    <Notice tone="warning">Sem etapa para: {faltando.map((r) => ROLE_LABELS[r]).join(", ")}. Evento que pede essa etapa não move o negócio.</Notice>
                  )}
                </div>
              );
            })}
          </div>
          <RodapeDaSecao>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setLinhas((ls) => [...ls, { hotmartId: "", name: "", slug: "", model: "one_time", pipelineId: "", stages: {} }])}
            >
              <Plus size={14} aria-hidden="true" /> Adicionar produto
            </Button>
            <Button
              type="button"
              disabled={ocupado || linhas.some((l) => !l.hotmartId || !l.pipelineId)}
              onClick={() =>
                void salvar(
                  { products: Object.fromEntries(linhas.map(({ hotmartId, ...l }) => [hotmartId, { ...l, slug: l.slug || l.name.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") }])) },
                  "Produtos salvos."
                )
              }
            >
              Salvar produtos
            </Button>
          </RodapeDaSecao>

          <CabecalhoDaSecao nivel={2} titulo="Últimos eventos" descricao="Os 50 mais recentes. Reprocessar aplica de novo com o mapeamento atual." />
          {eventos.length === 0 ? (
            <p className="text-small text-text-tertiary">Nenhum evento recebido ainda.</p>
          ) : (
            <div className="overflow-x-auto rounded-[14px] border border-border-subtle">
              <table className="w-full text-left text-caption">
                <thead className="bg-raised font-mono text-text-tertiary">
                  <tr>
                    <th className="px-3 py-2 font-normal">Quando</th>
                    <th className="px-3 py-2 font-normal">Evento</th>
                    <th className="px-3 py-2 font-normal">E-mail</th>
                    <th className="px-3 py-2 font-normal">Resultado</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {eventos.map((e) => {
                    const r = RESULTADO[e.result] ?? { rotulo: e.result, variant: "neutral" as const };
                    return (
                      <tr key={e.id}>
                        <td className="whitespace-nowrap px-3 py-2 text-text-secondary">{dataHoraBR(e.createdAt)}</td>
                        <td className="px-3 py-2 font-mono">{e.event}</td>
                        <td className="px-3 py-2 break-all">{e.email ?? "—"}</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-col items-start gap-1">
                            <Badge variant={r.variant}>{r.rotulo}</Badge>
                            {e.detail && <span className="text-text-tertiary">{e.detail}</span>}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">
                          {e.dealId && (
                            <Link href={`/deals/${e.dealId}`} className="text-accent-fg hover:underline">
                              Negócio
                            </Link>
                          )}
                          {(e.result === "error" || e.result === "ignored") && (
                            <Button type="button" variant="ghost" size="sm" disabled={ocupado} onClick={() => void reprocessar(e.id)}>
                              <RefreshCw size={14} aria-hidden="true" /> Reprocessar
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
