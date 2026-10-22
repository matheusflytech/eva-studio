"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { BarChart3, Ellipsis, KeyRound, ListOrdered, LogIn, Mail, Plug, Plus, Radio, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CentralDeIa } from "@/components/integrations/central-de-ia";
import { EmailPanel } from "@/components/integrations/email-panel";
import { ApiKeysPanel } from "@/components/integrations/api-keys-panel";
import { McpServersPanel } from "@/components/integrations/mcp-servers-panel";
import { useContrato, usePathname, useRouter, useSearchParams } from "@/lib/contrato/navegacao";
import { apiDoContrato } from "@/lib/contrato/rotas";
import { MarcaEva } from "@/components/layout/marca-eva";

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
//
// v5: quatro abas (IA, E-mail, Servidores MCP, API do contrato), com a aba na
// URL (?aba=email...). Os atalhos (uso por agente, Entrar com OpenRouter, n8n
// e webhooks, onde fica o WhatsApp) moram no "…" da barra.
// ---------------------------------------------------------------------------

type Aba = "ia" | "email" | "mcp" | "api";

const ABAS: { value: Aba; label: string; icon: React.ReactNode }[] = [
  { value: "ia", label: "IA", icon: <MarcaEva size={14} /> },
  { value: "email", label: "E-mail", icon: <Mail aria-hidden="true" /> },
  { value: "mcp", label: "Servidores MCP", icon: <Plug aria-hidden="true" /> },
  { value: "api", label: "API do contrato", icon: <KeyRound aria-hidden="true" /> },
];

function Integracoes() {
  const contrato = useContrato();
  const router = useRouter();
  const pathname = usePathname();
  const pedida = useSearchParams().get("aba");
  const aba: Aba = ABAS.find((a) => a.value === pedida)?.value ?? "ia";
  const [novaAberta, setNovaAberta] = React.useState(false);
  const [filaAberta, setFilaAberta] = React.useState(false);
  const [porAgenteAberto, setPorAgenteAberto] = React.useState(false);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-6 pt-1 lg:px-6">
      {/* Barra da tela: título e, à direita, "…", a fila e a ação principal. */}
      <div className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-heading font-semibold tracking-tight text-text-primary">Integrações</h1>
        <div className="ml-auto flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton variant="secondary" aria-label="Mais: uso por agente, OpenRouter, n8n e webhooks, canais">
                <Ellipsis />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuItem
                onSelect={() => {
                  if (aba !== "ia") router.replace(`${pathname}?aba=ia`);
                  setPorAgenteAberto(true);
                }}
              >
                <BarChart3 /> Uso de IA por agente
              </DropdownMenuItem>
              {/* Navegação de página inteira: o servidor guarda o verificador PKCE
                  num cookie e manda para o login do OpenRouter. */}
              <DropdownMenuItem asChild>
                <a href={apiDoContrato(contrato, "/api/ia/openrouter/start")}>
                  <LogIn /> Entrar com OpenRouter
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/integracoes/n8n">
                  <Workflow /> n8n e webhooks
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {/* Canal não se conecta aqui; dizer isso vale mais que um cartão que não faz nada. */}
              <DropdownMenuItem asChild className="h-auto items-start py-2">
                <Link href="/configuracoes?aba=canais">
                  <Radio className="mt-0.5" />
                  <span className="flex flex-col">
                    <span>WhatsApp, Instagram, Telegram, site</span>
                    <span className="text-caption text-text-tertiary">A conexão fica em Configurações › Canais</span>
                  </span>
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {aba === "ia" && (
            <>
              <Button variant="secondary" onClick={() => setFilaAberta(true)}>
                <ListOrdered size={14} aria-hidden="true" /> Fila de resposta
              </Button>
              <Button onClick={() => setNovaAberta(true)}>
                <Plus size={14} aria-hidden="true" /> Nova credencial
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="-mx-4 overflow-x-auto px-4 lg:-mx-6 lg:px-6">
        <SegmentedControl label="Integrações" value={aba} onChange={(v) => router.replace(`${pathname}?aba=${v}`)} options={ABAS} />
      </div>

      <div className="w-full pt-2">
        {aba === "ia" && (
          <CentralDeIa
            novaAberta={novaAberta}
            setNovaAberta={setNovaAberta}
            filaAberta={filaAberta}
            setFilaAberta={setFilaAberta}
            porAgenteAberto={porAgenteAberto}
            setPorAgenteAberto={setPorAgenteAberto}
          />
        )}
        {aba === "email" && <EmailPanel />}
        {aba === "mcp" && <McpServersPanel />}
        {aba === "api" && <ApiKeysPanel nivelDoTitulo={2} />}
      </div>
    </div>
  );
}

export default function IntegracoesPage() {
  // useSearchParams exige Suspense: sem ele o Next recusa gerar a página.
  return (
    <React.Suspense fallback={<div className="flex-1" />}>
      <Integracoes />
    </React.Suspense>
  );
}
