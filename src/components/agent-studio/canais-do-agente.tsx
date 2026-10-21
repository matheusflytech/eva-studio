"use client";

import * as React from "react";
import { ArrowRightLeft, Plus, Settings2, X } from "lucide-react";
import Link from "@/components/contrato/link";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/notice";
import { Button } from "@/components/ui/button";
import { LogoDaMarca } from "@/components/ui/marca";
import { CANAIS, type TipoDeCanal } from "@/lib/canais";
import { MetaWhatsAppConnect } from "./meta-whatsapp-connect";
import { WhatsAppConnect } from "./whatsapp-connect";
import { InstagramConnect } from "./instagram-connect";
import { TelegramConnect } from "./telegram-connect";
import { MessengerConnect, TikTokConnect } from "./channel-connect";

interface Conexao {
  tipo: TipoDeCanal;
  agentId: string;
  agentNome: string;
  rotulo: string;
  situacao: "conectado" | "atencao" | "pendente";
}

function Conectar({ tipo, agentId }: { tipo: TipoDeCanal; agentId: string }) {
  switch (tipo) {
    case "whatsapp_meta":
      return <MetaWhatsAppConnect agentId={agentId} />;
    case "whatsapp_qr":
      return <WhatsAppConnect agentId={agentId} />;
    case "instagram":
      return <InstagramConnect agentId={agentId} />;
    case "telegram":
      return <TelegramConnect agentId={agentId} />;
    case "messenger":
      return <MessengerConnect agentId={agentId} />;
    case "tiktok":
      return <TikTokConnect agentId={agentId} />;
  }
}

// ---------------------------------------------------------------------------
// Aba Canais do agente: por onde ESTE agente atende. Cada tipo mostra o canal
// que ele já usa, ou deixa escolher um canal do contrato (que passa a ser
// atendido por ele) ou conectar um novo. A lista completa fica em
// Configurações → Canais.
// ---------------------------------------------------------------------------
export function CanaisDoAgente({ agentId, agentNome }: { agentId: string; agentNome: string }) {
  const [conexoes, setConexoes] = React.useState<Conexao[] | null>(null);
  const [versao, setVersao] = React.useState(0);
  const [aberto, setAberto] = React.useState<TipoDeCanal | null>(null);
  const [mensagem, setMensagem] = React.useState<{ tom: "info" | "danger"; texto: string } | null>(null);

  React.useEffect(() => {
    let vivo = true;
    void fetch("/api/canais")
      .then((r) => r.json())
      .catch(() => null)
      .then((d) => {
        if (vivo) setConexoes(Array.isArray(d?.conexoes) ? d.conexoes : []);
      });
    return () => {
      vivo = false;
    };
  }, [versao]);

  async function usar(c: Conexao) {
    if (!confirm(`${c.rotulo} hoje é atendido por "${c.agentNome}". Passar para "${agentNome}"?`)) return;
    setMensagem(null);
    const res = await fetch("/api/canais/trocar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: c.tipo, de: c.agentId, para: agentId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setMensagem({ tom: "danger", texto: data.error ?? "Não deu para trocar." });
    else setMensagem({ tom: "info", texto: `${c.rotulo} agora é atendido por ${agentNome}.${data.aviso ? ` ${data.aviso}` : ""}` });
    setVersao((v) => v + 1);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Por onde ele atende</CardTitle>
        <CardDescription>
          Os canais ficam no contrato; aqui você escolhe quais este agente atende.{" "}
          <Link href="/configuracoes?aba=canais" className="text-accent-fg hover:underline">Ver todos os canais</Link>
        </CardDescription>
      </CardHeader>

      {mensagem && <Notice tone={mensagem.tom} className="mb-3">{mensagem.texto}</Notice>}

      {conexoes === null ? (
        <p className="text-[12.5px] text-text-tertiary">Carregando...</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border-subtle">
          {CANAIS.map((info) => {
            const meu = conexoes.find((c) => c.tipo === info.tipo && c.agentId === agentId);
            const outros = conexoes.filter((c) => c.tipo === info.tipo && c.agentId !== agentId);
            const expandido = aberto === info.tipo;
            return (
              <li key={info.tipo} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-3">
                  <LogoDaMarca marca={info.marca} tamanho={32} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-medium text-text-primary">{info.nome}</p>
                    <p className="truncate text-[12px] text-text-tertiary">
                      {meu ? meu.rotulo : outros.length ? `${outros.length} no contrato, com outros agentes` : "Nenhum no contrato"}
                    </p>
                  </div>
                  {meu && (
                    <Badge variant={meu.situacao === "conectado" ? "success" : meu.situacao === "atencao" ? "warning" : "neutral"}>
                      {meu.situacao === "conectado" ? "Atende por aqui" : meu.situacao === "atencao" ? "Precisa de atenção" : "Conectando"}
                    </Badge>
                  )}
                  {!meu && info.trocaDireta && outros.length > 0 && (
                    <Select
                      aria-label={`Usar um ${info.nome} do contrato`}
                      value=""
                      onChange={(e) => {
                        const c = outros.find((o) => o.agentId === e.target.value);
                        if (c) void usar(c);
                      }}
                      className="w-auto"
                    >
                      <option value="">Usar um do contrato...</option>
                      {outros.map((o) => (
                        <option key={o.agentId} value={o.agentId}>
                          {o.rotulo} (hoje: {o.agentNome})
                        </option>
                      ))}
                    </Select>
                  )}
                  <Button type="button" variant="ghost" size="sm" onClick={() => {
                      // Ao fechar, relê: a pessoa pode ter conectado ou desconectado lá dentro.
                      if (expandido) setVersao((v) => v + 1);
                      setAberto(expandido ? null : info.tipo);
                    }}>
                    {expandido ? <X size={14} /> : meu ? <Settings2 size={14} /> : <Plus size={14} />}
                    {expandido ? "Fechar" : meu ? "Gerenciar" : "Conectar novo"}
                  </Button>
                </div>
                {!meu && !info.trocaDireta && outros.length > 0 && !expandido && (
                  <p className="mt-1.5 flex items-center gap-1.5 pl-[44px] text-[11.5px] text-text-tertiary">
                    <ArrowRightLeft size={12} aria-hidden /> Para usar um que está em outro agente, desconecte lá e conecte aqui.
                  </p>
                )}
                {expandido && (
                  <div className="mt-3 rounded-xl bg-surface-2 p-3.5">
                    <Conectar tipo={info.tipo} agentId={agentId} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
