"use client";

import * as React from "react";
import { Briefcase, CalendarDays, ChevronDown, Plus, SlidersHorizontal, Trash2, User, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ListaDeOpcoes, Popover, SeletorMultiplo, type OpcaoDeSelecao } from "@/components/dashboard/seletor-multiplo";
import { opcoesDoCampo, type OpcoesDoDashboard } from "@/components/dashboard/opcoes";
import {
  CAMPOS_DE_FILTRO,
  LIMITE_DE_CONDICOES,
  LIMITE_DE_GRUPOS,
  campoDeFiltro,
  normalizarCondicao,
  operadoresDoCampo,
  type CampoDeFiltro,
  type FiltroDeConsulta,
  type FiltrosDeConsulta,
  type GrupoDeCampo,
  type Logica,
  type OperadorDeFiltro,
} from "@/lib/consulta";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Editor de filtros em grupos, pensado pra quem nunca escreveu uma consulta:
//
//   [Grupo 1: Todas as condições]  e também  [Grupo 2: Qualquer condição]
//
// Cada linha é "campo · operador · valor", e o operador e o valor mudam com o
// tipo do campo (lista vira chips, data vira calendário ou "últimos N dias",
// número aceita faixa). Condição sem valor fica na tela como rascunho e o
// servidor simplesmente a ignora, então o cartão não zera enquanto a pessoa
// ainda está escolhendo.
// ---------------------------------------------------------------------------

const SEM_EXTRAS: OpcoesExtras = {};

const ICONE_DO_GRUPO: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  "Negócio": Briefcase,
  "Datas": CalendarDays,
  "Contato": User,
  "Campos personalizados": SlidersHorizontal,
};

/**
 * Campo que o editor sabe mostrar: o do dashboard ou o das listas do CRM
 * (src/lib/filtro-crm.ts), que tem grupos e fontes de opção a mais.
 */
export type CampoDoEditor = Omit<CampoDeFiltro, "grupo" | "opcoes"> & { grupo: GrupoDeCampo | string; opcoes?: string };

/** Opções de fontes que o dashboard não conhece (equipes, segmentos, produtos...). */
export type OpcoesExtras = Record<string, OpcaoDeSelecao[]>;

function camposDisponiveis(opcoes: OpcoesDoDashboard, base: readonly CampoDoEditor[]): CampoDoEditor[] {
  const proprios = opcoes.campos
    .map((d) => campoDeFiltro(`cf:${d.key}`, opcoes.campos))
    .filter((c): c is CampoDeFiltro => !!c);
  return [...base, ...proprios];
}

function opcoesDaCondicao(campo: CampoDoEditor, opcoes: OpcoesDoDashboard, funilIds: string[], extras: OpcoesExtras): OpcaoDeSelecao[] {
  if (campo.opcoes && extras[campo.opcoes]) return extras[campo.opcoes];
  return opcoesDoCampo(campo as CampoDeFiltro, opcoes, funilIds);
}

function condicaoNova(campo: CampoDoEditor): FiltroDeConsulta {
  const op = operadoresDoCampo(campo)[0].id;
  return campo.tipo === "sim_nao" ? { campo: campo.id, op, valor: "true" } : { campo: campo.id, op };
}

/** Troca o operador mantendo o que ainda faz sentido do valor. */
function trocarOperador(f: FiltroDeConsulta, op: OperadorDeFiltro): FiltroDeConsulta {
  if (op === "preenchido" || op === "vazio") return { campo: f.campo, op };
  if (op === "qualquer" || op === "nenhum" || op === "todos") return { campo: f.campo, op, valores: f.valores ?? [] };
  if (op === "ultimos" || op === "proximos") {
    const n = Number(f.valor);
    return { campo: f.campo, op, valor: Number.isInteger(n) && n > 0 ? String(n) : "30" };
  }
  const valor = f.op === "ultimos" || f.op === "proximos" ? "" : f.valor;
  return { campo: f.campo, op, valor, ...(op === "entre" ? { ate: f.ate } : {}) };
}

