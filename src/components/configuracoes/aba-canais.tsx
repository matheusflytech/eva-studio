"use client";

import * as React from "react";
import { Plus, Settings2, X } from "lucide-react";
import Link from "@/components/contrato/link";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/notice";
import { Button } from "@/components/ui/button";
import { LogoDaMarca } from "@/components/ui/marca";
import { CANAIS, type InfoDoCanal, type TipoDeCanal } from "@/lib/canais";
import { MetaWhatsAppConnect } from "@/components/agent-studio/meta-whatsapp-connect";
import { WhatsAppConnect } from "@/components/agent-studio/whatsapp-connect";
import { InstagramConnect } from "@/components/agent-studio/instagram-connect";
import { TelegramConnect } from "@/components/agent-studio/telegram-connect";
import { MessengerConnect, TikTokConnect } from "@/components/agent-studio/channel-connect";

interface Conexao {
  tipo: TipoDeCanal;
  agentId: string;
  agentNome: string;
  rotulo: string;
  situacao: "conectado" | "atencao" | "pendente";
  detalhe?: string;
}

interface Canais {
  conexoes: Conexao[];
  agentes: { id: string; nome: string; tipos: TipoDeCanal[]; widget: boolean }[];
}

// O componente de conexão de cada canal (o mesmo de antes, por agente):
// conectar, ver o estado e desconectar.
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

const SITUACAO: Record<Conexao["situacao"], { rotulo: string; variant: "success" | "warning" | "neutral" }> = {
  conectado: { rotulo: "Conectado", variant: "success" },
  atencao: { rotulo: "Precisa de atenção", variant: "warning" },
  pendente: { rotulo: "Conectando", variant: "neutral" },
};

// ---------------------------------------------------------------------------
// Configurações → Canais. Todas as conexões do contrato num lugar só, com o
// agente que atende cada uma. Conectar um canal novo pede o agente que vai
// atender; depois dá para trocar. Ver src/lib/server/canais-do-contrato.ts
// para os limites desta fase.
// ---------------------------------------------------------------------------
export function AbaCanais() {
  const [canais, setCanais] = React.useState<Canais | null>(null);
  const [versao, setVersao] = React.useState(0);
  const [aberto, setAberto] = React.useState<{ tipo: TipoDeCanal; agentId: string | null } | null>(null);
  const [mensagem, setMensagem] = React.useState<{ tom: "info" | "danger"; texto: string } | null>(null);
  const [trocando, setTrocando] = React.useState(false);

  React.useEffect(() => {
    let vivo = true;
    void fetch("/api/canais")
      .then((r) => r.json())
      .catch(() => null)
      .then((d) => {
        if (vivo && d && Array.isArray(d.conexoes)) setCanais(d);
      });
    return () => {
      vivo = false;
    };
  }, [versao]);

  async function trocar(c: Conexao, para: string) {
    const destino = canais?.agentes.find((a) => a.id === para);
    if (!destino || para === c.agentId) return;
    if (!confirm(`Passar ${c.rotulo} de "${c.agentNome}" para "${destino.nome}"? As próximas mensagens desse canal vão para ${destino.nome}.`)) return;
    setTrocando(true);
    setMensagem(null);
    try {
      const res = await fetch("/api/canais/trocar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: c.tipo, de: c.agentId, para }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Não deu para trocar.");
      setMensagem({ tom: "info", texto: `${c.rotulo} agora é atendido por ${destino.nome}.${data.aviso ? ` ${data.aviso}` : ""}` });
      setVersao((v) => v + 1);
    } catch (err) {
      setMensagem({ tom: "danger", texto: err instanceof Error ? err.message : "Não deu para trocar." });
    } finally {
      setTrocando(false);
    }
  }

  if (!canais) return <p className="text-[12.5px] text-text-tertiary">Carregando...</p>;

  const semAgentes = canais.agentes.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-2xl text-[13px] text-text-secondary">
        Os números e contas que o contrato usa para conversar. Cada um é atendido por um agente; na aba Canais de cada
        agente você também escolhe por onde ele atende.
      </p>
      {semAgentes && (
        <Notice tone="warning">
          Crie um agente antes: todo canal precisa de alguém para atender. <Link href="/agent-studio/new" className="underline">Criar agente</Link>
        </Notice>
      )}
      {mensagem && <Notice tone={mensagem.tom}>{mensagem.texto}</Notice>}

      {CANAIS.map((info) => (
        <CartaoDoCanal
          key={info.tipo}
          info={info}
          canais={canais}
          aberto={aberto?.tipo === info.tipo ? aberto : null}
          abrir={(agentId) => setAberto({ tipo: info.tipo, agentId })}
          fechar={() => {
            setAberto(null);
            setVersao((v) => v + 1);
          }}
          trocar={trocar}
          trocando={trocando}
        />
      ))}

      <Card className="flex items-start gap-3.5">
        <LogoDaMarca marca="site" />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-text-primary">Chat no seu site</p>
          <p className="text-[12.5px] text-text-secondary">
            Cada agente tem o próprio código para colar no site (aba Canais do agente).
            {canais.agentes.some((a) => a.widget)
              ? ` Ligado em: ${canais.agentes.filter((a) => a.widget).map((a) => a.nome).join(", ")}.`
              : " Nenhum agente com o chat ligado."}
          </p>
        </div>
      </Card>
    </div>
  );
}

