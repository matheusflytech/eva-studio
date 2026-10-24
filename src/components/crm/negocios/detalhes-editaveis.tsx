"use client";

import * as React from "react";
import { Repeat, X } from "lucide-react";
import { Select } from "@/components/ui/select";
import { reaisDigitados } from "@/lib/dinheiro";
import type { DefinicaoDeCampo } from "@/lib/custom-fields";
import type { CampoDoCartao } from "@/lib/cartao-layout";
import { CampoEditor, rascunhoInicial, rascunhoParaEnvio } from "@/components/crm/campos-personalizados";
import { BotaoDeIcone, BuscaDeVinculo, CampoInline } from "@/components/crm/negocio/pecas";
import { buscarEmpresas } from "@/components/crm/negocio/vinculos";
import type { Membro, NegocioDaFicha } from "@/components/crm/negocio/use-ficha";

// "Detalhes" do painel do quadro editáveis no lugar (spec 2026-10-23
// painel-editavel): os mesmos editores da ficha, um campo por linha.

type Patch = (body: Record<string, unknown>) => Promise<string | null>;

const reaisParaTexto = (cents: number) =>
  cents === 0 ? "" : (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Corpo do PATCH de um campo personalizado: só a chave dele (o servidor junta com o resto). */
export function corpoDoPersonalizado(def: DefinicaoDeCampo, valor: string | boolean | string[]): Record<string, unknown> {
  return { customFields: rascunhoParaEnvio([def], { [def.key]: valor }) };
}

/**
 * Editor de cada linha de Detalhes, ou undefined (a linha fica só leitura).
 * `onSalvou` avisa o quadro para atualizar o card.
 */
export function editoresDoPainel({
  deal,
  defs,
  membros,
  patch,
  onSalvou,
  seletorDeEtapa,
}: {
  deal: NegocioDaFicha;
  defs: DefinicaoDeCampo[];
  membros: Membro[];
  patch: Patch;
  onSalvou: () => void;
  seletorDeEtapa: React.ReactNode;
}): (campo: CampoDoCartao) => React.ReactNode | undefined {
  const salvar: Patch = async (body) => {
    const falha = await patch(body);
    if (!falha) onSalvou();
    return falha;
  };
  const id = (campo: string) => `painel-${deal.id}-${campo}`;

  return function editor(campo) {
    switch (campo) {
      case "etapa":
        return seletorDeEtapa;
      case "nome":
        return (
          <CampoInline id={id(campo)} rotulo="Nome do negócio" rotuloOculto valor={deal.name} onSalvar={(v) => (v.trim() ? salvar({ name: v }) : Promise.resolve("O nome não pode ficar vazio."))} />
        );
      case "valor":
        return (
          <CampoInline
            id={id(campo)}
            rotulo="Valor"
            rotuloOculto
            prefixo="R$"
            tipo="numero"
            placeholder="0,00"
            valor={reaisParaTexto(deal.amountCents)}
            className="tabular-nums"
            onSalvar={async (v) => {
              const reais = reaisDigitados(v);
              if (reais === null) return "Valor inválido (máximo R$ 21 milhões).";
              return Math.round(reais * 100) === deal.amountCents ? null : salvar({ amount: reais });
            }}
          />
        );
      case "probabilidade":
        return (
          <CampoInline
            id={id(campo)}
            rotulo="Chance de fechar"
            rotuloOculto
            tipo="numero"
            sufixo="%"
            valor={String(deal.probability)}
            className="tabular-nums"
            onSalvar={async (v) => {
              const n = Number(v.replace("%", "").trim() || "0");
              if (!Number.isFinite(n) || n < 0 || n > 100) return "Use um número de 0 a 100.";
              return salvar({ probability: Math.round(n) });
            }}
          />
        );
      case "previsao":
        // Data sem hora: o servidor grava meio-dia UTC, e o dia é a parte UTC do ISO.
        return (
          <CampoInline
            id={id(campo)}
            rotulo="Previsão de fechamento"
            rotuloOculto
            tipo="data"
            valor={deal.expectedClosingAt ? deal.expectedClosingAt.slice(0, 10) : ""}
            onSalvar={(v) => salvar({ expectedClosingAt: v || null })}
          />
        );
      case "responsavel":
        return <Responsavel id={id(campo)} deal={deal} membros={membros} salvar={salvar} />;
      case "empresa":
        return <Empresa deal={deal} salvar={salvar} />;
      default: {
        if (!campo.startsWith("cf:")) return undefined;
        const def = defs.find((d) => `cf:${d.key}` === campo);
        return def ? <Personalizado id={id(campo)} def={def} deal={deal} salvar={salvar} /> : undefined;
      }
    }
  };
}

function Erro({ erro }: { erro: string | null }) {
  return erro ? <p role="alert" className="mt-1 px-2 text-caption font-normal text-danger">{erro}</p> : null;
}

function Responsavel({ id, deal, membros, salvar }: { id: string; deal: NegocioDaFicha; membros: Membro[]; salvar: Patch }) {
  const [erro, setErro] = React.useState<string | null>(null);
  return (
    <div>
      <Select
        id={id}
        aria-label="Responsável"
        value={deal.ownerId ?? ""}
        onChange={async (e) => setErro(await salvar({ ownerId: e.target.value || null }))}
        className="h-8 border-transparent bg-transparent px-2 text-small hover:border-border-subtle hover:bg-hover"
      >
        <option value="">Sem responsável</option>
        {deal.owner && !membros.some((m) => m.id === deal.owner!.id) && <option value={deal.owner.id}>{deal.owner.name || "Sem nome"}</option>}
        {membros.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name || m.email}
          </option>
        ))}
      </Select>
      <Erro erro={erro} />
    </div>
  );
}