export function EditorDeFiltros({
  filtros,
  aoMudar,
  opcoes,
  funilIds,
  catalogo = CAMPOS_DE_FILTRO,
  opcoesExtras = SEM_EXTRAS,
  campoInicialId = "etapa",
  textoVazio = "Sem filtros: entram todos os negócios acima.",
}: {
  filtros: FiltrosDeConsulta;
  aoMudar: (f: FiltrosDeConsulta) => void;
  /** Membros, etiquetas, empresas, canais e os campos personalizados (opcoes.campos). */
  opcoes: OpcoesDoDashboard;
  funilIds: string[];
  /** Campos base (padrão: os do dashboard; as listas passam CAMPOS_DE_CONTATO/NEGOCIO). */
  catalogo?: readonly CampoDoEditor[];
  opcoesExtras?: OpcoesExtras;
  /** Campo da condição nova (padrão: "Etapa", o filtro que mais se usa no dashboard). */
  campoInicialId?: string;
  textoVazio?: string;
}) {
  const campos = React.useMemo(() => camposDisponiveis(opcoes, catalogo), [opcoes, catalogo]);
  const campoInicial = campos.find((c) => c.id === campoInicialId) ?? campos[0];
  const grupos = filtros.grupos;

  const mudarGrupo = (i: number, condicoes: FiltroDeConsulta[], logica?: Logica) => {
    const novos = grupos
      .map((g, j) => (j === i ? { logica: logica ?? g.logica, condicoes } : g))
      .filter((g) => g.condicoes.length > 0);
    aoMudar({ ...filtros, grupos: novos });
  };

  const adicionarGrupo = () =>
    aoMudar({ ...filtros, grupos: [...grupos, { logica: "e", condicoes: [condicaoNova(campoInicial)] }] });

  if (grupos.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border-default px-3 py-3">
        <p className="text-caption text-text-tertiary">{textoVazio}</p>
        <button type="button" onClick={adicionarGrupo} className="mt-1.5 inline-flex items-center gap-1.5 text-caption font-medium text-accent-fg hover:underline">
          <Plus size={13} /> Adicionar condição
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {grupos.map((g, i) => (
        <React.Fragment key={i}>
          {i > 0 && (
            <div className="flex items-center gap-2 py-0.5">
              <span className="h-px flex-1 bg-border-subtle" />
              <AlternarLogica
                valor={filtros.logica}
                aoMudar={(logica) => aoMudar({ ...filtros, logica })}
                rotulos={{ e: "e também", ou: "ou então" }}
                titulo="Como os grupos se combinam"
              />
              <span className="h-px flex-1 bg-border-subtle" />
            </div>
          )}
          <div className="rounded-lg border border-border-subtle bg-raised p-2.5">
            <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
              <div className="flex items-center gap-2 text-caption text-text-tertiary">
                {grupos.length > 1 && <span className="font-medium">Grupo {i + 1}</span>}
                {g.condicoes.length > 1 ? (
                  <AlternarLogica
                    valor={g.logica}
                    aoMudar={(logica) => mudarGrupo(i, g.condicoes, logica)}
                    rotulos={{ e: "Todas as condições", ou: "Qualquer condição" }}
                    titulo="Como as condições deste grupo se combinam"
                  />
                ) : (
                  <span>Condição</span>
                )}
              </div>
              {grupos.length > 1 && (
                <button
                  type="button"
                  onClick={() => mudarGrupo(i, [])}
                  aria-label={`Remover grupo ${i + 1}`}
                  className="rounded-md p-1 text-text-tertiary transition-colors hover:text-danger"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              {g.condicoes.map((f, k) => (
                <React.Fragment key={k}>
                  {k > 0 && <span className="pl-1 text-caption font-medium text-text-tertiary">{g.logica === "ou" ? "ou" : "e"}</span>}
                  <LinhaDeCondicao
                    condicao={f}
                    campos={campos}
                    opcoes={opcoes}
                    funilIds={funilIds}
                    extras={opcoesExtras}
                    aoMudar={(nova) => mudarGrupo(i, g.condicoes.map((x, j) => (j === k ? nova : x)))}
                    aoRemover={() => mudarGrupo(i, g.condicoes.filter((_, j) => j !== k))}
                  />
                </React.Fragment>
              ))}
            </div>
            {g.condicoes.length < LIMITE_DE_CONDICOES && (
              <button
                type="button"
                onClick={() => mudarGrupo(i, [...g.condicoes, condicaoNova(campoInicial)])}
                className="mt-2 inline-flex items-center gap-1.5 px-0.5 text-caption text-accent-fg hover:underline"
              >
                <Plus size={13} /> Condição
              </button>
            )}
          </div>
        </React.Fragment>
      ))}
      {grupos.length < LIMITE_DE_GRUPOS && (
        <button type="button" onClick={adicionarGrupo} className="inline-flex w-fit items-center gap-1.5 text-caption font-medium text-text-secondary hover:text-text-primary">
          <Plus size={13} /> Adicionar grupo de condições
        </button>
      )}
    </div>
  );
}

function AlternarLogica({
  valor,
  aoMudar,
  rotulos,
  titulo,
}: {
  valor: Logica;
  aoMudar: (l: Logica) => void;
  rotulos: Record<Logica, string>;
  titulo: string;
}) {
  return (
    <div role="radiogroup" aria-label={titulo} className="inline-flex rounded-md bg-hover p-0.5">
      {(["e", "ou"] as const).map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={valor === l}
          onClick={() => aoMudar(l)}
          className={cn(
            "rounded-md px-2 py-0.5 text-caption font-medium transition-colors",
            valor === l ? "bg-panel text-text-primary ring-1 ring-border-subtle" : "text-text-tertiary hover:text-text-primary"
          )}
        >
          {rotulos[l]}
        </button>
      ))}
    </div>
  );
}

