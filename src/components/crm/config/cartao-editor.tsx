"use client";

import * as React from "react";
import { Check, CircleAlert, Info, Loader2, Lock, RotateCcw, Rows2, Rows4, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { ListaOrdenavel } from "@/components/crm/config/lista-ordenavel";
import { DealCard } from "@/components/crm/negocios/deal-card";
import { ConteudoDaPrevia, type EtapaDaPrevia } from "@/components/crm/negocios/previa";
import { camposDisponiveis, ehPersonalizado, rotulosPersonalizados } from "@/components/crm/negocios/cartao";
import type { NegocioKanban } from "@/components/crm/negocios/modelo";
import {
  LAYOUT_PADRAO,
  MAX_CAMPOS_NA_PREVIA,
  MAX_CAMPOS_NO_CARTAO,
  rotuloDoCampo,
  type CampoDoCartao,
  type Densidade,
  type LayoutDoCartao,
} from "@/lib/cartao-layout";
import type { DefinicaoDeCampo } from "@/lib/custom-fields";
import { cn } from "@/lib/utils";

// Aba "Cartão do negócio" de /negocios/configurar: por funil, o que aparece no
// cartão do quadro, o que aparece na prévia ao clicar e a densidade, com um
// cartão de exemplo mudando ao vivo. Só quem configura funil salva.

interface FunilSimples {
  id: string;
  name: string;
  stages: EtapaDaPrevia[];
}

interface DadosDoCartao {
  layout: LayoutDoCartao;
  padrao: LayoutDoCartao;
  salvo: boolean;
  disponivel: boolean;
}

type Aviso = { tom: "ok" | "erro" | "info"; texto: string };

/** O que cada informação faz no cartão, quando não é óbvio pelo nome. */
const DICA: Partial<Record<CampoDoCartao, string>> = {
  empresa: "Vira o título do cartão, que abre a ficha",
  nome: "Aparece embaixo quando o título é a empresa",
  whatsapp: "Ícone com ponto quando há mensagem não lida",
  proximoPasso: "Um sinal só: atraso, parado ou a próxima tarefa",
  probabilidade: "Barra e porcentagem, só em etapas abertas",
};

const PAPEIS_QUE_EDITAM = new Set(["owner", "admin"]);
const DIA = 86_400_000;

/** Valor fictício coerente com o tipo do campo, para o cartão de exemplo. */
function valorDeExemplo(def: DefinicaoDeCampo, agora: Date): unknown {
  switch (def.type) {
    case "number":
      return 42;
    case "currency":
      return 150_000;
    case "date":
      return new Date(agora.getTime() + 10 * DIA).toISOString().slice(0, 10);
    case "select":
      return def.options[0]?.value ?? "Exemplo";
    case "multiselect":
      return def.options.slice(0, 2).map((o) => o.value);
    case "checkbox":
      return true;
    case "url":
      return "https://exemplo.com.br";
    case "phone":
      return "(11) 3456-7890";
    case "email":
      return "compras@exemplo.com.br";
    default:
      return def.label ? `Exemplo de ${def.label.toLowerCase()}` : "Exemplo";
  }
}

function negocioDeExemplo(defs: DefinicaoDeCampo[], agora: Date): NegocioKanban {
  const t = agora.getTime();
  return {
    id: "exemplo",
    name: "Plano anual com implantação",
    amountCents: 1_850_000,
    probability: 60,
    company: { id: "empresa-exemplo", name: "Padaria Bom Pão" },
    owner: { id: "dono-exemplo", name: "Ana Souza" },
    contacts: [{ id: "contato-exemplo", name: "Marina Costa", phone: "(11) 98765-4321", email: "marina@bompao.com.br" }],
    openTasks: 2,
    expectedClosingAt: new Date(t + 12 * DIA).toISOString().slice(0, 10) + "T12:00:00.000Z",
    closedAt: null,
    customFields: Object.fromEntries(defs.map((d) => [d.key, valorDeExemplo(d, agora)])),
    createdAt: new Date(t - 20 * DIA).toISOString(),
    stageSince: new Date(t - 3 * DIA).toISOString(),
    whatsapp: { conversationId: "conversa-exemplo", naoLida: true },
    nextTask: { type: "reuniao", text: "Apresentar proposta revisada", dueAt: new Date(t + DIA).toISOString() },
  };
}

async function lerJson<T>(url: string): Promise<{ ok: boolean; dados: T | null }> {
  const res = await fetch(url).catch(() => null);
  if (!res) return { ok: false, dados: null };
  const dados = (await res.json().catch(() => null)) as T | null;
  return { ok: res.ok, dados };
}

export function CartaoEditor({ funilInicial }: { funilInicial?: string }) {
  const [funis, setFunis] = React.useState<FunilSimples[] | null>(null);
  const [funilId, setFunilId] = React.useState("");
  const [podeEditar, setPodeEditar] = React.useState(false);
  const [dados, setDados] = React.useState<DadosDoCartao | null>(null);
  const [defs, setDefs] = React.useState<DefinicaoDeCampo[]>([]);
  const [rascunho, setRascunho] = React.useState<LayoutDoCartao>(LAYOUT_PADRAO);
  const [erroDeCarga, setErroDeCarga] = React.useState<string | null>(null);
  const [salvando, setSalvando] = React.useState(false);
  const [aviso, setAviso] = React.useState<Aviso | null>(null);
  // Data fixa enquanto a tela está aberta: o exemplo não muda sozinho.
  const [agora] = React.useState(() => new Date());

  React.useEffect(() => {
    let ativo = true;
    lerJson<{ pipelines?: FunilSimples[] }>("/api/pipelines").then(({ dados: d }) => {
      if (!ativo) return;
      const lista = d?.pipelines ?? [];
      setFunis(lista);
      setFunilId(lista.find((f) => f.id === funilInicial)?.id ?? lista[0]?.id ?? "");
      if (lista.length === 0) setErroDeCarga("Nenhum funil encontrado.");
    });
    lerJson<{ me?: { role?: string } }>("/api/members").then(({ dados: d }) => {
      if (ativo) setPodeEditar(PAPEIS_QUE_EDITAM.has(d?.me?.role ?? ""));
    });
    return () => {
      ativo = false;
    };
  }, [funilInicial]);

  React.useEffect(() => {
    if (!funilId) return;
    let ativo = true;
    Promise.all([
      lerJson<DadosDoCartao & { error?: string }>(`/api/pipelines/${funilId}/cartao`),
      lerJson<{ fields?: DefinicaoDeCampo[] }>(`/api/custom-fields?entity=deal&pipelineId=${funilId}`),
    ]).then(([cartao, campos]) => {
      if (!ativo) return;
      if (!cartao.ok || !cartao.dados?.layout) {
        setErroDeCarga(cartao.dados?.error ?? "Não foi possível carregar o cartão deste funil.");
        return;
      }
      setErroDeCarga(null);
      setDefs(campos.dados?.fields ?? []);
      setDados(cartao.dados);
      setRascunho(cartao.dados.layout);
    });
    return () => {
      ativo = false;
    };
  }, [funilId]);

  const funil = funis?.find((f) => f.id === funilId);
  const sujo = !!dados && JSON.stringify(rascunho) !== JSON.stringify(dados.layout);
  const ehPadrao = !!dados && JSON.stringify(rascunho) === JSON.stringify(dados.padrao);
  const disponiveis = React.useMemo(() => camposDisponiveis(defs), [defs]);
  const rotulos = React.useMemo(() => rotulosPersonalizados(defs), [defs]);
  const exemplo = React.useMemo(() => negocioDeExemplo(defs, agora), [defs, agora]);
  const etapaDeExemplo: EtapaDaPrevia = funil?.stages.find((s) => s.type === "open") ?? {
    id: "etapa-exemplo",
    name: "Negociação",
    type: "open",
    color: "blue",
  };

  function trocarDeFunil(id: string) {
    if (sujo && !window.confirm("Há alterações não salvas no cartão deste funil. Trocar mesmo assim?")) return;
    setDados(null);
    setAviso(null);
    setFunilId(id);
  }

  function mudar(parcial: Partial<LayoutDoCartao>) {
    setRascunho((r) => ({ ...r, ...parcial }));
    setAviso(null);
  }

  async function salvar() {
    if (!dados) return;
    setSalvando(true);
    setAviso(null);
    const res = await fetch(`/api/pipelines/${funilId}/cartao`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rascunho),
    }).catch(() => null);
    const d = ((await res?.json().catch(() => null)) ?? {}) as { layout?: LayoutDoCartao; error?: string };
    setSalvando(false);
    if (res?.ok && d.layout) {
      setDados({ ...dados, layout: d.layout, salvo: true, disponivel: true });
      setRascunho(d.layout);
      setAviso({ tom: "ok", texto: `Cartão salvo. O quadro de "${funil?.name ?? "este funil"}" já usa este layout.` });
      return;
    }
    if (res?.status === 503) setDados({ ...dados, disponivel: false });
    setAviso({ tom: "erro", texto: d.error ?? "Não foi possível salvar o cartão. Tente de novo." });
  }

  if (erroDeCarga && !dados) {
    return <div className="rounded-[14px] bg-danger-subtle px-4 py-3 text-small text-danger">{erroDeCarga}</div>;
  }
  if (!funis || !dados) {
    return (
      <p className="inline-flex items-center gap-2 text-body text-text-tertiary">
        <Loader2 size={14} className="animate-spin" aria-hidden /> Carregando...
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <p className="max-w-[600px] text-small text-text-secondary">
          Escolha o que cada cartão do quadro mostra e o que aparece na prévia ao clicar nele. Vale para todo mundo que usa este funil.
        </p>
        {funis.length > 1 && (
          <div className="w-[220px]">
            <label htmlFor="cartao-funil" className="mb-1 block text-caption text-text-tertiary">
              Funil
            </label>
            <Select id="cartao-funil" value={funilId} onChange={(e) => trocarDeFunil(e.target.value)} className="h-9 text-small">
              {funis.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>

      {!podeEditar && (
        <Faixa tom="info" icone={Lock}>
          Só administradores mudam o cartão. Você está vendo como ele está configurado neste funil.
        </Faixa>
      )}
      {!dados.disponivel && (
        <Faixa tom="aviso" icone={CircleAlert}>
          A personalização do cartão ainda não foi ativada no banco. O quadro usa o padrão até lá; dá para montar o cartão aqui, mas salvar só
          funciona depois da ativação.
        </Faixa>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-5">
          <section aria-labelledby="cartao-densidade" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-panel/70 p-4 ring-1 ring-border-subtle">
            <div>
              <h3 id="cartao-densidade" className="text-body font-semibold text-text-primary">
                Densidade
              </h3>
              <p className="mt-0.5 text-small text-text-tertiary">Compacto cabe mais negócios na tela; confortável dá mais respiro.</p>
            </div>
            <div role="radiogroup" aria-labelledby="cartao-densidade" className="inline-flex rounded-lg border border-border-subtle bg-raised p-0.5">
              {(
                [
                  ["confortavel", "Confortável", Rows2],
                  ["compacto", "Compacto", Rows4],
                ] as const
              ).map(([valor, rotulo, Icone]) => (
                <button
                  key={valor}
                  type="button"
                  role="radio"
                  aria-checked={rascunho.densidade === valor}
                  disabled={!podeEditar}
                  onClick={() => mudar({ densidade: valor as Densidade })}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-small outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed",
                    rascunho.densidade === valor ? "bg-hover text-text-primary" : "text-text-tertiary hover:text-text-primary"
                  )}
                >
                  <Icone size={14} aria-hidden /> {rotulo}
                </button>
              ))}
            </div>
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            <ListaDeCampos
              id="no-cartao"
              titulo="No cartão"
              descricao="Na ordem em que aparecem no quadro."
              itens={rascunho.campos}
              max={MAX_CAMPOS_NO_CARTAO}
              disponiveis={disponiveis}
              rotulos={rotulos}
              podeEditar={podeEditar}
              comDicas
              onChange={(campos) => mudar({ campos })}
            />
            <ListaDeCampos
              id="na-previa"
              titulo="Na prévia"
              descricao="O que aparece ao clicar no cartão."
              itens={rascunho.previa}
              max={MAX_CAMPOS_NA_PREVIA}
              disponiveis={disponiveis}
              rotulos={rotulos}
              podeEditar={podeEditar}
              onChange={(previa) => mudar({ previa })}
            />
          </div>

          {podeEditar && (
            <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-3 rounded-2xl border border-border-subtle bg-panel/95 px-4 py-3 backdrop-blur">
              <div aria-live="polite" className="min-w-0 flex-1 text-small">
                {aviso ? (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5",
                      aviso.tom === "ok" ? "text-success" : aviso.tom === "erro" ? "text-danger" : "text-text-secondary"
                    )}
                  >
                    {aviso.tom === "ok" ? <Check size={14} aria-hidden /> : aviso.tom === "erro" ? <CircleAlert size={14} aria-hidden /> : <Info size={14} aria-hidden />}
                    {aviso.texto}
                  </span>
                ) : sujo ? (
                  <span className="text-warning">Alterações não salvas</span>
                ) : (
                  <span className="text-text-tertiary">{dados.salvo ? "Layout salvo para este funil." : "Este funil usa o cartão padrão."}</span>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={ehPadrao || salvando}
                onClick={() => {
                  setRascunho(dados.padrao);
                  setAviso({ tom: "info", texto: "Padrão restaurado. Salve para aplicar no quadro." });
                }}
              >
                <RotateCcw size={14} aria-hidden /> Restaurar padrão
              </Button>
              <Button size="sm" disabled={!sujo || salvando} onClick={salvar}>
                {salvando && <Loader2 size={14} className="animate-spin" aria-hidden />} Salvar
              </Button>
            </div>
          )}
        </div>

        <aside aria-label="Prévia ao vivo" className="flex flex-col gap-4 xl:sticky xl:top-4 xl:self-start">
          <div>
            <p className="mb-2 font-mono text-caption text-text-tertiary">Cartão no quadro</p>
            <div className="rounded-xl border border-border-subtle bg-panel p-2">
              <DealCard deal={exemplo} tipoDaEtapa={etapaDeExemplo.type} defs={defs} agora={agora} layout={rascunho} />
            </div>
          </div>
          <div>
            <p className="mb-2 font-mono text-caption text-text-tertiary">Prévia ao clicar</p>
            <div className="rounded-2xl border border-border-default bg-panel p-4">
              <ConteudoDaPrevia deal={exemplo} etapa={etapaDeExemplo} layout={rascunho} defs={defs} agora={agora} />
            </div>
          </div>
          <p className="text-caption text-text-tertiary">Dados fictícios, só para mostrar como fica.</p>
        </aside>
      </div>
    </div>
  );
}

function Faixa({ tom, icone: Icone, children }: { tom: "info" | "aviso"; icone: typeof Info; children: React.ReactNode }) {
  return (
    <div
      role={tom === "aviso" ? "alert" : undefined}
      className={cn(
        "flex items-start gap-2.5 rounded-2xl px-4 py-3 text-small",
        tom === "aviso" ? "bg-warning-subtle text-warning ring-1 ring-transparent" : "bg-raised text-text-secondary ring-1 ring-border-subtle"
      )}
    >
      <Icone size={15} aria-hidden className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

function ListaDeCampos({
  id,
  titulo,
  descricao,
  itens,
  max,
  disponiveis,
  rotulos,
  podeEditar,
  comDicas = false,
  onChange,
}: {
  id: string;
  titulo: string;
  descricao: string;
  itens: CampoDoCartao[];
  max: number;
  disponiveis: CampoDoCartao[];
  rotulos: Record<string, string>;
  podeEditar: boolean;
  comDicas?: boolean;
  onChange: (itens: CampoDoCartao[]) => void;
}) {
  const restantes = disponiveis.filter((c) => !itens.includes(c));
  const padrao = restantes.filter((c) => !ehPersonalizado(c));
  const personalizados = restantes.filter(ehPersonalizado);
  const cheio = itens.length >= max;

  const linha = (campo: CampoDoCartao, alca: React.ReactNode | null) => (
    <div className="flex items-center gap-2 rounded-[14px] bg-raised py-1.5 pl-1.5 pr-2 ring-1 ring-border-subtle">
      {alca ?? <span className="w-1.5" aria-hidden />}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-small font-medium text-text-primary">{rotuloDoCampo(campo, rotulos)}</span>
          {ehPersonalizado(campo) && <Badge className="px-2 py-0.5 text-caption">Personalizado</Badge>}
        </div>
        {comDicas && DICA[campo] && <p className="mt-0.5 truncate text-caption text-text-tertiary">{DICA[campo]}</p>}
      </div>
      {podeEditar && (
        <button
          type="button"
          onClick={() => onChange(itens.filter((c) => c !== campo))}
          aria-label={`Tirar "${rotuloDoCampo(campo, rotulos)}" de ${titulo.toLowerCase()}`}
          title="Tirar"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-text-tertiary outline-none hover:bg-hover hover:text-text-primary focus-visible:ring-2 focus-visible:ring-focus"
        >
          <X size={14} aria-hidden />
        </button>
      )}
    </div>
  );

  return (
    <section aria-labelledby={`${id}-titulo`} className="flex flex-col gap-3 rounded-2xl bg-panel/70 p-4 ring-1 ring-border-subtle">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 id={`${id}-titulo`} className="text-body font-semibold text-text-primary">
            {titulo}
          </h3>
          <p className="mt-0.5 text-small text-text-tertiary">{descricao}</p>
        </div>
        <span className={cn("shrink-0 text-caption tabular-nums", cheio ? "text-warning" : "text-text-tertiary")} title={`Máximo de ${max}`}>
          {itens.length}/{max}
        </span>
      </header>

      {itens.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border-default px-3 py-5 text-center text-small text-text-tertiary">
          Nada aqui ainda{podeEditar ? ": adicione abaixo." : "."}
        </p>
      ) : podeEditar ? (
        <ListaOrdenavel itens={itens.map((c) => ({ id: c }))} onReordenar={(nova) => onChange(nova.map((i) => i.id as CampoDoCartao))}>
          {(item, alca) => linha(item.id as CampoDoCartao, alca)}
        </ListaOrdenavel>
      ) : (
        <div className="flex flex-col gap-2">
          {itens.map((c) => (
            <React.Fragment key={c}>{linha(c, null)}</React.Fragment>
          ))}
        </div>
      )}

      {podeEditar && (
        <div>
          <label htmlFor={`${id}-adicionar`} className="sr-only">
            Adicionar informação: {titulo.toLowerCase()}
          </label>
          <Select
            id={`${id}-adicionar`}
            value=""
            disabled={cheio || restantes.length === 0}
            onChange={(e) => {
              const c = e.target.value as CampoDoCartao;
              if (c) onChange([...itens, c]);
            }}
            className="h-9 text-small"
          >
            <option value="">
              {cheio ? `Limite de ${max} atingido` : restantes.length === 0 ? "Todas as informações já estão aqui" : "+ Adicionar informação"}
            </option>
            {padrao.length > 0 && (
              <optgroup label="Do negócio">
                {padrao.map((c) => (
                  <option key={c} value={c}>
                    {rotuloDoCampo(c, rotulos)}
                  </option>
                ))}
              </optgroup>
            )}
            {personalizados.length > 0 && (
              <optgroup label="Campos personalizados">
                {personalizados.map((c) => (
                  <option key={c} value={c}>
                    {rotuloDoCampo(c, rotulos)}
                  </option>
                ))}
              </optgroup>
            )}
          </Select>
        </div>
      )}
    </section>
  );
}