function CartaoDoCanal({
  info,
  canais,
  aberto,
  abrir,
  fechar,
  trocar,
  trocando,
}: {
  info: InfoDoCanal;
  canais: Canais;
  aberto: { tipo: TipoDeCanal; agentId: string | null } | null;
  abrir: (agentId: string | null) => void;
  fechar: () => void;
  trocar: (c: Conexao, para: string) => void;
  trocando: boolean;
}) {
  const conexoes = canais.conexoes.filter((c) => c.tipo === info.tipo);
  const livres = canais.agentes.filter((a) => !a.tipos.includes(info.tipo));

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start gap-3.5">
        <LogoDaMarca marca={info.marca} />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-text-primary">{info.nome}</p>
          <p className="text-[12.5px] text-text-secondary">{info.descricao}</p>
        </div>
        {!aberto && livres.length > 0 && (
          <Button type="button" variant="secondary" size="sm" onClick={() => abrir(null)}>
            <Plus size={14} /> Conectar
          </Button>
        )}
      </div>

      {conexoes.length > 0 && (
        <ul className="divide-y divide-border-subtle rounded-xl border border-border-subtle">
          {conexoes.map((c) => (
            <li key={`${c.tipo}-${c.agentId}`} className="flex flex-wrap items-center gap-3 px-3.5 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-medium text-text-primary">{c.rotulo}</p>
                {c.detalhe && <p className="text-[11.5px] text-text-tertiary">{c.detalhe}</p>}
              </div>
              <Badge variant={SITUACAO[c.situacao].variant}>{SITUACAO[c.situacao].rotulo}</Badge>
              <div className="flex items-center gap-2">
                <Label htmlFor={`atende-${c.tipo}-${c.agentId}`} className="mb-0 whitespace-nowrap">Atendido por</Label>
                <Select
                  id={`atende-${c.tipo}-${c.agentId}`}
                  value={c.agentId}
                  disabled={trocando || !info.trocaDireta}
                  title={info.trocaDireta ? undefined : "Para trocar, desconecte e conecte de novo no outro agente."}
                  onChange={(e) => trocar(c, e.target.value)}
                >
                  <option value={c.agentId}>{c.agentNome}</option>
                  {livres.map((a) => (
                    <option key={a.id} value={a.id}>{a.nome}</option>
                  ))}
                </Select>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => abrir(c.agentId)} aria-label={`Gerenciar ${c.rotulo}`}>
                <Settings2 size={14} /> Gerenciar
              </Button>
            </li>
          ))}
        </ul>
      )}
      {conexoes.length === 0 && !aberto && <p className="text-[12.5px] text-text-tertiary">Nenhum conectado.</p>}

      {aberto && (
        <div className="flex flex-col gap-3 rounded-xl bg-surface-2 p-3.5">
          <div className="flex items-end justify-between gap-3">
            {aberto.agentId === null ? (
              <div className="min-w-0 flex-1">
                <Label htmlFor={`novo-${info.tipo}`}>Qual agente vai atender por este canal?</Label>
                <Select id={`novo-${info.tipo}`} value="" onChange={(e) => e.target.value && abrir(e.target.value)}>
                  <option value="">Escolha o agente...</option>
                  {livres.map((a) => (
                    <option key={a.id} value={a.id}>{a.nome}</option>
                  ))}
                </Select>
              </div>
            ) : (
              <p className="text-[12.5px] text-text-secondary">
                Atendido por <strong className="text-text-primary">{canais.agentes.find((a) => a.id === aberto.agentId)?.nome}</strong>
              </p>
            )}
            <Button type="button" variant="ghost" size="sm" onClick={fechar}>
              <X size={14} /> Fechar
            </Button>
          </div>
          {aberto.agentId && <Conectar tipo={info.tipo} agentId={aberto.agentId} />}
        </div>
      )}
    </Card>
  );
}
