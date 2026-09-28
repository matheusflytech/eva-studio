"use client";

import * as React from "react";
import { Sparkles, Loader2, RefreshCw, AlertTriangle } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CredentialSelect } from "@/components/agent-studio/builder/credential-select";

interface EmbeddingModel {
  id: string;
  label: string;
  provider: "openai" | "google";
}

interface Status {
  models: EmbeddingModel[];
  embeddingModel: string;
  embeddingCredentialId: string;
  chunkCount: number;
  docCount: number;
  indexedDocCount: number;
  needsReindex: boolean;
}

/**
 * Liga a busca semântica da base de conhecimento.
 *
 * Desligada, a base funciona por palavra (full-text do Postgres). Ligada, ela
 * também encontra por sentido — "vocês parcelam?" acha "aceitamos em até 12x",
 * que não tem uma palavra em comum.
 */
export function SemanticSearchConfig({ agentId }: { agentId: string }) {
  const [status, setStatus] = React.useState<Status | null>(null);
  const [model, setModel] = React.useState("");
  const [credentialId, setCredentialId] = React.useState<string | undefined>(undefined);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    const res = await fetch(`/api/agents/${agentId}/embeddings`);
    if (!res.ok) return;
    const data: Status = await res.json();
    setStatus(data);
    setModel(data.embeddingModel);
    setCredentialId(data.embeddingCredentialId || undefined);
  }, [agentId]);

  React.useEffect(() => { refresh(); }, [refresh]);

  async function save(nextModel: string, nextCredential?: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/agents/${agentId}/embeddings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeddingModel: nextModel, embeddingCredentialId: nextCredential ?? "" }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Não foi possível salvar.");
      return;
    }
    setNotice(
      data.disabled
        ? "Busca semântica desligada. A base continua funcionando por palavra."
        : `Indexado: ${data.docs} documento(s), ${data.chunks} trecho(s).`
    );
    refresh();
  }

  const selectedModel = status?.models.find((m) => m.id === model);
  const credentialType = selectedModel?.provider ?? "openai";
  const enabled = !!status?.embeddingModel;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles size={16} className="text-text-tertiary" /> Busca semântica
            </CardTitle>
            <CardDescription>
              Encontra na base de conhecimento por sentido, não só por palavra igual.
            </CardDescription>
          </div>
          <Badge variant={enabled ? "success" : "neutral"}>{enabled ? "Ligada" : "Desligada"}</Badge>
        </div>
      </CardHeader>

      <div className="flex flex-col gap-3">
        <div>
          <Label htmlFor="emb-model">Modelo de embedding</Label>
          <Select
            id="emb-model"
            value={model}
            onChange={(e) => {
              setModel(e.target.value);
              // Trocar de provedor invalida a credencial escolhida.
              const next = status?.models.find((m) => m.id === e.target.value);
              if (next && next.provider !== selectedModel?.provider) setCredentialId(undefined);
            }}
          >
            <option value="">Desligada — busca por palavra (padrão)</option>
            {status?.models.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </Select>
        </div>

        {model && (
          <CredentialSelect
            type={credentialType}
            label={`Credencial ${credentialType === "openai" ? "OpenAI" : "Google"}`}
            value={credentialId}
            onChange={setCredentialId}
          />
        )}

        {status && enabled && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface-2 px-4 py-3 text-[13px]">
            <span className="text-text-secondary">
              {status.indexedDocCount} de {status.docCount} documento(s) indexado(s) ·{" "}
              {status.chunkCount} trecho(s)
            </span>
            {status.needsReindex && (
              <span className="inline-flex items-center gap-1.5 text-[12px] text-amber-400">
                <AlertTriangle size={13} /> Há documento sem índice
              </span>
            )}
            <Button
              variant="secondary"
              className="ml-auto"
              disabled={busy}
              onClick={() => save(status.embeddingModel, status.embeddingCredentialId)}
            >
              <RefreshCw size={14} /> Reindexar
            </Button>
          </div>
        )}

        {error && <p className="text-[13px] text-danger">{error}</p>}
        {notice && <p className="text-[13px] text-emerald-400">{notice}</p>}

        <div className="flex items-center gap-2">
          <Button onClick={() => save(model, credentialId)} disabled={busy || (!!model && !credentialId)}>
            {busy && <Loader2 size={15} className="animate-spin" />} Salvar
          </Button>
          <p className="text-[11.5px] text-text-tertiary">
            Trocar de modelo reindexa tudo: vetores de modelos diferentes não são comparáveis entre si.
          </p>
        </div>
      </div>
    </Card>
  );
}
