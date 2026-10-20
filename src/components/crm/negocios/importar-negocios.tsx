"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Field, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal, ModalContent } from "@/components/ui/modal";
import { Notice } from "@/components/ui/notice";
import { Stat } from "@/components/ui/stat";

interface Resultado {
  created: number;
  updated: number;
  unchanged: number;
  failed: number;
  errors: { row: number; message: string }[];
}

/**
 * Importar negócios por CSV (POST /api/deals/import): mesma leitura da
 * importação em lote da API v1. Sem coluna de etapa, entra na etapa escolhida.
 */
export function ImportarNegocios({
  pipeline,
  onClose,
  onDone,
}: {
  pipeline: { id: string; name: string; stages: { id: string; name: string }[] };
  onClose: () => void;
  onDone: () => void;
}) {
  const [csv, setCsv] = React.useState("");
  const [stageId, setStageId] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [res, setRes] = React.useState<Resultado | null>(null);

  async function run() {
    setBusy(true);
    setErro(null);
    const r = await fetch("/api/deals/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv, pipelineId: pipeline.id, stageId: stageId || undefined }),
    }).catch(() => null);
    const d = await r?.json().catch(() => ({}));
    setBusy(false);
    if (!r?.ok) {
      setErro(d?.error ?? "Não foi possível importar.");
      return;
    }
    setRes(d as Resultado);
  }

  const linhas = csv ? csv.split("\n").filter((l) => l.trim()).length - 1 : 0;

  return (
    <Modal open onOpenChange={(v) => !v && onClose()}>
      <ModalContent
        title="Importar negócios"
        description={`CSV com cabeçalho para o funil ${pipeline.name}. Colunas reconhecidas: nome, valor, previsao, responsavel_id, empresa_id, etapa_id, contato_email, contato_telefone, contato_nome; outras viram campo personalizado. O contato é achado por e-mail ou telefone (ou criado). Até 1.000 linhas.`}
        footer={
          res ? (
            <Button variant="primary" onClick={onDone}>
              Pronto
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={onClose}>
                Cancelar
              </Button>
              <Button variant="primary" onClick={run} disabled={!csv} loading={busy}>
                Importar
              </Button>
            </>
          )
        }
      >
        {res ? (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-4 gap-3 rounded-lg border border-border-subtle p-3">
              <Stat label="Criados" value={res.created} />
              <Stat label="Atualizados" value={res.updated} />
              <Stat label="Sem mudança" value={res.unchanged} />
              <Stat label="Com erro" value={res.failed} />
            </div>
            {res.errors.length > 0 && (
              <Notice tone="warning">
                <ul className="flex flex-col gap-1">
                  {res.errors.map((e) => (
                    <li key={e.row}>
                      Linha {e.row}: {e.message}
                    </li>
                  ))}
                </ul>
              </Notice>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {erro && <Notice tone="danger">{erro}</Notice>}
            <div>
              <Label htmlFor="csv-negocios">Arquivo</Label>
              <input
                id="csv-negocios"
                type="file"
                accept=".csv,text/csv"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) setCsv(await f.text());
                }}
                className="block w-full text-small text-text-secondary file:mr-3 file:h-8 file:rounded-md file:border file:border-border-default file:bg-panel file:px-3 file:text-small file:text-text-primary"
              />
            </div>
            <Field label="Etapa de entrada" hint="Vale para as linhas sem a coluna etapa_id.">
              <Select value={stageId} onChange={(e) => setStageId(e.target.value)}>
                <option value="">Primeira etapa</option>
                {pipeline.stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            {csv && <p className="text-caption text-text-tertiary">{linhas} linha(s) prontas para importar.</p>}
          </div>
        )}
      </ModalContent>
    </Modal>
  );
}
