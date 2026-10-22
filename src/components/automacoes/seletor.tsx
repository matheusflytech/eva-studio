"use client";

import * as React from "react";
import { Modal, ModalContent } from "@/components/ui/modal";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { CATEGORY_CLASSES } from "@/lib/design-system/category-classes";
import { acoesDoObjeto, configPadrao, EVENTOS_DE_ESPERA, type GrupoDeAcao } from "@/lib/automacoes/catalogo";
import { novoId, saidaPrincipal, saidasDe, type No, type Objeto } from "@/lib/automacoes/tipos";
import { visualDoPasso } from "./comum";

// ---------------------------------------------------------------------------
// O "+" do canvas: escolher o próximo passo com busca. Ações do catálogo que
// valem para o tipo de registro, mais a lógica (condição, caminhos, esperas,
// fim). Passo com mais de uma saída no meio do fluxo pergunta para onde vai
// o que já vinha depois.
// ---------------------------------------------------------------------------

const GRUPOS: Record<GrupoDeAcao, string> = { registro: "CRM", pessoas: "Equipe", cliente: "Cliente", integracao: "Integração" };

interface Logica {
  tipo: No["tipo"];
  nome: string;
  descricao: string;
}

const LOGICA: Logica[] = [
  { tipo: "condicao", nome: "Condição (se/senão)", descricao: "Segue por Sim ou Não conforme uma regra." },
  { tipo: "caminhos", nome: "Caminhos", descricao: "Vários ramos; vale o primeiro que bater." },
  { tipo: "espera", nome: "Esperar", descricao: "Um tempo (dias úteis, horas) ou até uma data." },
  { tipo: "esperar_evento", nome: "Esperar evento", descricao: "Ex.: o cliente responder, com prazo." },
  { tipo: "fim", nome: "Fim", descricao: "Encerra este ramo." },
];

export function novoPasso(tipo: No["tipo"], objeto: Objeto, acao?: string): No {
  const id = novoId();
  switch (tipo) {
    case "acao": {
      const item = acoesDoObjeto(objeto).find((a) => a.tipo === acao)!;
      return { id, tipo: "acao", acao: item.tipo, config: configPadrao(item.campos), proximo: null };
    }
    case "condicao":
      return { id, tipo: "condicao", regra: { grupos: [] }, sim: null, nao: null };
    case "caminhos":
      return { id, tipo: "caminhos", caminhos: [{ id: novoId("c"), nome: "Caminho 1", regra: { grupos: [] }, proximo: null }], senao: null };
    case "espera":
      return { id, tipo: "espera", config: { modo: "duracao", quantidade: 1, unidade: "dias_uteis" }, proximo: null };
    case "esperar_evento":
      return {
        id,
        tipo: "esperar_evento",
        evento: EVENTOS_DE_ESPERA.find((e) => e.objetos.includes(objeto))?.tipo ?? "",
        prazo: { quantidade: 1, unidade: "dias_uteis" },
        aconteceu: null,
        esgotou: null,
      };
    default:
      return { id, tipo: "fim" };
  }
}

export function SeletorDePasso({
  aberto,
  fechar,
  objeto,
  ocupado,
  escolher,
}: {
  aberto: boolean;
  fechar: () => void;
  objeto: Objeto;
  /** Já tem passo depois desta ligação (inserir no meio). */
  ocupado: boolean;
  escolher: (no: No, seguintesPor?: string) => void;
}) {
  const [pendente, setPendente] = React.useState<No | null>(null);
  const acoes = acoesDoObjeto(objeto);

  const sair = () => {
    setPendente(null);
    fechar();
  };
  const finalizar = (no: No, seguintesPor?: string) => {
    setPendente(null);
    escolher(no, seguintesPor);
  };

  function pegar(no: No) {
    // No meio do fluxo, passo com várias saídas: perguntar para onde vai o resto.
    if (ocupado && saidasDe(no).length > 1) setPendente(no);
    else finalizar(no);
  }

  const Item = ({ tipo, acao, nome, descricao, desativado }: { tipo: string; acao?: string; nome: string; descricao: string; desativado?: boolean }) => {
    const v = visualDoPasso(tipo, acao);
    const Icone = v.icone;
    return (
      <CommandItem
        value={`${nome} ${descricao}`}
        disabled={desativado}
        onSelect={() => pegar(novoPasso(tipo as No["tipo"], objeto, acao))}
        className="flex items-start gap-2.5 py-2"
      >
        <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md", CATEGORY_CLASSES[v.cor].subtle, CATEGORY_CLASSES[v.cor].fg)}>
          <Icone size={14} />
        </span>
        <span className="min-w-0">
          <span className="block text-[13px] text-text-primary">{nome}</span>
          <span className="block text-[11.5px] text-text-tertiary">{desativado ? "Só no fim de um caminho." : descricao}</span>
        </span>
      </CommandItem>
    );
  };

  return (
    <Modal open={aberto} onOpenChange={(v) => !v && sair()}>
      <ModalContent size="md" title={pendente ? "Para onde vai o que já vinha depois?" : "Adicionar passo"}>
        {pendente ? (
          <div className="flex flex-col gap-2 px-5 pb-5">
            {saidasDe(pendente).map((s) => (
              <button
                key={s.saida}
                type="button"
                onClick={() => finalizar(pendente, s.saida)}
                className={cn(
                  "rounded-lg border border-border-default px-3 py-2 text-left text-[13px] text-text-primary hover:border-border-strong hover:bg-raised",
                  s.saida === saidaPrincipal(pendente) && "border-accent-solid"
                )}
              >
                Pelo ramo “{s.nome || "seguinte"}”
              </button>
            ))}
          </div>
        ) : (
          <Command className="px-2 pb-3">
            <CommandInput placeholder="Buscar passo..." autoFocus />
            <CommandList className="max-h-[60vh]">
              <CommandEmpty>Nada com esse nome.</CommandEmpty>
              {(Object.keys(GRUPOS) as GrupoDeAcao[]).map((g) => {
                const doGrupo = acoes.filter((a) => a.grupo === g);
                if (!doGrupo.length) return null;
                return (
                  <CommandGroup key={g} heading={GRUPOS[g]}>
                    {doGrupo.map((a) => (
                      <Item key={a.tipo} tipo="acao" acao={a.tipo} nome={a.nome} descricao={a.descricao} />
                    ))}
                  </CommandGroup>
                );
              })}
              <CommandGroup heading="Lógica">
                {LOGICA.map((l) => (
                  <Item key={l.tipo} tipo={l.tipo} nome={l.nome} descricao={l.descricao} desativado={l.tipo === "fim" && ocupado} />
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        )}
      </ModalContent>
    </Modal>
  );
}
