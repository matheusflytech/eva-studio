"use client";

import * as React from "react";
import { Plus, Settings2, X } from "lucide-react";
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

interface CanalNaTela {
  id: string;
  tipo: TipoDeCanal;
  rotulo: string;
  status: "conectado" | "atencao" | "pendente" | "desconectado";
  agentId: string | null;
  agentNome: string | null;
}

// Conexão dentro do agente, como era antes dos canais do contrato. Só aparece
// enquanto o SQL de canais não foi aplicado (disponivel = false).
function ConectarNoAgente({ tipo, agentId }: { tipo: TipoDeCanal; agentId: string }) {
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
// Aba Canais do agente: por qual canal do contrato ESTE agente atende, um de
// cada tipo. A conexão em si fica em Configurações → Canais. Escolher um
// canal que outro agente usa tira dele (sempre um agente por canal).
// ---------------------------------------------------------------------------
export function CanaisDoAgente({ agentId, agentNome }: { agentId: string; agentNome: string }) {
  const [dados, setDados] = React.useState<{ disponivel: boolean; canais: CanalNaTela[] } | null>(null);
  const [versao, setVersao] = React.useState(0);
  const [aberto, setAberto] = React.useState<TipoDeCanal | null>(null);
  const [salvando, setSalvando] = React.useState(false);
  const [mensagem, setMensagem] = React.useState<{ tom: "info" | "danger"; texto: string } | null>(null);

  React.useEffect(() => {
    let vivo = true;
    void fetch("/api/canais")
      .then((r) => r.json())
      .catch(() => null)
      .then((d) => {
        if (vivo) setDados({ disponivel: d?.disponivel !== false, canais: Array.isArray(d?.canais) ? d.canais : [] });
      });
    return () => {
      vivo = false;
    };
  }, [versao]);

  async function escolher(tipo: TipoDeCanal, canalId: string) {
    const canal = dados?.canais.find((c) => c.id === canalId);
    if (canal?.agentId && canal.agentId !== agentId) {
      if (!confirm(`${canal.rotulo} hoje é atendido por "${canal.agentNome}". Passar para "${agentNome}"?`)) return;
    }
    setSalvando(true);
    setMensagem(null);
    const res = await fetch(`/api/agents/${agentId}/canais`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo, canalId: canalId || null }),
    });
    const data = await res.json().catch(() => ({}));
    setSalvando(false);
    if (!res.ok) setMensagem({ tom: "danger", texto: data.error ?? "Não deu para trocar o canal." });
    else if (canal) setMensagem({ tom: "info", texto: `${agentNome} agora atende por ${canal.rotulo}.` });
    setVersao((v) => v + 1);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Por onde ele atende</CardTitle>
        <CardDescription>
          Escolha, em cada tipo, por qual canal do contrato este agente atende. Para conectar um número ou conta novos,
          vá em <Link href="/configuracoes?aba=canais" className="text-accent-fg hover:underline">Configurações → Canais</Link>.
        </CardDescription>
      </CardHeader>

      {dados && !dados.disponivel && (
        <Notice tone="warning" className="mb-3">
          Os canais do contrato ainda não foram ativados no banco deste ambiente: por enquanto a conexão é feita aqui,
          dentro do agente.
        </Notice>
      )}
      {mensagem && <Notice tone={mensagem.tom} className="mb-3">{mensagem.texto}</Notice>}

      {dados === null ? (
        <p className="text-[12.5px] text-text-tertiary">Carregando...</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border-subtle">
          {CANAIS.map((info) => {
            const doTipo = dados.canais.filter((c) => c.tipo === info.tipo);
            const meu = doTipo.find((c) => c.agentId === agentId);
            const expandido = aberto === info.tipo;
            return (
              <li key={info.tipo} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-3">
                  <LogoDaMarca marca={info.marca} tamanho={32} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-medium text-text-primary">{info.nome}</p>
                    <p className="truncate text-[12px] text-text-tertiary">
                      {meu ? meu.rotulo : doTipo.length ? "Não atende por este tipo" : "Nenhum conectado no contrato"}
                    </p>
                  </div>
                  {meu && meu.status !== "conectado" && (
                    <Badge variant={meu.status === "atencao" ? "warning" : "neutral"}>
                      {meu.status === "atencao" ? "Precisa de atenção" : "Conectando"}
                    </Badge>
                  )}

                  {dados.disponivel ? (
                    doTipo.length > 0 && (
                      <Select
                        aria-label={`${info.nome} que ${agentNome} usa`}
                        value={meu?.id ?? ""}
                        disabled={salvando}
                        onChange={(e) => void escolher(info.tipo, e.target.value)}
                        className="w-auto max-w-[260px]"
                      >
                        <option value="">Nenhum</option>
                        {doTipo.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.rotulo}
                            {c.agentId && c.agentId !== agentId ? ` (hoje: ${c.agentNome})` : ""}
                          </option>
                        ))}
                      </Select>
                    )
                  ) : (
                    <Button type="button" variant="ghost" size="sm" onClick={() => {
                      if (expandido) setVersao((v) => v + 1);
                      setAberto(expandido ? null : info.tipo);
                    }}>
                      {expandido ? <X size={14} /> : meu ? <Settings2 size={14} /> : <Plus size={14} />}
                      {expandido ? "Fechar" : meu ? "Gerenciar" : "Conectar"}
                    </Button>
                  )}
                </div>
                {!dados.disponivel && expandido && (
                  <div className="mt-3 rounded-xl bg-surface-2 p-3.5">
                    <ConectarNoAgente tipo={info.tipo} agentId={agentId} />
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
