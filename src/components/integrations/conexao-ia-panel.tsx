"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Plus, Sparkles, Trash2 } from "lucide-react";
import { Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Notice } from "@/components/ui/notice";
import { IconButton } from "@/components/ui/icon-button";
import { Button } from "@/components/ui/button";
import { ModeloSelect } from "@/components/agent-studio/builder/modelo-select";
import { LLM_PROVIDERS } from "@/lib/llm-providers";

interface Credencial {
  id: string;
  name: string;
  type: string;
}

interface Passo {
  credentialId: string;
  model: string;
}

const TIPOS_DE_IA = new Set(LLM_PROVIDERS.map((p) => p.credentialType));
const provedorDoTipo = (type: string | undefined) => LLM_PROVIDERS.find((p) => p.credentialType === type)?.id;
const TEMPOS = [10, 15, 25, 40, 60];

// ---------------------------------------------------------------------------
// Central de IA: a conexão única que os agentes usam. Uma lista de chave +
// modelo em ordem de preferência; se a primeira falhar ou passar do tempo
// limite, a próxima responde na mesma hora. Blocos de IA marcados com
// "Conexão do contrato" (o padrão de bloco novo) usam esta lista.
// v5: mora na gaveta "Fila de resposta" de Integrações → IA; a lista de
// chaves na frente só mostra a posição de cada uma.
// ---------------------------------------------------------------------------
export function ConexaoIaPanel({ credenciaisVersao = 0, aoSalvar }: { credenciaisVersao?: number; aoSalvar?: () => void }) {
  const [credenciais, setCredenciais] = React.useState<Credencial[] | null>(null);
  const [passos, setPassos] = React.useState<Passo[]>([]);
  const [timeoutMs, setTimeoutMs] = React.useState(25000);
  const [disponivel, setDisponivel] = React.useState(true);
  const [carregado, setCarregado] = React.useState(false);
  const [sujo, setSujo] = React.useState(false);
  const [salvando, setSalvando] = React.useState(false);
  const [mensagem, setMensagem] = React.useState<{ tom: "info" | "danger"; texto: string } | null>(null);

  React.useEffect(() => {
    let vivo = true;
    void Promise.all([
      fetch("/api/credentials").then((r) => r.json()).catch(() => ({ credentials: [] })),
      fetch("/api/ia/conexao").then((r) => r.json()).catch(() => ({ passos: [], timeoutMs: 25000, disponivel: false })),
    ]).then(([c, conexao]) => {
      if (!vivo) return;
      setCredenciais(((c.credentials ?? []) as Credencial[]).filter((x) => TIPOS_DE_IA.has(x.type)));
      setPassos(conexao.passos ?? []);
      setTimeoutMs(conexao.timeoutMs ?? 25000);
      setDisponivel(conexao.disponivel !== false);
      setCarregado(true);
    });
    return () => {
      vivo = false;
    };
  }, [credenciaisVersao]);

  const mudar = (novo: Passo[]) => {
    setPassos(novo);
    setSujo(true);
    setMensagem(null);
  };
  const credencial = (id: string) => credenciais?.find((c) => c.id === id);
  const modeloPadrao = (type: string | undefined) => LLM_PROVIDERS.find((p) => p.credentialType === type)?.models[0]?.id ?? "";

  function adicionar() {
    const primeira = credenciais?.[0];
    if (!primeira) return;
    mudar([...passos, { credentialId: primeira.id, model: modeloPadrao(primeira.type) }]);
  }

  function mover(i: number, delta: number) {
    const j = i + delta;
    if (j < 0 || j >= passos.length) return;
    const novo = [...passos];
    [novo[i], novo[j]] = [novo[j], novo[i]];
    mudar(novo);
  }

  async function salvar() {
    setSalvando(true);
    setMensagem(null);
    try {
      const res = await fetch("/api/ia/conexao", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passos, timeoutMs }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Não deu para salvar.");
      setPassos(data.passos);
      setTimeoutMs(data.timeoutMs);
      setSujo(false);
      setMensagem({ tom: "info", texto: "Conexão salva. Os agentes já usam esta ordem na próxima mensagem." });
      aoSalvar?.();
    } catch (err) {
      setMensagem({ tom: "danger", texto: err instanceof Error ? err.message : "Não deu para salvar." });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-small text-text-secondary">
        A primeira linha responde; se ela falhar, recusar a chave ou demorar mais que o tempo limite, a próxima entra na
        mesma hora, sem a pessoa perceber.
      </p>

      <div className="flex flex-col gap-3">
        {!disponivel && (
          <Notice tone="warning">
            A Central de IA ainda não foi ativada no banco deste ambiente. Enquanto isso, os agentes usam sozinhos a
            chave de IA mais adequada do contrato.
          </Notice>
        )}

        {!carregado ? (
          <div className="h-24 animate-pulse rounded-[14px] bg-raised motion-reduce:animate-none" aria-hidden="true" />
        ) : !disponivel ? null : credenciais && credenciais.length === 0 ? (
          <p className="text-small text-text-tertiary">
            Cadastre a chave de pelo menos um provedor de IA (OpenAI, Google, Anthropic, Groq...) para montar a
            conexão.
          </p>
        ) : (
          <>
            {passos.length === 0 && (
              <p className="flex items-start gap-2 text-small text-text-tertiary">
                <Sparkles size={14} aria-hidden className="mt-0.5 shrink-0" />
                Nenhuma ordem definida: os agentes usam a chave de IA mais adequada do contrato. Adicione linhas para
                escolher a ordem e as reservas.
              </p>
            )}

            {passos.map((p, i) => {
              const cred = credencial(p.credentialId);
              return (
                <div key={`${i}-${p.credentialId}`} className="grid grid-cols-1 items-start gap-3 rounded-[14px] bg-raised p-3 sm:grid-cols-[2rem_1fr_1fr_auto]">
                  <span className="font-mono text-caption tabular-nums text-text-tertiary sm:pt-7">
                    {i === 0 ? "1º" : `${i + 1}º`}
                  </span>
                  <div>
                    <Label htmlFor={`ia-cred-${i}`}>{i === 0 ? "Chave principal" : "Reserva"}</Label>
                    <Select
                      id={`ia-cred-${i}`}
                      value={p.credentialId}
                      onChange={(e) => {
                        const nova = credencial(e.target.value);
                        const novo = [...passos];
                        novo[i] = { credentialId: e.target.value, model: modeloPadrao(nova?.type) };
                        mudar(novo);
                      }}
                    >
                      {!cred && <option value={p.credentialId}>Credencial apagada</option>}
                      {(credenciais ?? []).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} · {LLM_PROVIDERS.find((l) => l.credentialType === c.type)?.label ?? c.type}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <ModeloSelect
                    id={`ia-modelo-${i}`}
                    provider={provedorDoTipo(cred?.type)}
                    credentialId={cred ? p.credentialId : undefined}
                    value={p.model}
                    onChange={(model) => {
                      const novo = [...passos];
                      novo[i] = { ...p, model };
                      mudar(novo);
                    }}
                  />
                  <div className="flex gap-1 sm:pt-6">
                    <IconButton aria-label="Subir" tooltip size="sm" disabled={i === 0} onClick={() => mover(i, -1)}>
                      <ArrowUp size={14} />
                    </IconButton>
                    <IconButton aria-label="Descer" tooltip size="sm" disabled={i === passos.length - 1} onClick={() => mover(i, 1)}>
                      <ArrowDown size={14} />
                    </IconButton>
                    <IconButton aria-label="Tirar da lista" tooltip size="sm" onClick={() => mudar(passos.filter((_, k) => k !== i))}>
                      <Trash2 size={14} />
                    </IconButton>
                  </div>
                </div>
              );
            })}

            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="flex flex-wrap items-end gap-3">
                <Button type="button" variant="secondary" onClick={adicionar} disabled={passos.length >= 6}>
                  <Plus size={14} aria-hidden="true" /> {passos.length === 0 ? "Definir a chave principal" : "Adicionar reserva"}
                </Button>
                <div>
                  <Label htmlFor="ia-tempo">Tempo limite por tentativa</Label>
                  <Select
                    id="ia-tempo"
                    value={String(Math.round(timeoutMs / 1000))}
                    onChange={(e) => {
                      setTimeoutMs(Number(e.target.value) * 1000);
                      setSujo(true);
                    }}
                  >
                    {[...new Set([...TEMPOS, Math.round(timeoutMs / 1000)])].sort((a, b) => a - b).map((s) => (
                      <option key={s} value={s}>{s} segundos</option>
                    ))}
                  </Select>
                </div>
              </div>
              <Button type="button" onClick={salvar} disabled={!sujo || salvando}>
                {salvando ? "Salvando..." : "Salvar conexão"}
              </Button>
            </div>
          </>
        )}

        {mensagem && <Notice tone={mensagem.tom}>{mensagem.texto}</Notice>}
      </div>
    </div>
  );
}
