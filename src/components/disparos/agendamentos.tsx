"use client";

import * as React from "react";
import { Ban, CalendarClock, CheckCircle2, Clock, Plus, Users, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Modal, ModalContent } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { CampoDataSP } from "@/components/whatsapp/campo-data-sp";
import { amanhaAs, deSaoPaulo, paraCampoSaoPaulo, partesEmSP } from "@/lib/fuso-sp";
import { jidDoWhatsApp } from "@/lib/telefone";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Agendamentos do app Disparo: mensagens que saem sozinhas num dia e horário,
// separadas em "Individual" (uma pessoa) e "Grupos" (grupo do WhatsApp do chip).
// Por baixo é a mesma avulsa agendada da conversa (Broadcast kind="single"),
// com o jid do grupo (@g.us) no lugar do número.
// ---------------------------------------------------------------------------

export type Tipo = "individual" | "grupo";

export interface Agendada {
  id: string;
  agentId: string;
  agentName: string;
  to: string;
  text: string;
  status: string;
  scheduledAt: string | null;
  lastError: string | null;
  failedCount: number;
}

interface Chip { canalId: string; agentId: string | null; agente: string | null; numero: string; sessao: string }
interface Grupo { jid: string; subject: string | null; participantsCount: number | null; present: boolean }

/** (11) 95506-1290 a partir do jid ou do número. */
export function numeroLegivel(to: string): string {
  const d = to.split("@")[0].replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return to.split("@")[0];
}

const DIAS_DA_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** "Hoje", "Amanhã" ou "quinta, 20/11", no horário de São Paulo. */
function rotuloDoDia(iso: string): string {
  const p = partesEmSP(new Date(iso));
  const hoje = partesEmSP(new Date());
  const amanha = partesEmSP(new Date(Date.now() + 86_400_000));
  const igual = (a: typeof p, b: typeof p) => a.ano === b.ano && a.mes === b.mes && a.dia === b.dia;
  if (igual(p, hoje)) return "Hoje";
  if (igual(p, amanha)) return "Amanhã";
  const semana = DIAS_DA_SEMANA[new Date(Date.UTC(p.ano, p.mes - 1, p.dia)).getUTCDay()];
  return `${semana}, ${String(p.dia).padStart(2, "0")}/${String(p.mes).padStart(2, "0")}`;
}

function hora(iso: string): string {
  const p = partesEmSP(new Date(iso));
  return `${String(p.hora).padStart(2, "0")}:${String(p.minuto).padStart(2, "0")}`;
}

/** Agrupa por dia, na ordem da lista. */
function porDia(itens: Agendada[]): [string, Agendada[]][] {
  const grupos = new Map<string, Agendada[]>();
  for (const a of itens) {
    const dia = a.scheduledAt ? rotuloDoDia(a.scheduledAt) : "Sem data";
    grupos.set(dia, [...(grupos.get(dia) ?? []), a]);
  }
  return [...grupos];
}

function Situacao({ a }: { a: Agendada }) {
  if (a.status === "scheduled") return <span className="inline-flex items-center gap-1 text-caption text-text-tertiary"><Clock size={11} aria-hidden /> Agendada</span>;
  if (a.status === "sending") return <span className="text-caption text-text-tertiary">Enviando…</span>;
  if (a.status === "canceled") return <span className="text-caption text-text-tertiary">Cancelada</span>;
  if (a.failedCount > 0) return <span className="inline-flex items-center gap-1 text-caption text-danger"><XCircle size={11} aria-hidden /> {a.lastError ?? "Não saiu"}</span>;
  return <span className="inline-flex items-center gap-1 text-caption text-success"><CheckCircle2 size={11} aria-hidden /> Enviada</span>;
}

