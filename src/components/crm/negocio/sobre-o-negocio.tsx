"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { reaisDigitados } from "@/lib/dinheiro";
import { CamposDoFormulario, rascunhoInicial, rascunhoParaEnvio, type Rascunho } from "@/components/crm/campos-personalizados";
import type { DefinicaoDeCampo } from "@/lib/custom-fields";
import { CampoInline, Secao, dataLonga } from "./pecas";
import type { Membro, NegocioDaFicha } from "./use-ficha";

const reaisParaTexto = (cents: number) =>
  cents === 0 ? "" : (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Campos do negócio, editáveis no lugar. Cada campo salva sozinho ao sair
 * dele; os personalizados salvam em bloco (como na gaveta), porque o
 * formulário deles valida tudo junto e um obrigatório vazio barra o resto.
 */
export function SobreONegocio({
  deal,
  defs,
  membros,
  patch,
}: {
  deal: NegocioDaFicha;
  defs: DefinicaoDeCampo[];
  membros: Membro[];
  patch: (body: Record<string, unknown>) => Promise<string | null>;
}) {
  const [erroDono, setErroDono] = React.useState<string | null>(null);

  async function salvarValor(v: string) {
    const reais = reaisDigitados(v);
    if (reais === null) return "Valor inválido (máximo R$ 21 milhões).";
    if (Math.round(reais * 100) === deal.amountCents) return null;
    return patch({ amount: reais });
  }

  async function salvarProbabilidade(v: string) {
    const n = Number(v.replace("%", "").trim() || "0");
    if (!Number.isFinite(n) || n < 0 || n > 100) return "Use um número de 0 a 100.";
    return patch({ probability: Math.round(n) });
  }

  return (
    <Secao titulo="Sobre o negócio">
      <div className="flex flex-col gap-2">
        <CampoInline
          id="ficha-valor"
          rotulo="Valor"
          prefixo="R$"
          tipo="numero"
          placeholder="0,00"
          valor={reaisParaTexto(deal.amountCents)}
          onSalvar={salvarValor}
          className="font-display tabular-nums"
        />
        <CampoInline
          id="ficha-prob"
          rotulo="Probabilidade"
          tipo="numero"
          sufixo="%"
          valor={String(deal.probability)}
          onSalvar={salvarProbabilidade}
          className="tabular-nums"
        />
        {/* Data sem hora: o servidor grava meio-dia UTC, e o dia é a parte UTC do ISO. */}
        <CampoInline
          id="ficha-previsao"
          rotulo="Previsão de fechamento"
          tipo="data"
          valor={deal.expectedClosingAt ? deal.expectedClosingAt.slice(0, 10) : ""}
          onSalvar={(v) => patch({ expectedClosingAt: v || null })}
        />
        <div>
          <label htmlFor="ficha-dono-sobre" className="mb-0.5 block px-2 text-[11.5px] text-text-tertiary">
            Responsável
          </label>
          <Select
            id="ficha-dono-sobre"
            value={deal.ownerId ?? ""}
            onChange={async (e) => setErroDono(await patch({ ownerId: e.target.value || null }))}
            className="h-8 rounded-lg border-transparent bg-transparent px-2 text-[13px] hover:border-border-subtle hover:bg-surface-2"
          >
            <option value="">Sem responsável</option>
            {deal.owner && !membros.some((m) => m.id === deal.owner!.id) && (
              <option value={deal.owner.id}>{deal.owner.name || "Sem nome"}</option>
            )}
            {membros.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name || m.email}
              </option>
            ))}
          </Select>
          {erroDono && <p role="alert" className="mt-1 px-2 text-[11.5px] text-danger">{erroDono}</p>}
        </div>
        <ApenasLeitura rotulo="Funil" valor={deal.pipeline.name} />
        <ApenasLeitura rotulo="Criado em" valor={dataLonga(deal.createdAt)} />
        {deal.closedAt && <ApenasLeitura rotulo="Fechado em" valor={dataLonga(deal.closedAt)} />}
        {deal.stage.type === "lost" && (
          <CampoInline
            id="ficha-motivo-perda"
            rotulo="Motivo da perda"
            placeholder="Preço, prazo, concorrente..."
            valor={deal.lostReason}
            onSalvar={(v) => patch({ lostReason: v })}
          />
        )}
        <CampoInline
          id="ficha-descricao"
          rotulo="Descrição"
          tipo="area"
          placeholder="O que está sendo negociado, contexto, próximos passos..."
          valor={deal.description ?? ""}
          onSalvar={(v) => patch({ description: v })}
        />
      </div>

      {defs.length > 0 && <CamposDoNegocio deal={deal} defs={defs} patch={patch} />}
    </Secao>
  );
}

function ApenasLeitura({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="px-2 py-0.5">
      <div className="text-[11.5px] text-text-tertiary">{rotulo}</div>
      <div className="py-1 text-[13px] text-text-secondary">{valor}</div>
    </div>
  );
}

function CamposDoNegocio({
  deal,
  defs,
  patch,
}: {
  deal: NegocioDaFicha;
  defs: DefinicaoDeCampo[];
  patch: (body: Record<string, unknown>) => Promise<string | null>;
}) {
  const [rascunho, setRascunho] = React.useState<Rascunho>(() => rascunhoInicial(defs, deal.customFields));
  const [sujo, setSujo] = React.useState(false);
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  // Recarga do servidor sem edição pendente: mostra o que está gravado.
  const [base, setBase] = React.useState({ defs, valores: deal.customFields });
  if (!sujo && (base.defs !== defs || base.valores !== deal.customFields)) {
    setBase({ defs, valores: deal.customFields });
    setRascunho(rascunhoInicial(defs, deal.customFields));
  }

  async function salvar() {
    setSalvando(true);
    setErro(null);
    const falha = await patch({ customFields: rascunhoParaEnvio(defs, rascunho) });
    setSalvando(false);
    if (falha) {
      setErro(falha);
      return;
    }
    setSujo(false);
  }

  return (
    <div className="mt-4 border-t border-border-subtle pt-4">
      <h3 className="mb-3 px-2 text-[12px] font-medium text-text-secondary">Campos personalizados</h3>
      <div className="flex flex-col gap-3 px-2">
        <CamposDoFormulario
          defs={defs}
          rascunho={rascunho}
          prefixo="ficha"
          onChange={(k, v) => {
            setRascunho((r) => ({ ...r, [k]: v }));
            setSujo(true);
          }}
        />
        {erro && (
          <p role="alert" className="text-[12px] text-danger">
            {erro}
          </p>
        )}
        {sujo && (
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setRascunho(rascunhoInicial(defs, deal.customFields));
                setSujo(false);
                setErro(null);
              }}
            >
              Descartar
            </Button>
            <Button size="sm" onClick={salvar} disabled={salvando}>
              {salvando && <Loader2 size={14} className="animate-spin" />} Salvar campos
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