function Empresa({ deal, salvar }: { deal: NegocioDaFicha; salvar: Patch }) {
  const [buscando, setBuscando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  if (buscando) {
    return (
      <div className="font-normal">
        <BuscaDeVinculo
          rotulo="Buscar empresa para vincular"
          placeholder="Nome, CNPJ ou setor"
          buscar={buscarEmpresas}
          ignorar={deal.company ? [deal.company.id] : []}
          onFechar={() => setBuscando(false)}
          onEscolher={async (empresaId) => {
            const falha = await salvar({ companyId: empresaId });
            setErro(falha);
            if (!falha) setBuscando(false);
          }}
        />
        <Erro erro={erro} />
      </div>
    );
  }
  return (
    <div>
      <div className="flex min-w-0 items-center gap-1">
        {deal.company ? (
          <span className="min-w-0 flex-1 truncate px-2">{deal.company.name}</span>
        ) : (
          <button type="button" onClick={() => setBuscando(true)} className="min-w-0 flex-1 rounded-lg px-2 py-1 text-left font-normal text-text-tertiary hover:bg-hover hover:text-text-primary">
            Vincular empresa
          </button>
        )}
        {deal.company && (
          <>
            <BotaoDeIcone rotulo="Trocar empresa" onClick={() => setBuscando(true)}>
              <Repeat size={14} />
            </BotaoDeIcone>
            <BotaoDeIcone rotulo={`Remover ${deal.company.name} do negócio`} onClick={async () => setErro(await salvar({ companyId: null }))} className="hover:bg-danger-subtle hover:text-danger">
              <X size={14} />
            </BotaoDeIcone>
          </>
        )}
      </div>
      <Erro erro={erro} />
    </div>
  );
}

/** Escolhas salvam ao mudar; texto, número e afins salvam ao sair do campo. */
const SALVA_AO_MUDAR = new Set(["select", "multiselect", "checkbox", "date"]);

function Personalizado({ id, def, deal, salvar }: { id: string; def: DefinicaoDeCampo; deal: NegocioDaFicha; salvar: Patch }) {
  const salvo = rascunhoInicial([def], deal.customFields)[def.key];
  const [valor, setValor] = React.useState(salvo);
  const [erro, setErro] = React.useState<string | null>(null);
  // Valor novo do servidor (recarga depois de salvar) substitui o rascunho.
  const [anterior, setAnterior] = React.useState(salvo);
  if (JSON.stringify(salvo) !== JSON.stringify(anterior)) {
    setAnterior(salvo);
    setValor(salvo);
  }

  async function gravar(v: string | boolean | string[]) {
    if (JSON.stringify(v) === JSON.stringify(salvo)) return setErro(null);
    const falha = await salvar(corpoDoPersonalizado(def, v));
    setErro(falha);
    if (falha) setValor(salvo);
  }

  return (
    <div
      className="font-normal [&_input]:h-8 [&_select]:h-8"
      onBlur={(e) => {
        if (!SALVA_AO_MUDAR.has(def.type) && !e.currentTarget.contains(e.relatedTarget)) void gravar(valor);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && JSON.stringify(valor) !== JSON.stringify(salvo)) {
          e.preventDefault();
          setValor(salvo);
        }
      }}
    >
      <label htmlFor={id} className="sr-only">
        {def.label}
      </label>
      <CampoEditor
        id={id}
        def={def}
        valor={valor}
        onChange={(v) => {
          setValor(v);
          if (SALVA_AO_MUDAR.has(def.type)) void gravar(v);
        }}
      />
      <Erro erro={erro} />
    </div>
  );
}
