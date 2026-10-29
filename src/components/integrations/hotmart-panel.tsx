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
import { CabecalhoDaSecao, EsqueletoDeLista, LinhaDeConfig, RodapeDaSecao, RotuloDeGrupo } from "@/components/configuracoes/secao";
import { dataHoraBR } from "@/lib/exportar/csv";
import { ROLES, ROLE_LABELS, type ProductConfig, type StageRole } from "@/lib/hotmart/types";
import { compatible, hotmartFields, type FieldMap, type HotmartField } from "@/lib/hotmart/fields";

interface Pipeline {
  id: string;
  name: string;
  stages: { id: string; name: string }[];
  suggestion: Partial<Record<StageRole, string>>;
}
interface CampoDoContrato {
  entity: string;
  key: string;
  label: string;
  type: string;
}
interface Estado {
  connection: { url: string; hasHottok: boolean; hasApiCredentials: boolean; products: Record<string, ProductConfig>; fields: FieldMap; status: string; lastEventAt: string | null } | null;
  pipelines: Pipeline[];
  customFields: CampoDoContrato[];
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
  imported: boolean;
}
type Linha = ProductConfig & { hotmartId: string };
// Nenhum evento leva à lista de interesse; sem "atrasado" o evento cai em "aguardando".
const OPCIONAIS: StageRole[] = ["waitlist", "late"];

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

      <div className="flex flex-col gap-2 empty:hidden [&:not(:empty)]:pb-4">
        {c && !c.hasHottok && <Notice tone="warning">Sem hottok salvo, a URL recusa todas as chamadas. Salve o hottok antes de cadastrar a URL na Hotmart.</Notice>}
        {msg && <Notice tone={msg.tom}>{msg.texto}</Notice>}
      </div>

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

      <CabecalhoDaSecao nivel={2} titulo="Produtos" descricao="Cada produto da Hotmart aponta para um funil. Produto sem funil é ignorado (aparece nos eventos)." />
      <div className="flex flex-col gap-4">
        {linhas.map((l, i) => {
          const p = funil(l.pipelineId);
          const papeis = ROLES[l.model];
          const faltando = p ? papeis.filter((r) => !l.stages[r] && !OPCIONAIS.includes(r)) : [];
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

      {c && Object.keys(c.products).length > 0 && (
        <SecaoDeCampos
          key={JSON.stringify([c.fields, c.products, estado.customFields])}
          products={c.products}
          salvo={c.fields ?? {}}
          campos={estado.customFields}
          ocupado={ocupado}
          onSalvar={(fields) => void salvar({ fields }, "Campos salvos.")}
        />
      )}

      {c && Object.keys(c.products).length > 0 && (
        <SecaoDoHistorico temCredencial={c.hasApiCredentials} ocupado={ocupado} salvar={salvar} aoMudar={carregar} />
      )}

      {c && (
        <>
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
                        <td className="px-3 py-2">
                          <span className="font-mono">{e.event}</span>
                          {e.imported && <Badge variant="neutral" className="ml-1.5">importação</Badge>}
                        </td>
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

const CRIAR = "+new";

/** Escolha inicial: o que está salvo; senão o campo de mesma chave; senão criar (essenciais) ou não gravar. */
function escolhaInicial(f: HotmartField, salvo: FieldMap, campos: CampoDoContrato[]): string {
  const existe = (key: string | null) => !!key && campos.some((x) => x.entity === f.entity && x.key === key && compatible(f.type, x.type));
  if (f.id in salvo) return salvo[f.id] === null ? "" : existe(salvo[f.id]) ? salvo[f.id]! : f.essential ? CRIAR : "";
  if (existe(f.id)) return f.id;
  return f.essential ? CRIAR : "";
}

// Para onde vai cada dado da Hotmart: o campo padrão (criado na hora), um
// campo que o contrato já tem ou nenhum. Os obrigatórios da regra não
// aparecem: são criados sozinhos.
function SecaoDeCampos({
  products,
  salvo,
  campos,
  ocupado,
  onSalvar,
}: {
  products: Record<string, ProductConfig>;
  salvo: FieldMap;
  campos: CampoDoContrato[];
  ocupado: boolean;
  onSalvar: (escolhas: Record<string, string>) => void;
}) {
  const catalogo = React.useMemo(() => hotmartFields(products).filter((f) => !f.required), [products]);
  // Campos que a regra lê de volta (evento repetido) não podem receber outro dado.
  const reservados = React.useMemo(
    () => new Set(hotmartFields(products).filter((f) => f.required).map((f) => (salvo[f.id] ?? f.id) as string)),
    [products, salvo]
  );
  const [escolhas, setEscolhas] = React.useState<Record<string, string>>(() => Object.fromEntries(catalogo.map((f) => [f.id, escolhaInicial(f, salvo, campos)])));
  const [todos, setTodos] = React.useState(false);
  const visiveis = catalogo.filter((f) => todos || f.essential);
  const escondidos = catalogo.length - visiveis.length;
  const gravandoEscondidos = catalogo.filter((f) => !f.essential && escolhas[f.id] !== "").length;
  const novos = catalogo.filter((f) => escolhas[f.id] === CRIAR).length;

  return (
    <>
      <CabecalhoDaSecao
        nivel={2}
        titulo="Campos"
        descricao="Para onde vai cada dado da Hotmart. Crie o campo sugerido, escolha um campo seu ou deixe sem gravar."
      />
      {(["contact", "deal"] as const).map((entity) => {
        const lista = visiveis.filter((f) => f.entity === entity);
        if (!lista.length) return null;
        const doTipo = campos.filter((x) => x.entity === entity);
        return (
          <div key={entity} className="pb-2">
            <RotuloDeGrupo>{entity === "contact" ? "Contato" : "Negócio"}</RotuloDeGrupo>
            {lista.map((f) => {
              const existentes = doTipo.filter((x) => compatible(f.type, x.type) && !reservados.has(x.key));
              const temPadrao = existentes.some((x) => x.key === f.id);
              return (
                <LinhaDeConfig key={f.id} rotulo={f.label} descricao={f.hint} htmlFor={`hotmart-campo-${f.id}`}>
                  <Select
                    id={`hotmart-campo-${f.id}`}
                    className="max-w-xs"
                    value={escolhas[f.id]}
                    onChange={(e) => setEscolhas((v) => ({ ...v, [f.id]: e.target.value }))}
                  >
                    {!temPadrao && <option value={CRIAR}>Criar campo &quot;{f.label}&quot;</option>}
                    {existentes.map((x) => (
                      <option key={x.key} value={x.key}>
                        {x.label}
                      </option>
                    ))}
                    <option value="">Não gravar</option>
                  </Select>
                </LinhaDeConfig>
              );
            })}
          </div>
        );
      })}
      <RodapeDaSecao mensagem={novos > 0 ? `${novos} ${novos === 1 ? "campo novo será criado" : "campos novos serão criados"} ao salvar.` : undefined}>
        {(escondidos > 0 || todos) && (
          <Button type="button" variant="ghost" onClick={() => setTodos((t) => !t)}>
            {todos ? "Mostrar só os principais" : `Mostrar mais ${escondidos} dados${gravandoEscondidos ? ` (${gravandoEscondidos} já gravando)` : ""}`}
          </Button>
        )}
        <Button type="button" disabled={ocupado} onClick={() => onSalvar(escolhas)}>
          Salvar campos
        </Button>
      </RodapeDaSecao>
    </>
  );
}

interface Importacao {
  status: string;
  phase: "fetch" | "preview" | "apply";
  from: string;
  to: string;
  total: number;
  processed: number;
  applied: number;
  ignored: number;
  failed: number;
  preview: { events: number; contacts: Contagem; deals: Contagem; sales: Contagem } | null;
  error: string | null;
  finishedAt: string | null;
}
type Contagem = { new: number; existing: number };
const ATIVA = ["queued", "processing", "awaiting_confirmation"];
const CREDENCIAIS = [
  { k: "clientId", rotulo: "Client ID" },
  { k: "clientSecret", rotulo: "Client Secret" },
  { k: "basic", rotulo: "Basic" },
] as const;
const hojeEmSP = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const dataBR = (d: string) => d.split("-").reverse().join("/");
const qtd = (x: number, um: string, varios: string) => `${x.toLocaleString("pt-BR")} ${x === 1 ? um : varios}`;

// Histórico de vendas: credenciais da API (a importação só lê) e a importação
// com prévia. O relógio do servidor faz o trabalho a cada minuto; a tela acompanha.
function SecaoDoHistorico({
  temCredencial,
  ocupado,
  salvar,
  aoMudar,
}: {
  temCredencial: boolean;
  ocupado: boolean;
  salvar: (corpo: unknown, ok: string) => Promise<void>;
  aoMudar: () => Promise<void>;
}) {
  const [cred, setCred] = React.useState({ clientId: "", clientSecret: "", basic: "" });
  const [job, setJob] = React.useState<Importacao | null | undefined>(undefined);
  const [de, setDe] = React.useState("2020-01-01");
  const [ate, setAte] = React.useState(hojeEmSP);
  const [erro, setErro] = React.useState<string | null>(null);
  const [enviando, setEnviando] = React.useState(false);

  const ler = React.useCallback(async () => {
    const r = await fetch("/api/integrations/hotmart/import").then((x) => (x.ok ? x.json() : null)).catch(() => null);
    if (r) setJob(r.job);
  }, []);
  React.useEffect(() => {
    void ler();
  }, [ler]);

  const rodando = !!job && (job.status === "queued" || job.status === "processing");
  React.useEffect(() => {
    if (!rodando) return;
    const t = setInterval(() => void ler(), 5000);
    return () => clearInterval(t);
  }, [rodando, ler]);
  // Parou de rodar (aplicou, falhou, cancelou): a lista de eventos mudou.
  const rodava = React.useRef(rodando);
  React.useEffect(() => {
    if (rodava.current && !rodando) void aoMudar();
    rodava.current = rodando;
  }, [rodando, aoMudar]);

  async function acao(url: string, method: string, corpo?: unknown) {
    setEnviando(true);
    setErro(null);
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: corpo ? JSON.stringify(corpo) : undefined });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Não deu certo.");
      await ler();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não deu certo.");
    } finally {
      setEnviando(false);
    }
  }

  const credCompleta = CREDENCIAIS.every(({ k }) => cred[k].trim());
  const ativa = !!job && ATIVA.includes(job.status);
  const p = job?.preview;
  const cancelar = (
    <Button type="button" variant="secondary" disabled={enviando} onClick={() => void acao("/api/integrations/hotmart/import", "DELETE")}>
      Cancelar
    </Button>
  );

  return (
    <>
      <CabecalhoDaSecao
        nivel={2}
        titulo="Histórico de vendas"
        descricao="Traz as vendas antigas da Hotmart pela mesma regra do webhook: contato, card que faltar e uma linha por venda. Antes de gravar, mostra uma prévia."
      />
      <LinhaDeConfig
        rotulo="API da Hotmart"
        descricao="Na Hotmart: Ferramentas › Credenciais Hotmart › criar uma credencial da API. Copie o Client ID, o Client Secret e o Basic. A importação só lê."
      >
        <div className="flex max-w-md flex-col gap-2">
          {CREDENCIAIS.map(({ k, rotulo }) => (
            <Input
              key={k}
              aria-label={rotulo}
              type="password"
              autoComplete="off"
              placeholder={temCredencial ? `${rotulo} (salvo; digite para trocar)` : rotulo}
              value={cred[k]}
              onChange={(e) => setCred((v) => ({ ...v, [k]: e.target.value }))}
            />
          ))}
          <div>
            <Button
              type="button"
              variant="secondary"
              disabled={ocupado || !credCompleta}
              onClick={() => void salvar(cred, "Credenciais da API salvas.").then(() => setCred({ clientId: "", clientSecret: "", basic: "" }))}
            >
              Salvar credenciais
            </Button>
          </div>
        </div>
      </LinhaDeConfig>

      <div className="flex flex-col gap-3 pb-4">
        {erro && <Notice tone="danger">{erro}</Notice>}
        {job === undefined ? null : !job || !ativa ? (
          <>
            {job?.status === "completed" && job.phase === "apply" && (
              <Notice tone="info">
                Importação concluída{job.finishedAt ? ` em ${dataHoraBR(job.finishedAt)}` : ""}: {qtd(job.applied, "evento aplicado", "eventos aplicados")}, {job.ignored} ignorados.
              </Notice>
            )}
            {job?.status === "completed_with_errors" && (
              <Notice tone="warning">
                Importação concluída com {qtd(job.failed, "erro", "erros")} ({job.applied} aplicados). Os eventos com erro estão na lista abaixo para reprocessar.
              </Notice>
            )}
            {job?.status === "completed" && job.phase !== "apply" && <Notice tone="info">Nada novo para importar no período.</Notice>}
            {job?.status === "failed" && <Notice tone="danger">A importação parou: {job.error ?? "erro desconhecido"}</Notice>}
            {job?.status === "canceled" && <Notice tone="info">Importação cancelada.</Notice>}
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-caption text-text-secondary">
                De
                <Input type="date" value={de} max={ate} onChange={(e) => setDe(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1 text-caption text-text-secondary">
                Até
                <Input type="date" value={ate} min={de} onChange={(e) => setAte(e.target.value)} />
              </label>
              <Button type="button" disabled={enviando || !temCredencial || !de || !ate} onClick={() => void acao("/api/integrations/hotmart/import", "POST", { from: de, to: ate })}>
                Buscar histórico
              </Button>
            </div>
            {!temCredencial && <p className="text-caption text-text-tertiary">Salve as credenciais da API para buscar o histórico.</p>}
          </>
        ) : job.status === "awaiting_confirmation" && p ? (
          <>
            <Notice tone="info">
              Vai criar {qtd(p.contacts.new, "contato", "contatos")}, {qtd(p.deals.new, "card", "cards")} e {qtd(p.sales.new, "venda", "vendas")}. Já existem{" "}
              {qtd(p.contacts.existing, "contato", "contatos")}, {qtd(p.deals.existing, "card", "cards")} e {qtd(p.sales.existing, "venda", "vendas")}, que só são
              atualizados. Os cards andam de etapa pela regra de sempre, sem disparar automações ({qtd(p.events, "evento", "eventos")} de {dataBR(job.from)} a{" "}
              {dataBR(job.to)}).
            </Notice>
            <div className="flex gap-2">
              <Button type="button" disabled={enviando} onClick={() => void acao("/api/integrations/hotmart/import/confirm", "POST")}>
                Importar
              </Button>
              {cancelar}
            </div>
          </>
        ) : (
          <>
            <Notice tone="info">
              {job.phase === "fetch"
                ? `Buscando na Hotmart: ${qtd(job.total, "evento encontrado", "eventos encontrados")}.`
                : job.phase === "preview"
                  ? "Contando o que muda no CRM."
                  : `Importando: ${job.processed.toLocaleString("pt-BR")} de ${job.total.toLocaleString("pt-BR")}.`}{" "}
              O servidor avança a cada minuto; pode fechar esta tela.
            </Notice>
            <div>{cancelar}</div>
          </>
        )}
      </div>
    </>
  );
}