function LinhaDeCondicao({
  condicao,
  campos,
  opcoes,
  funilIds,
  extras,
  aoMudar,
  aoRemover,
}: {
  condicao: FiltroDeConsulta;
  campos: CampoDoEditor[];
  opcoes: OpcoesDoDashboard;
  funilIds: string[];
  extras: OpcoesExtras;
  aoMudar: (f: FiltroDeConsulta) => void;
  aoRemover: () => void;
}) {
  const campo = campos.find((c) => c.id === condicao.campo);
  // Filtro salvo no formato antigo ("é" numa lista) aparece já no vocabulário novo.
  const f = campo ? normalizarCondicao(condicao, campo.tipo) : condicao;
  const ops = campo ? operadoresDoCampo(campo) : [];

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md bg-panel p-1.5">
      <SeletorDeCampo campos={campos} atual={campo} aoEscolher={(c) => aoMudar(condicaoNova(c))} />
      {campo ? (
        <>
          {ops.length > 1 ? (
            <div className="w-[150px]">
              <Select value={f.op} aria-label="Operador" className="h-8 text-small" onChange={(e) => aoMudar(trocarOperador(f, e.target.value as OperadorDeFiltro))}>
                {ops.map((o) => (
                  <option key={o.id} value={o.id}>{o.rotulo}</option>
                ))}
              </Select>
            </div>
          ) : (
            <span className="px-1 text-small text-text-tertiary">{ops[0]?.rotulo}</span>
          )}
          <div className="min-w-[160px] flex-1">
            <ValorDaCondicao campo={campo} f={f} opcoes={opcoes} funilIds={funilIds} extras={extras} aoMudar={aoMudar} />
          </div>
        </>
      ) : (
        <span className="flex-1 px-1 text-caption text-text-tertiary">Este campo foi removido; a condição é ignorada.</span>
      )}
      <button type="button" aria-label="Remover condição" onClick={aoRemover} className="rounded-md p-1.5 text-text-tertiary transition-colors hover:text-danger">
        <X size={14} />
      </button>
    </div>
  );
}

/** Botão com o campo escolhido; abre a lista agrupada (Negócio, Datas, Contato, Seus campos) com busca. */
function SeletorDeCampo({
  campos,
  atual,
  aoEscolher,
}: {
  campos: CampoDoEditor[];
  atual: CampoDoEditor | undefined;
  aoEscolher: (c: CampoDoEditor) => void;
}) {
  const [aberto, setAberto] = React.useState(false);
  const ancora = React.useRef<HTMLButtonElement | null>(null);
  const fechar = React.useCallback(() => setAberto(false), []);
  const lista: OpcaoDeSelecao[] = campos.map((c) => ({ id: c.id, label: c.rotulo, grupo: c.grupo }));
  const Icone = (atual && ICONE_DO_GRUPO[atual.grupo]) || SlidersHorizontal;

  return (
    <>
      <button
        ref={ancora}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-label="Campo da condição"
        onClick={() => setAberto((v) => !v)}
        className="inline-flex h-8 min-w-[150px] max-w-[220px] items-center gap-2 rounded-md border border-border-default bg-panel px-2.5 text-left text-small text-text-primary transition-colors hover:border-border-strong"
      >
        <Icone size={13} className="shrink-0 text-text-tertiary" />
        <span className="flex-1 truncate">{atual?.rotulo ?? "Campo removido"}</span>
        <ChevronDown size={14} className="shrink-0 text-text-tertiary" />
      </button>
      <Popover aberto={aberto} aoFechar={fechar} ancora={ancora} largura={260}>
        <ListaDeOpcoes
          unica
          opcoes={lista}
          valores={atual ? [atual.id] : []}
          aoMudar={([id]) => {
            const c = campos.find((x) => x.id === id);
            if (c && c.id !== atual?.id) aoEscolher(c);
            setAberto(false);
          }}
        />
      </Popover>
    </>
  );
}

