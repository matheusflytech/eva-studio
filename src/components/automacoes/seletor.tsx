"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, Database, GitBranch, MessageCircle, Search, Users, Webhook, X, type LucideIcon } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { CATEGORY_CLASSES } from "@/lib/design-system/category-classes";
import { acoesDoObjeto, configPadrao, EVENTOS_DE_ESPERA, type GrupoDeAcao } from "@/lib/automacoes/catalogo";
import { novoId, saidaPrincipal, saidasDe, type No, type Objeto } from "@/lib/automacoes/tipos";
import { IconeDoPasso, visualDoPasso, type VisualDoPasso } from "./comum";
import { MOLA } from "@/lib/design-system/movimento";

// ---------------------------------------------------------------------------
// O "+" do canvas abre o painel "O que vem depois?" à direita: busca no topo
// e as categorias em linhas (ícone, nome, descrição e seta). Ações do catálogo
// que valem para o tipo de registro, mais a lógica (condição, caminhos,
// esperas, fim). Passo com mais de uma saída no meio do fluxo pergunta para
// onde vai o que já vinha depois.
// ---------------------------------------------------------------------------

type Categoria = GrupoDeAcao | "logica";

const CATEGORIAS: { id: Categoria; nome: string; descricao: string; icone: LucideIcon }[] = [
  { id: "registro", nome: "CRM", descricao: "Campos, etapa, etiquetas, notas e registros.", icone: Database },
  { id: "pessoas", nome: "Equipe", descricao: "Responsável, tarefas e avisos para o time.", icone: Users },
  { id: "cliente", nome: "Cliente", descricao: "WhatsApp, e-mail, régua e atendente.", icone: MessageCircle },
  { id: "integracao", nome: "Integração", descricao: "n8n e chamadas para outras APIs.", icone: Webhook },
  { id: "logica", nome: "Lógica", descricao: "Condição, caminhos, esperas e fim.", icone: GitBranch },
];

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

interface Opcao {
  chave: string;
  categoria: Categoria;
  tipo: No["tipo"];
  acao?: string;
  nome: string;
  descricao: string;
  desativado: boolean;
}

// Busca sem acento e sem caixa: "acao" acha "Ação".
const normal = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();


function Linha({
  icone: Icone,
  visual,
  corDoIcone,
  nome,
  descricao,
  seta,
  desativado,
  aoClicar,
  indice,
}: {
  icone: LucideIcon;
  /** Passo do catálogo: com marca, mostra o logo oficial no lugar do ícone. */
  visual?: VisualDoPasso;
  corDoIcone?: string;
  nome: string;
  descricao: string;
  seta?: boolean;
  desativado?: boolean;
  aoClicar: () => void;
  indice: number;
}) {
  const calmo = useReducedMotion();
  return (
    <motion.li
      initial={calmo ? { opacity: 0 } : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...MOLA, delay: Math.min(indice, 10) * 0.025 }}
    >
      <button
        type="button"
        disabled={desativado}
        onClick={aoClicar}
        className="group flex w-full items-center gap-3 rounded-[14px] px-2.5 py-2 text-left transition-colors duration-150 hover:bg-raised disabled:pointer-events-none disabled:opacity-45"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] border border-border-subtle bg-raised">
          {visual ? (
            <IconeDoPasso visual={visual} tamanho={16} className={corDoIcone ?? "text-text-secondary"} />
          ) : (
            <Icone size={16} aria-hidden="true" className={corDoIcone ?? "text-text-secondary"} />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-small font-medium text-text-primary">{nome}</span>
          <span className="block truncate text-caption text-text-tertiary">{descricao}</span>
        </span>
        {seta && (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] border border-border-subtle text-text-tertiary transition-[transform,color,border-color] duration-200 group-hover:translate-x-0.5 group-hover:border-border-strong group-hover:text-text-primary motion-reduce:group-hover:translate-x-0">
            <ArrowRight size={13} aria-hidden="true" />
          </span>
        )}
      </button>
    </motion.li>
  );
}

