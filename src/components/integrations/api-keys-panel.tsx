"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { KeyRound, Plus, Trash2, Copy, Check, AlertTriangle, FileText } from "lucide-react";
import { Field, Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Button, buttonVariants } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Notice } from "@/components/ui/notice";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { CabecalhoDaSecao, EsqueletoDeLista, ItemDeConfig, ListaDeConfig, RotuloDeGrupo, VazioDeConfig } from "@/components/configuracoes/secao";
import { formatRelativeDate } from "@/lib/utils";
import { RECURSOS } from "@/lib/server/api-v1/escopos";
import { ESCOPO_DA_CHAVE_EXIGE } from "@/lib/permissoes/catalogo";

interface ApiKeyRow {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
  scopes?: string[];
  expiresAt?: string | null;
  createdBy?: { id: string; name: string } | null;
}

const VALIDADES = [
  { valor: "", rotulo: "Sem validade" },
  { valor: "30", rotulo: "30 dias" },
  { valor: "90", rotulo: "90 dias" },
  { valor: "365", rotulo: "1 ano" },
];

/** "contacts:read" → "Contatos: ler". */
function rotuloDoEscopo(s: string): string {
  if (s === "*") return "Acesso total";
  const [recurso, acao] = s.split(":");
  const nome = ESCOPO_DA_CHAVE_EXIGE[recurso]?.nome ?? recurso;
  return `${nome}: ${acao === "read" ? "ler" : acao === "write" ? "escrever" : "ler e escrever"}`;
}

