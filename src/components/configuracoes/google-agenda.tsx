"use client";

import * as React from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Notice } from "@/components/ui/notice";
import { LogoOficial } from "@/components/ui/logo-oficial";
import { CabecalhoDaSecao, LinhaDeConfig } from "@/components/configuracoes/secao";
import { useContrato, useSearchParams } from "@/lib/contrato/navegacao";
import { apiDoContrato } from "@/lib/contrato/rotas";

// Google Agenda da pessoa (Configurações → Sua conta). Conectar leva ao
// Google; na volta (?google=ok|...) a seção mostra o resultado. Cada agenda
// da conta liga ou desliga o que aparece no calendário de Tarefas.

interface Agenda {
  id: string;
  name: string;
  color: string | null;
  show: boolean;
}
interface Estado {
  configured: boolean;
  connection: { email: string; calendars: Agenda[]; status: string; lastError: string | null } | null;
}

const MENSAGEM_DA_VOLTA: Record<string, string> = {
  ok: "Google Agenda conectada.",
  cancelado: "Conexão cancelada no Google.",
  sem_token: "O Google não devolveu o acesso. Tente de novo.",
};

export function SecaoGoogleAgenda() {
  const contrato = useContrato();
  const volta = useSearchParams().get("google");
  const [estado, setEstado] = React.useState<Estado | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);

  const carregar = React.useCallback(() => {
    fetch("/api/integrations/google-calendar")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setEstado)
      .catch(() => setErro("Não deu para carregar a Google Agenda."));
  }, []);
  React.useEffect(carregar, [carregar]);

  async function alternar(agenda: Agenda, show: boolean) {
    if (!estado?.connection) return;
    const calendars = estado.connection.calendars.map((c) => (c.id === agenda.id ? { ...c, show } : c));
    setEstado({ ...estado, connection: { ...estado.connection, calendars } });
    const r = await fetch("/api/integrations/google-calendar", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ calendars: [{ id: agenda.id, show }] }),
    }).catch(() => null);
    if (!r?.ok) {
      setErro("Não deu para salvar a escolha.");
      carregar();
    }
  }

  async function desconectar() {
    const r = await fetch("/api/integrations/google-calendar", { method: "DELETE" }).catch(() => null);
    if (!r?.ok) return setErro("Não deu para desconectar.");
    carregar();
  }

  const c = estado?.connection;
  const conectar = (
    <a href={apiDoContrato(contrato, "/api/integrations/google-calendar/start")} className={buttonVariants({ variant: c ? "secondary" : "primary", size: "sm" })}>
      {c ? "Conectar de novo" : "Conectar Google Agenda"}
    </a>
  );

  return (
    <section aria-labelledby="titulo-google-agenda">
      <CabecalhoDaSecao
        nivel={2}
        titulo={
          <span id="titulo-google-agenda" className="inline-flex items-center gap-2">
            <LogoOficial marca="google-agenda" tamanho={16} /> Google Agenda
          </span>
        }
        descricao="Suas reuniões do Google aparecem junto das tarefas, e um agente de IA pode marcar reuniões na sua agenda. Vale só neste contrato."
      />
      {volta && MENSAGEM_DA_VOLTA[volta] && <Notice tone={volta === "ok" ? "info" : "warning"}>{MENSAGEM_DA_VOLTA[volta]}</Notice>}
      {volta && !MENSAGEM_DA_VOLTA[volta] && <Notice tone="warning">Não deu para conectar ({volta}). Tente de novo.</Notice>}
      {erro && <Notice tone="danger" onDismiss={() => setErro(null)}>{erro}</Notice>}

      {estado && !estado.configured && !c && (
        <LinhaDeConfig rotulo="Conta" descricao="O app do Google ainda não foi configurado neste ambiente. Fale com quem administra o Eva.">
          <span className="text-small text-text-tertiary">Indisponível</span>
        </LinhaDeConfig>
      )}
      {estado?.configured && !c && (
        <LinhaDeConfig rotulo="Conta" descricao="Você entra com o Google e escolhe quais agendas aparecem.">
          {conectar}
        </LinhaDeConfig>
      )}
      {c && (
        <>
          <LinhaDeConfig
            rotulo="Conta"
            descricao={c.status === "active" ? "Conectada." : (c.lastError ?? "Precisa conectar de novo.")}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-auto text-small text-text-primary">{c.email}</span>
              {c.status !== "active" && conectar}
              <Button type="button" variant="secondary" size="sm" className="text-danger hover:text-danger" onClick={desconectar}>
                Desconectar
              </Button>
            </div>
          </LinhaDeConfig>
          <LinhaDeConfig rotulo="Agendas" descricao="As ligadas aparecem no calendário de Tarefas e no Início.">
            <ul className="flex flex-col gap-2">
              {c.calendars.map((a) => (
                <li key={a.id} className="flex items-center gap-2">
                  <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ background: a.color ?? "var(--color-border-strong)" }} />
                  <label htmlFor={`gcal-${a.id}`} className="min-w-0 flex-1 truncate text-small text-text-primary">
                    {a.name}
                  </label>
                  <Switch id={`gcal-${a.id}`} checked={a.show} onCheckedChange={(v) => alternar(a, v)} />
                </li>
              ))}
              {c.calendars.length === 0 && <li className="text-small text-text-tertiary">Nenhuma agenda na conta.</li>}
            </ul>
          </LinhaDeConfig>
        </>
      )}
    </section>
  );
}