export function PainelDoProximoPasso({
  objeto,
  ocupado,
  escolher,
  fechar,
}: {
  objeto: Objeto;
  /** Já tem passo depois desta ligação (inserir no meio). */
  ocupado: boolean;
  escolher: (no: No, seguintesPor?: string) => void;
  fechar: () => void;
}) {
  const calmo = useReducedMotion();
  const [busca, setBusca] = React.useState("");
  const [categoria, setCategoria] = React.useState<Categoria | null>(null);
  const [pendente, setPendente] = React.useState<No | null>(null);

  const opcoes = React.useMemo<Opcao[]>(
    () => [
      ...acoesDoObjeto(objeto).map((a) => ({ chave: a.tipo, categoria: a.grupo as Categoria, tipo: "acao" as const, acao: a.tipo, nome: a.nome, descricao: a.descricao, desativado: false })),
      ...LOGICA.map((l) => ({
        chave: l.tipo,
        categoria: "logica" as const,
        tipo: l.tipo,
        nome: l.nome,
        descricao: l.tipo === "fim" && ocupado ? "Só no fim de um caminho." : l.descricao,
        desativado: l.tipo === "fim" && ocupado,
      })),
    ],
    [objeto, ocupado]
  );
  const categorias = CATEGORIAS.filter((c) => opcoes.some((o) => o.categoria === c.id));
  const termo = normal(busca.trim());
  const lista = termo
    ? opcoes.filter((o) => normal(`${o.nome} ${o.descricao}`).includes(termo))
    : categoria
      ? opcoes.filter((o) => o.categoria === categoria)
      : null;

  function pegar(o: Opcao) {
    if (o.desativado) return;
    const no = novoPasso(o.tipo, objeto, o.acao);
    // No meio do fluxo, passo com várias saídas: perguntar para onde vai o resto.
    if (ocupado && saidasDe(no).length > 1) setPendente(no);
    else escolher(no);
  }

  const vista = pendente ? "pendente" : lista ? `lista:${termo ? "busca" : categoria}` : "categorias";
  const atual = categoria ? CATEGORIAS.find((c) => c.id === categoria) : undefined;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 pb-3 pt-4">
        {(categoria || pendente) && !termo ? (
          <IconButton
            aria-label="Voltar"
            size="sm"
            onClick={() => {
              if (pendente) setPendente(null);
              else setCategoria(null);
            }}
          >
            <ArrowLeft />
          </IconButton>
        ) : null}
        <p className="min-w-0 flex-1 truncate text-body font-semibold tracking-tight text-text-primary">
          {pendente ? "Para onde vai o que já vinha depois?" : atual && !termo ? atual.nome : "O que vem depois?"}
        </p>
        <IconButton aria-label="Fechar painel" size="sm" onClick={fechar}>
          <X />
        </IconButton>
      </div>

      {!pendente && (
        <div className="px-4 pb-2">
          <label className="flex h-9 items-center gap-2 rounded-[10px] border border-border-subtle bg-raised px-2.5 text-text-tertiary focus-within:border-accent-solid">
            <Search size={14} aria-hidden="true" />
            <input
              autoFocus
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => {
                // Enter escolhe o primeiro da busca; Esc limpa e depois fecha.
                if (e.key === "Enter" && lista?.length) {
                  e.preventDefault();
                  const primeiro = lista.find((o) => !o.desativado);
                  if (primeiro) pegar(primeiro);
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  if (busca) setBusca("");
                  else fechar();
                }
              }}
              placeholder="Buscar passo..."
              aria-label="Buscar passo"
              className="h-full min-w-0 flex-1 bg-transparent text-small text-text-primary outline-none placeholder:text-text-tertiary"
            />
          </label>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={vista}
            initial={calmo ? { opacity: 0 } : { opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={calmo ? { opacity: 0 } : { opacity: 0, x: -6 }}
            transition={{ duration: 0.16, ease: [0.32, 0.72, 0, 1] }}
          >
            {pendente ? (
              <ul className="flex flex-col gap-1 px-2 pt-1">
                {saidasDe(pendente).map((s, i) => (
                  <Linha
                    key={s.saida}
                    indice={i}
                    icone={GitBranch}
                    corDoIcone={s.saida === saidaPrincipal(pendente) ? "text-accent-fg" : undefined}
                    nome={`Pelo ramo “${s.nome || "seguinte"}”`}
                    descricao={s.saida === saidaPrincipal(pendente) ? "O caminho principal deste passo." : "Os passos seguintes passam a sair daqui."}
                    seta
                    aoClicar={() => {
                      const no = pendente;
                      setPendente(null);
                      escolher(no, s.saida);
                    }}
                  />
                ))}
              </ul>
            ) : lista ? (
              lista.length ? (
                <ul className="flex flex-col">
                  {lista.map((o, i) => {
                    const v = visualDoPasso(o.tipo, o.acao);
                    return (
                      <Linha
                        key={o.chave}
                        indice={i}
                        icone={v.icone}
                        visual={v}
                        corDoIcone={CATEGORY_CLASSES[v.cor].fg}
                        nome={o.nome}
                        descricao={o.descricao}
                        desativado={o.desativado}
                        aoClicar={() => pegar(o)}
                      />
                    );
                  })}
                </ul>
              ) : (
                <p className="px-2.5 py-3 text-small text-text-tertiary">Nada com esse nome.</p>
              )
            ) : (
              <ul className="flex flex-col">
                {categorias.map((c, i) => (
                  <Linha key={c.id} indice={i} icone={c.icone} nome={c.nome} descricao={c.descricao} seta aoClicar={() => setCategoria(c.id)} />
                ))}
              </ul>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
