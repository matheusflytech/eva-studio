"use client";

import Link from "next/link";
import { Radio, ArrowRight } from "lucide-react";
import { CredentialsPanel } from "@/components/integrations/credentials-panel";
import { ApiKeysPanel } from "@/components/integrations/api-keys-panel";
import { McpServersPanel } from "@/components/integrations/mcp-servers-panel";

// ---------------------------------------------------------------------------
// Integrações.
//
// Esta tela tinha cartões de canal (WhatsApp, Instagram, Webchat, E-mail) e de
// "fontes de dados" (Google Calendar, HubSpot, Sheets) que não existiam. Eles
// ofereciam colar uma URL em `hooks.evaagentstudio.app/integrations/...`, um
// domínio que este produto não tem, e salvavam a configuração no localStorage
// do navegador — nada saía dali.
//
// Pior que não funcionar: eles MENTIAM. Mostravam "Não conectado" para um
// WhatsApp que podia estar conectado de verdade na aba do agente, que é onde a
// conexão realmente mora. Quem confiasse nesta tela concluiria que o canal
// estava fora do ar.
//
// Sobrou o que é real e tem banco atrás: credenciais de IA e e-mail,
// servidores MCP e chaves de API.
// ---------------------------------------------------------------------------

export default function IntegracoesPage() {
  return (
    <div className="flex-1 p-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-text-primary">Integrações</h1>
        <p className="mt-1 max-w-2xl text-[14px] text-text-secondary">
          As chaves e os servidores que seus agentes usam: provedores de IA, envio de e-mail, ferramentas MCP e
          o acesso à API do Eva Studio.
        </p>
      </div>

      {/* Canal não se conecta aqui, e dizer isso em voz alta vale mais do que
          um cartão bonito que não faz nada. */}
      <Link
        href="/agent-studio"
        className="glass-card group mb-8 flex items-center gap-4 rounded-2xl px-5 py-4 transition-colors hover:border-border-strong"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-3 text-text-secondary">
          <Radio size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-medium text-text-primary">
            Procurando WhatsApp, Instagram, Telegram ou o widget do site?
          </p>
          <p className="mt-0.5 text-[12.5px] text-text-secondary">
            Canal é por agente, não por organização — cada agente tem os seus. A conexão fica na aba do agente,
            no Eva Studio.
          </p>
        </div>
        <ArrowRight size={16} className="shrink-0 text-text-tertiary transition-colors group-hover:text-text-primary" />
      </Link>

      <CredentialsPanel />

      <div className="mt-8">
        <McpServersPanel />
        <ApiKeysPanel />
      </div>
    </div>
  );
}
