"use client";

import { MessageCircle, AtSign, Globe, Mail, Calendar, Users, FileSpreadsheet } from "lucide-react";
import { IntegrationCard } from "@/components/integrations/integration-card";

const CHANNELS = [
  { id: "whatsapp", icon: MessageCircle, name: "WhatsApp Business", description: "Recebe e responde conversas do WhatsApp." },
  { id: "instagram", icon: AtSign, name: "Instagram Direct", description: "Recebe mensagens diretas do Instagram." },
  { id: "webchat", icon: Globe, name: "Webchat do site", description: "Widget de chat embutido no seu site." },
  { id: "email", icon: Mail, name: "E-mail", description: "Responde e-mails recebidos automaticamente." },
];

const DATA_SOURCES = [
  { id: "google-calendar", icon: Calendar, name: "Google Calendar", description: "Consulta e cria eventos na agenda." },
  { id: "crm", icon: Users, name: "CRM (HubSpot / Pipedrive)", description: "Sincroniza contatos e negócios." },
  { id: "google-sheets", icon: FileSpreadsheet, name: "Google Sheets", description: "Lê e grava dados em planilhas." },
];

export default function IntegracoesPage() {
  return (
    <div className="flex-1 p-8">
      <div className="mb-6">
        <h1 className="font-display text-xl font-semibold text-text-primary">Integrações</h1>
        <p className="mt-1 max-w-xl text-[13px] text-text-secondary">
          Cada canal ganha um par de webhooks — cole a URL de entrada no seu workflow do n8n e aponte a saída para
          onde os dados devem chegar.
        </p>
      </div>

      <div className="mb-8">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">Canais de conversa</p>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {CHANNELS.map((c) => (
            <IntegrationCard key={c.id} {...c} />
          ))}
        </div>
      </div>

      <div>
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">Fontes de dados</p>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {DATA_SOURCES.map((c) => (
            <IntegrationCard key={c.id} {...c} />
          ))}
        </div>
      </div>
    </div>
  );
}