function ValorDaCondicao({
  campo,
  f,
  opcoes,
  funilIds,
  extras,
  aoMudar,
}: {
  campo: CampoDoEditor;
  f: FiltroDeConsulta;
  opcoes: OpcoesDoDashboard;
  funilIds: string[];
  extras: OpcoesExtras;
  aoMudar: (f: FiltroDeConsulta) => void;
}) {
  const listaId = React.useId();
  if (f.op === "preenchido" || f.op === "vazio") return null;

  if (campo.tipo === "lista" || campo.tipo === "multi") {
    return (
      <SeletorMultiplo
        compacto
        rotulo={`Valores de ${campo.rotulo}`}
        opcoes={opcoesDaCondicao(campo, opcoes, funilIds, extras)}
        valores={f.valores ?? []}
        aoMudar={(valores) => aoMudar({ ...f, valores })}
        placeholder="Escolha um ou mais..."
      />
    );
  }

  if (campo.tipo === "sim_nao") {
    return (
      <Select value={f.valor ?? "true"} aria-label={`Valor de ${campo.rotulo}`} className="h-8 text-small" onChange={(e) => aoMudar({ ...f, valor: e.target.value })}>
        <option value="true">Sim</option>
        <option value="false">Não</option>
      </Select>
    );
  }

  if (campo.tipo === "data") {
    if (f.op === "ultimos" || f.op === "proximos") {
      return (
        <div className="flex items-center gap-1.5">
          <Input
            type="number"
            min={1}
            max={3650}
            value={f.valor ?? ""}
            aria-label="Quantidade de dias"
            className="h-8 w-[90px] text-small"
            onChange={(e) => aoMudar({ ...f, valor: e.target.value })}
          />
          <span className="text-caption text-text-tertiary">dias</span>
        </div>
      );
    }
    return (
      // Duas datas não cabem lado a lado numa linha estreita: a segunda desce.
      <div className="flex flex-wrap items-center gap-1.5">
        <Input type="date" value={f.valor ?? ""} aria-label={f.op === "entre" ? "De" : "Data"} className="h-8 w-auto flex-1 text-small" onChange={(e) => aoMudar({ ...f, valor: e.target.value })} />
        {f.op === "entre" && (
          <span className="flex flex-1 items-center gap-1.5">
            <span className="text-caption text-text-tertiary">e</span>
            <Input type="date" value={f.ate ?? ""} aria-label="Até" className="h-8 w-auto flex-1 text-small" onChange={(e) => aoMudar({ ...f, ate: e.target.value })} />
          </span>
        )}
      </div>
    );
  }

  if (campo.tipo === "numero") {
    const prefixo = campo.formato === "dinheiro" ? "R$" : null;
    const sufixo = campo.formato === "porcento" ? "%" : campo.formato === "dias" ? "dias" : null;
    const caixa = (valor: string | undefined, rotulo: string, aoTrocar: (v: string) => void) => (
      <div className="flex min-w-0 flex-1 items-center gap-1">
        {prefixo && <span className="text-caption text-text-tertiary">{prefixo}</span>}
        <Input inputMode="decimal" value={valor ?? ""} aria-label={rotulo} placeholder="0" className="h-8 text-small" onChange={(e) => aoTrocar(e.target.value)} />
        {sufixo && <span className="text-caption text-text-tertiary">{sufixo}</span>}
      </div>
    );
    return (
      <div className="flex items-center gap-1.5">
        {caixa(f.valor, f.op === "entre" ? "Valor mínimo" : "Valor", (valor) => aoMudar({ ...f, valor }))}
        {f.op === "entre" && (
          <>
            <span className="text-caption text-text-tertiary">e</span>
            {caixa(f.ate, "Valor máximo", (ate) => aoMudar({ ...f, ate }))}
          </>
        )}
      </div>
    );
  }

  // texto; motivo de perda sugere os que já foram usados.
  const sugestoes = campo.id === "motivoPerda" ? opcoes.motivosDePerda : [];
  return (
    <>
      <Input
        value={f.valor ?? ""}
        aria-label={`Valor de ${campo.rotulo}`}
        placeholder="Digite..."
        className="h-8 text-small"
        list={sugestoes.length ? listaId : undefined}
        onChange={(e) => aoMudar({ ...f, valor: e.target.value })}
      />
      {sugestoes.length > 0 && (
        <datalist id={listaId}>
          {sugestoes.map((s) => <option key={s} value={s} />)}
        </datalist>
      )}
    </>
  );
}
