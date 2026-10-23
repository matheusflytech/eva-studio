"use client";

import * as React from "react";
import { Plus, QrCode, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/notice";
import { Button } from "@/components/ui/button";
import { LogoDaMarca } from "@/components/ui/marca";
import { useSearchParams } from "@/lib/contrato/navegacao";
import { CANAIS, type InfoDoCanal, type TipoDeCanal } from "@/lib/canais";
import { ConectarCanal, ConectarWhatsAppQr } from "./conectar-canal";
import { CabecalhoDaSecao, EsqueletoDeLista } from "./secao";

interface CanalNaTela {
  id: string;
  tipo: TipoDeCanal;
  rotulo: string;
  status: "conectado" | "atencao" | "pendente" | "desconectado";
  detalhe: string | null;
  agentId: string | null;
  agentNome: string | null;
}

interface CanaisNaTela {
  disponivel: boolean;
  canais: CanalNaTela[];
  agentes: { id: string; nome: string; widget: boolean }[];
}

const SITUACAO: Record<CanalNaTela["status"], { rotulo: string; variant: "success" | "warning" | "neutral" }> = {
  conectado: { rotulo: "Conectado", variant: "success" },
  atencao: { rotulo: "Precisa de atenção", variant: "warning" },
  pendente: { rotulo: "Conectando", variant: "neutral" },
  desconectado: { rotulo: "Desconectado", variant: "neutral" },
};

// ---------------------------------------------------------------------------
// Configurações → Canais: só CONEXÃO. Conecta e desconecta a BM/WhatsApp
// oficial, WhatsApp por QR, Instagram, Messenger, Telegram e TikTok, quantos
// forem (vários números, várias contas). Quem atende cada canal é escolhido
// na aba Canais de cada agente; aqui só aparece como informação.
// ---------------------------------------------------------------------------
export function AbaCanais() {
  const [dados, setDados] = React.useState<CanaisNaTela | null>(null);
  const [versao, setVersao] = React.useState(0);
  const [aberto, setAberto] = React.useState<TipoDeCanal | null>(null);
  const [mensagem, setMensagem] = React.useState<{ tom: "info" | "danger"; texto: string } | null>(null);
  const volta = useSearchParams();

  React.useEffect(() => {
    let vivo = true;
    void fetch("/api/canais")
      .then((r) => r.json())
      .catch(() => null)
      .then((d) => {
        if (vivo && d && Array.isArray(d.canais)) setDados(d);
      });
    return () => {
      vivo = false;
    };
  }, [versao]);

  const recarregar = React.useCallback(() => setVersao((v) => v + 1), []);
  const aoConectar = React.useCallback(
    (aviso?: string | null) => {
      setAberto(null);
      setMensagem({ tom: "info", texto: `Canal conectado. Agora escolha, na aba Canais de um agente, quem atende por ele.${aviso ? ` ${aviso}` : ""}` });
      recarregar();
    },
    [recarregar]
  );

  async function desconectar(c: CanalNaTela) {
    const quem = c.agentNome ? ` O agente "${c.agentNome}" deixa de atender por ele.` : "";
    if (!confirm(`Desconectar ${c.rotulo} do contrato?${quem}`)) return;
    setMensagem(null);
    const res = await fetch(`/api/canais/${c.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setMensagem({ tom: "danger", texto: data.error ?? "Não deu para desconectar." });
    recarregar();
  }

  const cabecalho = (
    <CabecalhoDaSecao
      titulo="Canais"
      descricao="Os números e contas que o contrato usa para conversar. Conecte quantos precisar; depois, na aba Canais de cada agente, escolha por qual ele atende."
    />
  );

  if (!dados)
    return (
      <div>
        {cabecalho}
        <EsqueletoDeLista linhas={4} />
      </div>
    );

  const voltaDoInstagram = volta.get("instagram") === "connected";
  const erroDoInstagram = volta.get("instagram_error");

  return (
    <div>
      {cabecalho}
      <div className="flex flex-col gap-2 empty:hidden [&:not(:empty)]:pb-4">
        {!dados.disponivel && (
          <Notice tone="warning">
            Os canais do contrato ainda não foram ativados no banco deste ambiente. Por enquanto, a lista abaixo mostra
            as conexões feitas dentro de cada agente, e é por lá que se conecta.
          </Notice>
        )}
        {voltaDoInstagram && <Notice tone="info">Instagram conectado. Escolha, na aba Canais de um agente, quem atende por ele.</Notice>}
        {erroDoInstagram && (
          <Notice tone="danger">
            {erroDoInstagram === "outro_contrato" ? "Essa conta do Instagram já está conectada em outro contrato." : "Não deu para conectar o Instagram. Tente de novo."}
          </Notice>
        )}
        {mensagem && <Notice tone={mensagem.tom}>{mensagem.texto}</Notice>}
      </div>

      <ul className="flex flex-col divide-y divide-border-subtle border-y border-border-subtle">
        {CANAIS.map((info) => (
          <CartaoDoCanal
            key={info.tipo}
            info={info}
            canais={dados.canais.filter((c) => c.tipo === info.tipo)}
            podeConectar={dados.disponivel}
            aberto={aberto === info.tipo}
            abrir={() => setAberto(info.tipo)}
            fechar={() => setAberto(null)}
            aoConectar={aoConectar}
            desconectar={dados.disponivel ? desconectar : undefined}
          />
        ))}

        <li className="flex items-start gap-3.5 px-1 py-4">
          <LogoDaMarca marca="site" />
          <div className="min-w-0 flex-1">
            <p className="text-body font-semibold text-text-primary">Chat no seu site</p>
            <p className="text-small text-text-tertiary">
              Cada agente tem o próprio código para colar no site (aba Canais do agente).
              {dados.agentes.some((a) => a.widget)
                ? ` Ligado em: ${dados.agentes.filter((a) => a.widget).map((a) => a.nome).join(", ")}.`
                : " Nenhum agente com o chat ligado."}
            </p>
          </div>
        </li>
      </ul>
    </div>
  );
}

function CartaoDoCanal({
  info,
  canais,
  podeConectar,
  aberto,
  abrir,
  fechar,
  aoConectar,
  desconectar,
}: {
  info: InfoDoCanal;
  canais: CanalNaTela[];
  podeConectar: boolean;
  aberto: boolean;
  abrir: () => void;
  fechar: () => void;
  aoConectar: (aviso?: string | null) => void;
  desconectar?: (c: CanalNaTela) => void;
}) {
  // QR pendente: a pessoa volta para ler o QR do canal que já existe.
  const [qrDe, setQrDe] = React.useState<string | null>(null);
  return (
    <li className="flex flex-col gap-3 px-1 py-4">
      <div className="flex items-start gap-3.5">
        <LogoDaMarca marca={info.marca} />
        <div className="min-w-0 flex-1">
          <p className="text-body font-semibold text-text-primary">{info.nome}</p>
          <p className="text-small text-text-tertiary">{info.descricao}</p>
        </div>
        {podeConectar &&
          (aberto ? (
            <Button type="button" variant="ghost" onClick={fechar}>
              <X size={14} aria-hidden="true" /> Fechar
            </Button>
          ) : (
            <Button type="button" variant="secondary" onClick={abrir}>
              <Plus size={14} aria-hidden="true" /> Conectar
            </Button>
          ))}
      </div>

      {canais.length > 0 ? (
        <ul className="ml-0 flex flex-col divide-y divide-border-subtle sm:ml-[50px]">
          {canais.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
              <div className="min-w-[140px] flex-1">
                <p className="truncate text-small font-medium text-text-primary">{c.rotulo}</p>
                <p className="truncate text-caption text-text-tertiary">
                  {c.agentNome ? `Usado por ${c.agentNome}` : "Nenhum agente atende por ele ainda"}
                  {c.detalhe ? ` · ${c.detalhe}` : ""}
                </p>
              </div>
              <Badge variant={SITUACAO[c.status].variant} dot>
                {SITUACAO[c.status].rotulo}
              </Badge>
              {c.tipo === "whatsapp_qr" && c.status !== "conectado" && (
                <Button type="button" variant="secondary" size="sm" onClick={() => setQrDe(qrDe === c.id ? null : c.id)} aria-expanded={qrDe === c.id}>
                  <QrCode size={14} aria-hidden="true" /> {qrDe === c.id ? "Esconder QR" : "Mostrar QR"}
                </Button>
              )}
              {desconectar && (
                <Button type="button" variant="ghost" size="sm" onClick={() => desconectar(c)} aria-label={`Desconectar ${c.rotulo}`}>
                  <Trash2 size={14} aria-hidden="true" /> Desconectar
                </Button>
              )}
              {qrDe === c.id && (
                <div className="basis-full rounded-[14px] bg-raised p-4">
                  <ConectarWhatsAppQr
                    canalInicial={c.id}
                    aoConectar={(aviso) => {
                      setQrDe(null);
                      aoConectar(aviso);
                    }}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        !aberto && <p className="font-mono text-caption text-text-tertiary sm:ml-[50px]">Nenhum conectado</p>
      )}

      {aberto && (
        <div className="rounded-[14px] bg-raised p-4 sm:ml-[50px]">
          <ConectarCanal tipo={info.tipo} aoConectar={aoConectar} />
        </div>
      )}
    </li>
  );
}