/** Lista por dia: hora, para quem, texto e cancelar. */
export function ListaPorDia({
  itens, nomeDoDestino, onCancelar, compacta,
}: {
  itens: Agendada[];
  nomeDoDestino: (to: string) => string;
  onCancelar: (id: string) => void;
  compacta?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      {porDia(itens).map(([dia, lista]) => (
        <section key={dia} className="flex flex-col gap-1.5">
          <h3 className="text-caption font-medium capitalize text-text-tertiary">{dia}</h3>
          <ul className="flex flex-col gap-1.5">
            {lista.map((a) => (
              <li key={a.id} className={cn("flex items-start gap-3 rounded-[14px] bg-raised", compacta ? "px-3 py-2" : "px-4 py-3")}>
                <span className="w-11 shrink-0 pt-px font-mono text-small tabular-nums text-text-primary">{a.scheduledAt ? hora(a.scheduledAt) : "--:--"}</span>
                <span className="min-w-0 flex-1">
                  {!compacta && (
                    <span className="block truncate text-small font-medium text-text-primary">
                      {nomeDoDestino(a.to)} <span className="font-normal text-text-tertiary">· {a.agentName}</span>
                    </span>
                  )}
                  <span className={cn("block whitespace-pre-line text-small text-text-secondary", compacta ? "line-clamp-3" : "line-clamp-2")}>{a.text}</span>
                  <span className="mt-0.5 block"><Situacao a={a} /></span>
                </span>
                {a.status === "scheduled" && (
                  <button
                    type="button"
                    onClick={() => onCancelar(a.id)}
                    aria-label="Cancelar agendamento"
                    title="Cancelar"
                    className="grid size-8 shrink-0 place-items-center rounded-lg text-text-tertiary transition-colors hover:bg-danger-subtle hover:text-danger"
                  >
                    <Ban size={14} aria-hidden />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Próximas primeiro (da mais perto à mais longe), depois as que já saíram (mais recente primeiro). */
export function ordenar(itens: Agendada[]): { proximas: Agendada[]; passadas: Agendada[] } {
  const t = (a: Agendada) => (a.scheduledAt ? new Date(a.scheduledAt).getTime() : 0);
  return {
    proximas: itens.filter((a) => a.status === "scheduled" || a.status === "sending").sort((a, b) => t(a) - t(b)),
    passadas: itens.filter((a) => a.status !== "scheduled" && a.status !== "sending").sort((a, b) => t(b) - t(a)),
  };
}

export async function cancelarAgendada(id: string): Promise<string | null> {
  if (!window.confirm("Cancelar esta mensagem agendada?")) return null;
  const res = await fetch(`/api/mensagens-agendadas/${id}`, { method: "DELETE" });
  const data = await res.json().catch(() => ({}));
  return res.ok ? null : data.error ?? "Não foi possível cancelar.";
}

/** Formulário de agendar (pessoa ou grupo). Destino fixo quando vem da conversa. */
export function ModalDeAgendar({
  tipo, chips, gruposDoChip, fixo, onFechar, onSalvou,
}: {
  tipo: Tipo;
  chips: Chip[];
  gruposDoChip: (canalId: string) => Promise<Grupo[]>;
  fixo?: { agentId: string; to: string; nome: string };
  onFechar: () => void;
  onSalvou: () => void;
}) {
  const comAgente = chips.filter((c) => c.agentId);
  const [canalId, setCanalId] = React.useState(() => (fixo ? comAgente.find((c) => c.agentId === fixo.agentId)?.canalId : comAgente[0]?.canalId) ?? "");
  const [numero, setNumero] = React.useState("");
  // Grupos do chip escolhido; trocou de chip, a lista antiga não vale.
  const [doChip, setDoChip] = React.useState<{ canalId: string; lista: Grupo[] } | null>(null);
  const grupos = doChip?.canalId === canalId ? doChip.lista : null;
  const [grupo, setGrupo] = React.useState("");
  const [quando, setQuando] = React.useState(() => paraCampoSaoPaulo(amanhaAs(9)));
  const [texto, setTexto] = React.useState("");
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const chip = comAgente.find((c) => c.canalId === canalId) ?? null;

  React.useEffect(() => {
    if (tipo !== "grupo" || !canalId) return;
    let vivo = true;
    gruposDoChip(canalId).then((g) => {
      if (!vivo) return;
      setDoChip({ canalId, lista: g });
      setGrupo(g[0]?.jid ?? "");
    });
    return () => {
      vivo = false;
    };
  }, [tipo, canalId, gruposDoChip]);

  const destino = fixo?.to ?? (tipo === "grupo" ? grupo : jidDoWhatsApp(numero) ?? "");
  const instante = deSaoPaulo(quando);
  const pronto = !!chip?.agentId && !!destino && !!instante && texto.trim().length > 0;

  async function salvar() {
    if (!pronto || !chip?.agentId || !instante) return;
    setSalvando(true);
    setErro(null);
    const res = await fetch("/api/mensagens-agendadas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId: chip.agentId, channel: "whatsapp_qr", to: destino, text: texto.trim(), scheduledAt: instante.toISOString() }),
    });
    const data = await res.json().catch(() => ({}));
    setSalvando(false);
    if (!res.ok) return setErro(data.error ?? "Não foi possível agendar.");
    onSalvou();
    onFechar();
  }

  return (
    <Modal open onOpenChange={(o) => !o && onFechar()}>
      <ModalContent
        title={tipo === "grupo" ? "Agendar para grupo" : fixo ? `Agendar para ${fixo.nome}` : "Agendar mensagem"}
        description="Sai sozinha no dia e horário marcados (horário de São Paulo). Dá para cancelar até a hora."
        className="max-h-[92vh] max-w-lg overflow-y-auto"
      >
        <div className="flex flex-col gap-4">
          {comAgente.length === 0 ? (
            <p className="rounded-[14px] bg-raised px-4 py-3 text-small text-text-secondary">Nenhum chip ligado a um agente. Conecte um chip em Chips.</p>
          ) : (
            !fixo && (
              <div>
                <Label htmlFor="ag-chip">Chip</Label>
                <Select id="ag-chip" value={canalId} onChange={(e) => setCanalId(e.target.value)}>
                  {comAgente.map((c) => (
                    <option key={c.canalId} value={c.canalId}>
                      {numeroLegivel(c.numero)}{c.agente ? ` · ${c.agente}` : ""}{c.sessao === "connected" ? "" : " (desconectado)"}
                    </option>
                  ))}
                </Select>
              </div>
            )
          )}

          {!fixo && tipo === "individual" && (
            <div>
              <Label htmlFor="ag-numero">Número</Label>
              <Input id="ag-numero" inputMode="tel" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="(11) 99999-9999" />
              {numero.trim() && !jidDoWhatsApp(numero) && <p className="mt-1 text-caption text-danger">Número incompleto: DDD + número.</p>}
            </div>
          )}

          {!fixo && tipo === "grupo" && chip && (
            <div>
              <Label htmlFor="ag-grupo">Grupo</Label>
              {grupos === null ? (
                <p className="text-small text-text-tertiary">Buscando os grupos do chip…</p>
              ) : grupos.length === 0 ? (
                <p className="text-small text-text-tertiary">Este chip não está em nenhum grupo (ou ainda não sincronizou).</p>
              ) : (
                <Select id="ag-grupo" value={grupo} onChange={(e) => setGrupo(e.target.value)}>
                  {grupos.map((g) => (
                    <option key={g.jid} value={g.jid}>
                      {g.subject || g.jid}{g.participantsCount ? ` · ${g.participantsCount} pessoas` : ""}
                    </option>
                  ))}
                </Select>
              )}
            </div>
          )}

          <div>
            <Label htmlFor="ag-quando">Dia e horário</Label>
            <CampoDataSP id="ag-quando" valor={quando} onChange={setQuando} />
          </div>

          <div>
            <Label htmlFor="ag-texto">Mensagem</Label>
            <Textarea id="ag-texto" rows={5} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escreva a mensagem" />
          </div>

          {erro && <p className="text-small text-danger">{erro}</p>}
          <Button type="button" onClick={salvar} disabled={!pronto} loading={salvando}>
            {!salvando && <CalendarClock size={14} aria-hidden />} Agendar
          </Button>
        </div>
      </ModalContent>
    </Modal>
  );
}

function useChips() {
  const [chips, setChips] = React.useState<Chip[]>([]);
  React.useEffect(() => {
    fetch("/api/chips")
      .then((r) => (r.ok ? r.json() : { chips: [] }))
      .then((d: { chips?: Chip[] }) => setChips(d.chips ?? []))
      .catch(() => {});
  }, []);
  return chips;
}

/** Grupos de um chip, uma busca por chip. */
function useGrupos() {
  const cache = React.useRef(new Map<string, Promise<Grupo[]>>());
  return React.useCallback((canalId: string) => {
    let p = cache.current.get(canalId);
    if (!p) {
      p = fetch(`/api/channels/${canalId}/groups`)
        .then((r) => (r.ok ? r.json() : { groups: [] }))
        .then((d: { groups?: Grupo[] }) => (d.groups ?? []).filter((g) => g.present))
        .catch(() => []);
      cache.current.set(canalId, p);
    }
    return p;
  }, []);
}

/** Tela Agendamentos: abas Individual e Grupos. */
export function TelaDeAgendamentos() {
  const [tipo, setTipo] = React.useState<Tipo>("individual");
  // A lista guarda de qual aba veio: trocar de aba mostra "carregando", não a da outra.
  const [lido, setLido] = React.useState<{ tipo: Tipo; itens: Agendada[] } | null>(null);
  const itens = lido?.tipo === tipo ? lido.itens : null;
  const [versao, setVersao] = React.useState(0);
  const carregar = React.useCallback(() => setVersao((v) => v + 1), []);
  const [novo, setNovo] = React.useState(false);
  const [verPassadas, setVerPassadas] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [nomesDosGrupos, setNomesDosGrupos] = React.useState<Map<string, string>>(new Map());
  const chips = useChips();
  const gruposDoChip = useGrupos();

  React.useEffect(() => {
    let vivo = true;
    const buscar = () =>
      fetch(`/api/mensagens-agendadas?todas=${tipo}`)
        .then((r) => (r.ok ? r.json() : { agendadas: [] }))
        .then((d: { agendadas?: Agendada[] }) => vivo && setLido({ tipo, itens: d.agendadas ?? [] }))
        .catch(() => {});
    void buscar();
    const t = setInterval(() => void buscar(), 20_000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [tipo, versao]);

  // Nome do grupo na lista: o jid sozinho não diz nada.
  React.useEffect(() => {
    if (tipo !== "grupo" || chips.length === 0) return;
    Promise.all(chips.map((c) => gruposDoChip(c.canalId))).then((todos) =>
      setNomesDosGrupos(new Map(todos.flat().map((g) => [g.jid, g.subject || g.jid])))
    );
  }, [tipo, chips, gruposDoChip]);

  async function cancelar(id: string) {
    setErro(await cancelarAgendada(id));
    carregar();
  }

  const { proximas, passadas } = ordenar(itens ?? []);
  const nome = (to: string) => (tipo === "grupo" ? nomesDosGrupos.get(to) ?? "Grupo" : numeroLegivel(to));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 pb-24 pt-4 sm:px-6 lg:pt-6 xl:max-w-5xl 2xl:max-w-6xl">
      <header className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight text-text-primary sm:text-[32px]">Agendamentos</h1>
          <p className="text-small text-text-tertiary">
            {itens === null ? "Carregando…" : proximas.length === 1 ? "1 mensagem para sair" : `${proximas.length} mensagens para sair`}
          </p>
        </div>
        <Button onClick={() => setNovo(true)}>
          <Plus size={15} aria-hidden /> Agendar
        </Button>
      </header>

      <SegmentedControl
        label="Tipo de agendamento"
        value={tipo}
        onChange={setTipo}
        options={[
          { value: "individual", label: "Individual" },
          { value: "grupo", label: "Grupos", icon: <Users size={13} aria-hidden /> },
        ]}
        className="self-start"
      />

      {erro && <p className="rounded-[10px] bg-danger-subtle px-3 py-2 text-small text-danger">{erro}</p>}

      {itens === null ? null : proximas.length === 0 ? (
        <div className="flex flex-col items-center rounded-[22px] border border-dashed border-border-subtle px-6 py-14 text-center">
          <CalendarClock size={22} className="mb-3 text-text-tertiary" aria-hidden />
          <p className="text-body font-medium text-text-primary">{tipo === "grupo" ? "Nada agendado para grupos" : "Nada agendado"}</p>
          <p className="mt-1 max-w-xs text-small text-text-tertiary">
            {tipo === "grupo" ? "Escolha o grupo, o dia e o horário: a mensagem sai sozinha pelo chip." : "Escolha o número, o dia e o horário: a mensagem sai sozinha pelo chip."}
          </p>
        </div>
      ) : (
        <ListaPorDia itens={proximas} nomeDoDestino={nome} onCancelar={cancelar} />
      )}

      {passadas.length > 0 && (
        <div className="flex flex-col gap-3">
          <button type="button" onClick={() => setVerPassadas((v) => !v)} className="self-start text-small text-text-tertiary hover:text-text-primary" aria-expanded={verPassadas}>
            {verPassadas ? "Esconder" : "Ver"} enviadas e canceladas ({passadas.length})
          </button>
          {verPassadas && <ListaPorDia itens={passadas} nomeDoDestino={nome} onCancelar={cancelar} />}
        </div>
      )}

      {novo && <ModalDeAgendar tipo={tipo} chips={chips} gruposDoChip={gruposDoChip} onFechar={() => setNovo(false)} onSalvou={carregar} />}
    </div>
  );
}

/** Painel da conversa (Disparo): as agendadas para esta pessoa, por dia, e agendar outra. */
export function AgendadasDaConversa({ agentId, to, nome }: { agentId: string; to: string; nome: string }) {
  const [itens, setItens] = React.useState<Agendada[] | null>(null);
  const [novo, setNovo] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const chips = useChips();
  const gruposDoChip = useGrupos();

  const [versao, setVersao] = React.useState(0);
  const carregar = React.useCallback(() => setVersao((v) => v + 1), []);

  React.useEffect(() => {
    let vivo = true;
    const q = new URLSearchParams({ agentId, channel: "whatsapp_qr", to });
    fetch(`/api/mensagens-agendadas?${q}`)
      .then((r) => (r.ok ? r.json() : { agendadas: [] }))
      .then((d: { agendadas?: Agendada[] }) => vivo && setItens(d.agendadas ?? []))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [agentId, to, versao]);

  const { proximas, passadas } = ordenar(itens ?? []);
  return (
    <section className="flex flex-col gap-2">
      <div className="flex min-h-6 items-center justify-between">
        <h3 className="font-mono text-caption text-text-tertiary">Mensagens agendadas</h3>
        <Button variant="ghost" size="sm" onClick={() => setNovo(true)} className="-mr-2 h-6 px-2">
          <Plus size={12} aria-hidden /> Agendar
        </Button>
      </div>
      {erro && <p className="text-caption text-danger">{erro}</p>}
      {itens === null ? (
        <p className="text-small text-text-tertiary">Carregando…</p>
      ) : proximas.length === 0 ? (
        <p className="text-small text-text-tertiary">Nada agendado para esta pessoa.</p>
      ) : (
        <ListaPorDia
          compacta
          itens={proximas}
          nomeDoDestino={() => nome}
          onCancelar={async (id) => {
            setErro(await cancelarAgendada(id));
            carregar();
          }}
        />
      )}
      {passadas.length > 0 && <p className="text-caption text-text-tertiary">{passadas.length} já saíram</p>}
      {novo && (
        <ModalDeAgendar
          tipo="individual"
          chips={chips}
          gruposDoChip={gruposDoChip}
          fixo={{ agentId, to, nome }}
          onFechar={() => setNovo(false)}
          onSalvou={carregar}
        />
      )}
    </section>
  );
}