// Chaves de API do contrato (/api/v1/*) — igual Pipedrive/HubSpot: cria uma
// chave com nome, o que ela pode (escopos) e, se quiser, até quando vale. Ela
// aparece completa SÓ UMA VEZ pra copiar; depois só o prefixo (o valor de
// verdade nunca é recuperável, só revogável).
// v5: lista com linhas finas; "Nova chave" abre numa gaveta. O título é h1
// em Configurações e h2 dentro da aba de Integrações.
export function ApiKeysPanel({ nivelDoTitulo = 1 }: { nivelDoTitulo?: 1 | 2 } = {}) {
  const [keys, setKeys] = React.useState<ApiKeyRow[] | null>(null);
  const [podeGerenciar, setPodeGerenciar] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [total, setTotal] = React.useState(true);
  const [escolhidos, setEscolhidos] = React.useState<Set<string>>(new Set());
  const [validade, setValidade] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [revealedKey, setRevealedKey] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [origin, setOrigin] = React.useState("");
  // Momento em que a tela abriu: basta para marcar "vencida" (não precisa de relógio).
  const [agora] = React.useState(() => Date.now());

  React.useEffect(() => setOrigin(window.location.origin), []);

  const load = React.useCallback(() => {
    fetch("/api/api-keys")
      .then((res) => res.json())
      .then((data) => {
        setKeys(data.keys ?? []);
        setPodeGerenciar(!!data.podeGerenciar);
      })
      .catch(() => setKeys([]));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  function alternar(escopo: string) {
    setEscolhidos((atual) => {
      const novo = new Set(atual);
      if (novo.has(escopo)) novo.delete(escopo);
      else novo.add(escopo);
      return novo;
    });
  }

  async function handleCreate() {
    if (!newName.trim()) {
      setError("Dê um nome pra chave (ex: Produção, n8n).");
      return;
    }
    if (!total && escolhidos.size === 0) {
      setError("Escolha pelo menos uma coisa que a chave pode fazer.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const expiresAt = validade ? new Date(Date.now() + Number(validade) * 86_400_000).toISOString() : null;
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), scopes: total ? ["*"] : [...escolhidos], expiresAt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao criar chave.");
      setRevealedKey(data.apiKey.key);
      setCreating(false);
      setNewName("");
      setEscolhidos(new Set());
      setTotal(true);
      setValidade("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRevoke(id: string) {
    if (!window.confirm("Revogar essa chave? Qualquer integração usando ela vai parar de funcionar imediatamente.")) return;
    setKeys((prev) => (prev ?? []).map((k) => (k.id === id ? { ...k, revokedAt: new Date().toISOString() } : k)));
    await fetch(`/api/api-keys/${id}`, { method: "DELETE" }).catch(() => load());
  }

  async function copyRevealed() {
    if (!revealedKey) return;
    await navigator.clipboard.writeText(revealedKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  const activeKeys = (keys ?? []).filter((k) => !k.revokedAt);

  return (
    <div>
      <CabecalhoDaSecao
        nivel={nivelDoTitulo}
        titulo="Chaves de API do contrato"
        descricao="Conecte sua automação, seu ERP ou um script próprio aos dados deste contrato. Cada chave tem nome, o que pode fazer e, se quiser, validade."
        acoes={
          <>
            <Link href="/integracoes/api" className={buttonVariants({ variant: "ghost" })}>
              <FileText size={14} aria-hidden="true" /> Documentação
            </Link>
            {podeGerenciar && (
              <button type="button" onClick={() => setCreating(true)} className={buttonVariants({ variant: "primary" })}>
                <Plus size={14} aria-hidden="true" /> Nova chave
              </button>
            )}
          </>
        }
      />

      {revealedKey && (
        <div className="mb-4 rounded-[14px] bg-warning-subtle p-4">
          <div className="mb-2 flex items-center gap-2 text-small font-medium text-warning">
            <AlertTriangle size={14} aria-hidden="true" /> Copie agora, essa chave não aparece de novo
          </div>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-[10px] bg-panel px-3 py-2 font-mono text-small text-text-primary">{revealedKey}</code>
            <IconButton variant="secondary" aria-label="Copiar a chave" tooltip={copied ? "Copiada" : "Copiar"} onClick={copyRevealed}>
              {copied ? <Check className="text-success" /> : <Copy />}
            </IconButton>
          </div>
          <button type="button" onClick={() => setRevealedKey(null)} className="mt-2 text-caption font-medium text-text-secondary hover:text-text-primary">
            Já copiei, pode fechar
          </button>
        </div>
      )}

      <RotuloDeGrupo contagem={keys === null ? undefined : activeKeys.length}>Chaves ativas</RotuloDeGrupo>
      {keys === null ? (
        <EsqueletoDeLista />
      ) : activeKeys.length === 0 ? (
        <VazioDeConfig>
          Nenhuma chave ativa ainda.{podeGerenciar ? " Crie uma para ler e gravar dados deste contrato de fora do Eva." : ""}
        </VazioDeConfig>
      ) : (
        <ListaDeConfig>
          {activeKeys.map((k) => {
            const vencida = k.expiresAt ? new Date(k.expiresAt).getTime() <= agora : false;
            const escopos = k.scopes?.length ? k.scopes : ["*"];
            const resumo = escopos.includes("*") ? "Acesso total" : `${escopos.length} permiss${escopos.length === 1 ? "ão" : "ões"}`;
            return (
              <ItemDeConfig
                key={k.id}
                icone={<KeyRound />}
                titulo={k.name}
                detalhe={
                  <span title={escopos.map(rotuloDoEscopo).join(", ")}>
                    <span className="font-mono">{k.keyPrefix}···</span> · {resumo} · criada {formatRelativeDate(k.createdAt)}
                    {k.createdBy ? ` por ${k.createdBy.name}` : ""}
                  </span>
                }
                direita={
                  <>
                    <span className="font-mono text-caption text-text-tertiary">
                      {k.lastUsedAt ? `usada ${formatRelativeDate(k.lastUsedAt)}` : "nunca usada"}
                    </span>
                    {k.expiresAt && (
                      <Badge variant={vencida ? "danger" : "neutral"}>
                        {vencida ? "Vencida" : `Vale até ${new Date(k.expiresAt).toLocaleDateString("pt-BR")}`}
                      </Badge>
                    )}
                    {podeGerenciar && (
                      <IconButton aria-label={`Revogar a chave ${k.name}`} tooltip="Revogar" className="hover:text-danger" onClick={() => handleRevoke(k.id)}>
                        <Trash2 />
                      </IconButton>
                    )}
                  </>
                }
              />
            );
          })}
        </ListaDeConfig>
      )}

      {origin && (
        <div className="mt-6">
          <RotuloDeGrupo>Exemplo</RotuloDeGrupo>
          <pre className="overflow-x-auto rounded-[14px] bg-raised p-3.5 font-mono text-caption leading-relaxed text-text-secondary">
{`curl ${origin}/api/v1/contacts \\
  -H "Authorization: Bearer evs_live_..."`}
          </pre>
        </div>
      )}

      {/* Nova chave: gaveta com Cancelar/Criar no rodapé. */}
      <Drawer
        open={creating}
        onOpenChange={(v) => {
          if (!v) {
            setCreating(false);
            setError(null);
          }
        }}
      >
        <DrawerContent
          title="Nova chave de API"
          description="Ela aparece completa uma vez só, para copiar. Depois, só o começo."
          footer={
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  setCreating(false);
                  setError(null);
                }}
              >
                Cancelar
              </Button>
              <Button disabled={saving} onClick={handleCreate}>
                {saving ? "Criando..." : "Criar chave"}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nome da chave">
                <Input placeholder="Ex: Produção, Integração n8n" value={newName} onChange={(e) => setNewName(e.target.value)} />
              </Field>
              <Field label="Validade">
                <Select value={validade} onChange={(e) => setValidade(e.target.value)}>
                  {VALIDADES.map((v) => (
                    <option key={v.valor} value={v.valor}>
                      {v.rotulo}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div>
              <Label>O que a chave pode fazer</Label>
              <SegmentedControl
                label="O que a chave pode fazer"
                value={total ? "tudo" : "escolher"}
                onChange={(v) => setTotal(v === "tudo")}
                options={[
                  { value: "tudo", label: "Tudo que eu posso" },
                  { value: "escolher", label: "Escolher" },
                ]}
              />
              {!total && (
                <div className="mt-3 overflow-x-auto rounded-[14px] border border-border-subtle">
                  <table className="w-full text-small">
                    <thead className="bg-raised font-mono text-caption text-text-tertiary">
                      <tr>
                        <th className="px-3 py-2 text-left font-normal">Dados</th>
                        <th className="px-3 py-2 font-normal">Ler</th>
                        <th className="px-3 py-2 font-normal">Criar e editar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {RECURSOS.map((r) => (
                        <tr key={r} className="border-t border-border-subtle">
                          <td className="px-3 py-2 text-text-secondary">{ESCOPO_DA_CHAVE_EXIGE[r]?.nome ?? r}</td>
                          {(["read", "write"] as const).map((a) => (
                            <td key={a} className="px-3 py-2 text-center">
                              <Checkbox
                                className="mx-auto"
                                checked={escolhidos.has(`${r}:${a}`)}
                                onCheckedChange={() => alternar(`${r}:${a}`)}
                                aria-label={`${ESCOPO_DA_CHAVE_EXIGE[r]?.nome ?? r}: ${a === "read" ? "ler" : "criar e editar"}`}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="mt-2 text-caption text-text-tertiary">
                A chave nunca pode mais do que você: se seu papel não edita negócios, a chave também não edita.
              </p>
            </div>

            {error && <Notice tone="danger">{error}</Notice>}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
