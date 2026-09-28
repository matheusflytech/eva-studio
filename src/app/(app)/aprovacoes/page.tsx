"use client";

import * as React from "react";
import Link from "next/link";
import {
  CheckCheck, RefreshCw, AlertTriangle, CheckCircle2, Clock, XCircle,
  PauseCircle, ArrowRight, Plug,
} from "lucide-react";
import { useAgentsStore } from "@/lib/stores/agents-store";
import { Select } from "@/components/ui/select";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Aprovações.
//
// Fora da janela de 24 horas, o WhatsApp oficial só entrega mensagem por
// template aprovado pela Meta. O app já deixava configurar QUAL template usar,
// mas nunca perguntava à Meta se aquele template existe e está aprovado — dava
// pra apontar para um rejeitado e só descobrir quando o disparo não chegasse
// em ninguém.
//
// Esta tela faz as duas perguntas ao mesmo tempo: o que a Meta aprovou, e o
// que está configurado aqui apontando para o vazio. A segunda é a que salva
// campanha.
// ---------------------------------------------------------------------------

interface TemplateMeta {
  id: string;
  nome: string;
  status: string;
  categoria: string;
  idioma: string;
  corpo: string;
  motivoRejeicao: string | null;
  qualidade: string | null;
  usadoAqui: boolean;
}

interface TemplateLocal {
  id: string;
  nome: string;
  metaTemplateName: string;
  idioma: string;
  corpo: string;
  situacao: string | null;
}

interface Payload {
  conectado: boolean;
  wabaId?: string;
  erro?: string | null;
  templates: TemplateMeta[];
  locais: TemplateLocal[];
}

const STATUS: Record<
  string,
  { rotulo: string; classe: string; icone: React.ComponentType<{ size?: number; className?: string }> }
> = {
  APPROVED: { rotulo: "Aprovado", classe: "bg-emerald-500/12 text-emerald-300", icone: CheckCircle2 },
  PENDING: { rotulo: "Em análise", classe: "bg-amber-400/12 text-amber-300", icone: Clock },
  IN_APPEAL: { rotulo: "Em recurso", classe: "bg-amber-400/12 text-amber-300", icone: Clock },
  REJECTED: { rotulo: "Rejeitado", classe: "bg-danger/12 text-danger", icone: XCircle },
  PAUSED: { rotulo: "Pausado", classe: "bg-danger/12 text-danger", icone: PauseCircle },
  DISABLED: { rotulo: "Desativado", classe: "bg-danger/12 text-danger", icone: XCircle },
  PENDING_DELETION: { rotulo: "Sendo apagado", classe: "bg-surface-3 text-text-tertiary", icone: Clock },
  AUSENTE: { rotulo: "Não existe na Meta", classe: "bg-danger/12 text-danger", icone: AlertTriangle },
};

function Etiqueta({ status }: { status: string }) {
  const s = STATUS[status] ?? { rotulo: status, classe: "bg-surface-3 text-text-tertiary", icone: Clock };
  const Icone = s.icone;
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium", s.classe)}>
      <Icone size={11} /> {s.rotulo}
    </span>
  );
}

/** Só estes entregam. Qualquer outro estado é uma mensagem que não sai. */
function entrega(status: string | null): boolean {
  return status === "APPROVED";
}

