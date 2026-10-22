"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { Loader2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { dinheiro } from "@/components/crm/negocios/modelo";
import type { EtapaDoMovimento, ResultadoDaTentativa } from "@/components/crm/negocios/mudanca-de-etapa";
import { classeDoGanho } from "./cabecalho";
import { ProdutosDoNegocio, type ItensDoNegocio } from "./produtos";
import type { Membro, NegocioDaFicha } from "./use-ficha";

/**
 * Cartão escuro ao lado da linha do tempo (v5): o que importa para fechar.
 * Empresa e responsável, produtos em blocos e, no rodapé, valor, chance e
 * funil com o botão Ganho. Fica escuro nos dois temas (data-theme="dark"),
 * contrastando com a folha clara.
 */
export function CartaoLateral({
  deal,
  membros,
  patch,
  produtos,
  moverEtapa,
}: {
  deal: NegocioDaFicha;
  membros: Membro[];
  patch: (body: Record<string, unknown>) => Promise<string | null>;
  produtos: ItensDoNegocio;
  moverEtapa: (para: EtapaDoMovimento | null, extra?: Record<string, unknown>) => Promise<ResultadoDaTentativa>;
}) {
  const [trocandoDono, setTrocandoDono] = React.useState(false);
  const [erroDono, setErroDono] = React.useState<string | null>(null);
  const [ganhando, setGanhando] = React.useState(false);
  const etapaGanha = deal.pipeline.stages.find((s) => s.type === "won");
  const aberto = deal.stage.type === "open";
  const rotulo = "mb-1 block font-mono text-caption text-text-tertiary";

  return (
    <aside data-theme="dark" aria-label="Resumo para fechar" className="flex min-w-0 flex-col gap-4 rounded-[20px] bg-panel p-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <span className={rotulo}>Empresa</span>
          {deal.company ? (
            <Link
              href={`/empresas/${deal.company.id}`}
              className="flex min-w-0 items-center gap-2 rounded-md text-body font-semibold text-text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-focus"
            >
              <Avatar name={deal.company.name} className="rounded-md" />
              <span className="truncate">{deal.company.name}</span>
            </Link>
          ) : (
            <span className="text-small text-text-tertiary">Nenhuma</span>
          )}
        </div>
        <div className="min-w-0 text-right">
          <label htmlFor="ficha-dono" className={rotulo}>
            Responsável
          </label>
          <Select
            id="ficha-dono"
            value={deal.ownerId ?? ""}
            disabled={trocandoDono}
            onChange={async (e) => {
              setTrocandoDono(true);
              setErroDono(await patch({ ownerId: e.target.value || null }));
              setTrocandoDono(false);
            }}
            className="h-8 text-small"
          >
            <option value="">Sem responsável</option>
            {/* Dono atual que saiu da equipe continua aparecendo, senão o select mostraria "Sem responsável". */}
            {deal.owner && !membros.some((m) => m.id === deal.owner!.id) && <option value={deal.owner.id}>{deal.owner.name || "Sem nome"}</option>}
            {membros.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name || m.email}
              </option>
            ))}
          </Select>
          {erroDono && (
            <p role="alert" className="mt-1 text-caption text-danger">
              {erroDono}
            </p>
          )}
        </div>
      </div>

      <ProdutosDoNegocio estado={produtos} />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[16px] bg-raised py-2.5 pl-3 pr-2">
        <Dado rotulo="Valor" valor={deal.amountCents > 0 ? dinheiro(deal.amountCents) : "Sem valor"} />
        {aberto && <Dado rotulo="Chance" valor={`${deal.probability}%`} />}
        <Dado rotulo="Funil" valor={deal.pipeline.name} />
        {aberto && etapaGanha && (
          <Button
            variant="secondary"
            size="sm"
            disabled={ganhando}
            onClick={async () => {
              setGanhando(true);
              await moverEtapa(etapaGanha);
              setGanhando(false);
            }}
            className={`ml-auto h-8 ${classeDoGanho}`}
          >
            {ganhando ? <Loader2 size={14} className="animate-spin" /> : null} Ganho
          </Button>
        )}
      </div>
    </aside>
  );
}

function Dado({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <span className="flex min-w-0 flex-col text-caption text-text-tertiary">
      {rotulo}
      <span className="truncate text-small font-medium tabular-nums text-text-primary">{valor}</span>
    </span>
  );
}