export default function AprovacoesPage() {
  const { agents, isLoaded, load } = useAgentsStore();
  const [agentId, setAgentId] = React.useState("");
  const [dados, setDados] = React.useState<Payload | null>(null);
  const [carregando, setCarregando] = React.useState(false);

  React.useEffect(() => {
    if (!isLoaded) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded]);

  React.useEffect(() => {
    if (!agentId && agents.length > 0) setAgentId(agents[0].id);
  }, [agentId, agents]);

  const carregar = React.useCallback(async () => {
    if (!agentId) return;
    setCarregando(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/meta-templates`);
      setDados(res.ok ? await res.json() : null);
    } finally {
      setCarregando(false);
    }
  }, [agentId]);

  React.useEffect(() => { carregar(); }, [carregar]);

  // O que precisa de ação: modelo configurado aqui que não entrega lá.
  const quebrados = (dados?.locais ?? []).filter(
    (l) => l.metaTemplateName && l.situacao !== null && !entrega(l.situacao)
  );
  const semVinculo = (dados?.locais ?? []).filter((l) => !l.metaTemplateName);

  return (
    <div className="flex-1 p-8">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-text-primary">Aprovações</h1>
          <p className="mt-1 max-w-2xl text-[14px] text-text-secondary">
            Fora da janela de 24 horas, o WhatsApp oficial só entrega por template aprovado pela Meta. Aqui está
            o que ela aprovou, e o que está configurado neste agente apontando para o vazio.
          </p>
        </div>
        <div className="flex items-end gap-2">
          {agents.length > 0 && (
            <div className="min-w-[200px]">
              <p className="mb-1 text-[11.5px] text-text-tertiary">Agente</p>
              <Select value={agentId} onChange={(e) => setAgentId(e.target.value)}>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </Select>
            </div>
          )}
          <button
            type="button"
            onClick={carregar}
            title="Consultar a Meta de novo"
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-surface-2 px-3.5 text-[13px] font-medium text-text-secondary transition-colors hover:text-text-primary"
          >
            <RefreshCw size={14} className={cn(carregando && "animate-spin")} />
          </button>
        </div>
      </header>

      {!isLoaded || (carregando && !dados) ? (
        <p className="text-[13px] text-text-tertiary">Consultando a Meta...</p>
      ) : !dados?.conectado ? (
        <div className="glass-card rounded-3xl px-6 py-16 text-center">
          <Plug size={30} className="mx-auto mb-4 text-text-tertiary" />
          <h2 className="font-display text-lg font-semibold text-text-primary">
            Este agente não tem o WhatsApp oficial conectado
          </h2>
          <p className="mx-auto mt-2 max-w-md text-[13.5px] text-text-secondary">
            Template aprovado é coisa da Cloud API da Meta. Sem a conexão oficial não existe template para
            aprovar — e, por consequência, nada para mostrar aqui.
          </p>
          <Link
            href={`/agent-studio/${agentId}`}
            className={cn(buttonVariants({ variant: "secondary", size: "md" }), "mt-6")}
          >
            Conectar na aba do agente <ArrowRight size={15} />
          </Link>
        </div>
      ) : dados.erro ? (
        <div className="glass-card rounded-3xl px-6 py-10 text-center">
          <AlertTriangle size={26} className="mx-auto mb-3 text-amber-300" />
          <h2 className="font-display text-[16px] font-semibold text-text-primary">
            Não deu para consultar a Meta
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-[13px] text-text-secondary">{dados.erro}</p>
          <p className="mx-auto mt-2 max-w-lg text-[12px] text-text-tertiary">
            Costuma ser token expirado ou sem permissão na conta de negócio. A tela não inventa status: se não
            conseguiu perguntar, não afirma nada.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* O alarme vem antes da lista: quem abre esta tela quer saber se tem
              algo quebrado, não navegar por um catálogo. */}
          {quebrados.length > 0 && (
            <section className="glass-card rounded-3xl p-5 ring-1 ring-danger/25">
              <div className="mb-1 flex items-center gap-2.5">
                <AlertTriangle size={17} className="text-danger" />
                <h2 className="font-display text-[15.5px] font-semibold text-text-primary">
                  {quebrados.length === 1
                    ? "Um modelo deste agente não vai entregar"
                    : `${quebrados.length} modelos deste agente não vão entregar`}
                </h2>
              </div>
              <p className="mb-4 text-[12.5px] text-text-secondary">
                Estão configurados no Builder apontando para um template que a Meta não aprovou. Fora da janela
                de 24h, a mensagem simplesmente não sai.
              </p>
              <div className="flex flex-col gap-1.5">
                {quebrados.map((l) => (
                  <div key={l.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface-2 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-[13px] text-text-primary">{l.nome}</p>
                      <p className="mt-0.5 font-mono text-[11.5px] text-text-tertiary">
                        {l.metaTemplateName} · {l.idioma}
                      </p>
                    </div>
                    <Etiqueta status={l.situacao ?? "AUSENTE"} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {semVinculo.length > 0 && (
            <section className="glass-card rounded-3xl p-5">
              <h2 className="font-display text-[15.5px] font-semibold text-text-primary">
                Modelos sem template da Meta
              </h2>
              <p className="mb-4 mt-1 text-[12.5px] text-text-secondary">
                Funcionam dentro da janela de 24h, como texto livre. Fora dela, não saem.
              </p>
              <div className="flex flex-col gap-1.5">
                {semVinculo.map((l) => (
                  <div key={l.id} className="rounded-2xl bg-surface-2 px-4 py-3">
                    <p className="text-[13px] text-text-primary">{l.nome}</p>
                    <p className="mt-0.5 line-clamp-2 text-[11.5px] text-text-tertiary">{l.corpo}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="glass-card rounded-3xl p-5">
            <div className="mb-1 flex items-center gap-2.5">
              <CheckCheck size={17} className="text-accent-400" />
              <h2 className="font-display text-[15.5px] font-semibold text-text-primary">
                Templates na Meta
              </h2>
            </div>
            <p className="mb-4 text-[12.5px] text-text-secondary">
              Direto da conta de negócio {dados.wabaId ? <span className="font-mono text-[11.5px]">{dados.wabaId}</span> : null}.
              Criar e editar template é no Gerenciador da Meta — aqui é só a leitura do que ela decidiu.
            </p>

            {dados.templates.length === 0 ? (
              <p className="rounded-2xl bg-surface-2 px-4 py-8 text-center text-[12.5px] text-text-tertiary">
                Nenhum template cadastrado nesta conta de negócio ainda.
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {dados.templates.map((t) => (
                  <div key={t.id} className="rounded-2xl bg-surface-2 px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[13px] text-text-primary">{t.nome}</span>
                          {t.usadoAqui && (
                            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10.5px] text-accent-300">
                              em uso aqui
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-[11.5px] text-text-tertiary">
                          {[t.categoria.toLowerCase(), t.idioma, t.qualidade ? `qualidade ${t.qualidade.toLowerCase()}` : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <Etiqueta status={t.status} />
                    </div>

                    {t.corpo && (
                      <p className="mt-2 whitespace-pre-wrap rounded-xl bg-surface-3 px-3 py-2 text-[12px] leading-relaxed text-text-secondary">
                        {t.corpo}
                      </p>
                    )}

                    {t.motivoRejeicao && (
                      <p className="mt-2 flex items-start gap-1.5 text-[11.5px] text-danger">
                        <XCircle size={12} className="mt-0.5 shrink-0" />
                        Motivo da recusa: {t.motivoRejeicao.toLowerCase().replaceAll("_", " ")}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
