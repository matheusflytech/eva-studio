"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { ArrowRight, ArrowLeft, CornerDownRight } from "lucide-react";
import { MarcaAjuda } from "@/components/layout/marca-ajuda";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { focusRing } from "@/components/ui/styles";
import { PALETTE_GROUPS } from "@/components/agent-studio/builder/palette-groups";
import { ICON_REGISTRY } from "@/components/agent-studio/builder/icon-registry";
import { BLOCK_STYLES } from "@/components/agent-studio/builder/block-styles";
import { FONTES } from "@/lib/analytics-catalog";
import { SECOES, type Item } from "./conteudo";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Eva Help.
//
// Um lugar só respondendo "o que dá pra fazer aqui", incluindo o que entra e o
// que sai por API. Fica fora do menu de propósito: não é uma área de trabalho,
// é a coisa que você abre quando travou — e some de vista quando não precisa.
//
// A busca filtra tudo de uma vez, sem categoria pra escolher antes. Quem não
// sabe onde a resposta mora não deveria precisar adivinhar a gaveta.
// ---------------------------------------------------------------------------

// Verbo HTTP é dado (o que a chamada faz), por isso leva cor de status:
// ler é informação, criar é sucesso, mudar é atenção, apagar é perigo.
const CORES_DO_METODO: Record<string, string> = {
  GET: "bg-info-subtle text-info",
  POST: "bg-success-subtle text-success",
  PATCH: "bg-warning-subtle text-warning",
  PUT: "bg-warning-subtle text-warning",
  DELETE: "bg-danger-subtle text-danger",
};

function normalizar(v: string): string {
  return v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Como a pessoa chama o formato do cartão, para a busca achar por ele. */
function nomeDoTipo(tipo: string): string {
  if (tipo === "numero") return "numero indicador";
  if (tipo === "serie") return "grafico linha barras";
  if (tipo === "quebra") return "pizza barras rosca";
  return "tabela lista";
}

function textoDaFonte(f: { rotulo: string; explicacao: string; tipo: string }): string {
  return normalizar(`${f.rotulo} ${f.explicacao} ${nomeDoTipo(f.tipo)}`);
}

function textoDoItem(i: Item): string {
  return normalizar(`${i.titulo} ${i.resumo} ${i.onde ?? ""} ${i.nota ?? ""} ${i.caminho ?? ""} ${i.metodo ?? ""}`);
}

export default function AjudaPage() {
  const [busca, setBusca] = React.useState("");
  const [secaoAtiva, setSecaoAtiva] = React.useState(SECOES[0].id);
  const termo = normalizar(busca.trim());

  // Blocos e fontes vêm das listas de verdade do produto, não de uma cópia:
  // bloco novo no builder aparece aqui sozinho.
  const blocos = React.useMemo(
    () =>
      PALETTE_GROUPS.flatMap((g) =>
        g.items.map((i) => ({ ...i, grupo: g.label }))
      ),
    []
  );

  /** Quantos itens de cada seção sobrevivem à busca. Alimenta o contador ao
   *  lado de cada aba e decide para onde pular quando a aba atual fica vazia. */
  const contagem = React.useMemo(() => {
    const mapa = new Map<string, number>();
    for (const s of SECOES) {
      if (s.especial === "blocos") {
        mapa.set(s.id, blocos.filter((b) => !termo || normalizar(b.label + " " + b.hint).includes(termo)).length);
      } else if (s.especial === "fontes") {
        mapa.set(s.id, FONTES.filter((f) => !termo || textoDaFonte(f).includes(termo)).length);
      } else {
        mapa.set(s.id, s.itens.filter((i) => !termo || textoDoItem(i).includes(termo)).length);
      }
    }
    return mapa;
  }, [termo, blocos]);

  // Buscar e continuar numa aba sem resultado é um beco: a tela fica vazia e a
  // pessoa conclui que não achou nada, quando achou na aba do lado.
  React.useEffect(() => {
    if (!termo) return;
    if ((contagem.get(secaoAtiva) ?? 0) > 0) return;
    const primeira = SECOES.find((s) => (contagem.get(s.id) ?? 0) > 0);
    if (primeira) setSecaoAtiva(primeira.id);
  }, [termo, contagem, secaoAtiva]);

  const secoes = React.useMemo(() => {
    if (!termo) return SECOES;
    return SECOES.map((s) => {
      if (s.especial === "blocos") {
        const achou = blocos.some((b) => normalizar(`${b.label} ${b.hint}`).includes(termo));
        return achou ? s : { ...s, itens: [], especial: undefined, oculta: true };
      }
      if (s.especial === "fontes") {
        const achou = FONTES.some((f) => textoDaFonte(f).includes(termo));
        return achou ? s : { ...s, itens: [], especial: undefined, oculta: true };
      }
      return { ...s, itens: s.itens.filter((i) => textoDoItem(i).includes(termo)) };
    }).filter((s) => !("oculta" in s && s.oculta) && (s.especial || s.itens.length > 0));
  }, [termo, blocos]);

  // Conta o que de fato aparece. Somar a seção inteira quando ela tem UM item
  // que bate transforma o contador em propaganda: diz 24 e mostra 3.
  const totalAchado = secoes.reduce((n, s) => {
    if (s.especial === "blocos") {
      return n + blocos.filter((b) => !termo || normalizar(b.label + " " + b.hint).includes(termo)).length;
    }
    if (s.especial === "fontes") {
      return n + FONTES.filter((f) => !termo || textoDaFonte(f).includes(termo)).length;
    }
    return n + s.itens.length;
  }, 0);

  const secaoVisivel = secoes.find((x) => x.id === secaoAtiva) ?? secoes[0];
  const rotulo = termo
    ? totalAchado === 0
      ? "nada encontrado"
      : `${totalAchado} ${totalAchado === 1 ? "resultado" : "resultados"}`
    : `${totalAchado} itens`;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-6 pt-1 lg:px-6">
      {/* Barra única: a marca, o título e o número de apoio; a busca à direita. */}
      <div className="flex min-h-[58px] flex-wrap items-center gap-x-2.5 gap-y-2">
        <MarcaAjuda size={20} className="text-text-tertiary" />
        <h1 className="text-heading font-semibold tracking-tight text-text-primary">Eva Help</h1>
        <span className="mt-1 font-mono text-caption tabular-nums text-text-tertiary" aria-live="polite">
          {rotulo}
        </span>
        <SearchInput
          aria-label="Buscar na ajuda"
          placeholder="Buscar: disparo, webhook, etiqueta, pizza..."
          value={busca}
          onValueChange={setBusca}
          className="w-full sm:ml-auto sm:w-[320px]"
        />
      </div>

      {/* No celular o índice vira um seletor: sem ele só dava para andar de
          seção em seção pelos botões do rodapé. */}
      <div className="lg:hidden">
        <Select aria-label="Seção da ajuda" value={secaoVisivel?.id ?? secaoAtiva} onChange={(e) => setSecaoAtiva(e.target.value)}>
          {SECOES.map((s) => {
            const n = contagem.get(s.id) ?? 0;
            return (
              <option key={s.id} value={s.id} disabled={!!termo && n === 0}>
                {s.titulo}
                {termo && n > 0 ? ` (${n})` : ""}
              </option>
            );
          })}
        </Select>
      </div>

      <div className="flex gap-8">
        {/* Uma seção por vez. Tudo num scroll só transformava a tela num
            documento longo — dá pra rolar até achar, mas não dá pra saber onde
            você está nem quanto falta. */}
        <nav aria-label="Seções da ajuda" className="sticky top-2 hidden h-fit w-[230px] shrink-0 flex-col gap-0.5 lg:flex">
          {SECOES.map((s) => {
            const n = contagem.get(s.id) ?? 0;
            const ativa = s.id === secaoAtiva;
            const apagada = !!termo && n === 0;
            return (
              <button
                key={s.id}
                type="button"
                disabled={apagada}
                aria-current={ativa || undefined}
                onClick={() => setSecaoAtiva(s.id)}
                className={cn(
                  "flex h-8 items-center gap-2.5 rounded-full px-3 text-left text-small transition-colors duration-120",
                  ativa
                    ? "bg-raised font-medium text-text-primary ring-1 ring-border-subtle"
                    : "text-text-secondary hover:bg-hover hover:text-text-primary",
                  apagada && "opacity-35 hover:bg-transparent",
                  focusRing
                )}
              >
                <s.icone size={14} aria-hidden className={cn("shrink-0", ativa ? "text-text-primary" : "text-text-tertiary")} />
                <span className="min-w-0 flex-1 truncate">{s.titulo}</span>
                {termo && n > 0 && <span className="shrink-0 font-mono text-caption tabular-nums text-text-tertiary">{n}</span>}
              </button>
            );
          })}
        </nav>

        <div className="min-w-0 max-w-[820px] flex-1">
          {totalAchado === 0 ? (
            <EmptyState
              compact
              title={`Nada com “${busca}”`}
              description="Tente outra palavra: os termos aqui são os mesmos que aparecem nas telas."
              action={
                <Button variant="secondary" onClick={() => setBusca("")}>
                  Limpar busca
                </Button>
              }
            />
          ) : (
            (() => {
              const s = secaoVisivel;
              if (!s) return null;
              const i = SECOES.findIndex((x) => x.id === s.id);
              const anterior = SECOES[i - 1];
              const proxima = SECOES[i + 1];

              return (
                <>
                  <section aria-labelledby={`secao-${s.id}`} className="flex flex-col">
                    <div className="flex items-center gap-2.5">
                      <s.icone size={16} aria-hidden className="shrink-0 text-text-tertiary" />
                      <h2 id={`secao-${s.id}`} className="text-title-sm text-text-primary">
                        {s.titulo}
                      </h2>
                    </div>
                    <p className="mb-4 mt-1.5 max-w-3xl text-small leading-relaxed text-text-secondary">{s.intro}</p>

                    {s.especial === "blocos" ? (
                      <Blocos termo={termo} />
                    ) : s.especial === "fontes" ? (
                      <Fontes termo={termo} />
                    ) : (
                      <ul className="flex flex-col">
                        {s.itens.map((it) => (
                          <LinhaDeItem key={it.titulo} item={it} />
                        ))}
                      </ul>
                    )}
                  </section>

                  {/* Ir pra próxima sem voltar ao índice: quem está lendo tudo
                      lê em ordem, e obrigar a subir a cada seção cansa. */}
                  <div className="mt-5 flex items-center justify-between gap-3 border-t border-border-subtle pt-3">
                    {anterior ? (
                      <Button variant="ghost" size="sm" className="min-w-0" onClick={() => setSecaoAtiva(anterior.id)}>
                        <ArrowLeft size={14} aria-hidden className="shrink-0" />
                        <span className="truncate">{anterior.titulo}</span>
                      </Button>
                    ) : (
                      <span />
                    )}
                    {proxima && (
                      <Button variant="ghost" size="sm" className="min-w-0" onClick={() => setSecaoAtiva(proxima.id)}>
                        <span className="truncate">{proxima.titulo}</span>
                        <ArrowRight size={14} aria-hidden className="shrink-0" />
                      </Button>
                    )}
                  </div>
                </>
              );
            })()
          )}
        </div>
      </div>
    </div>
  );
}

function LinhaDeItem({ item }: { item: Item }) {
  const corpo = (
    <>
      <span className="flex flex-wrap items-center gap-2">
        <span className="text-body font-medium text-text-primary">{item.titulo}</span>
        {item.metodo &&
          item.metodo.split(" · ").map((m) => (
            <span key={m} className={cn("rounded-full px-1.5 font-mono text-caption font-semibold", CORES_DO_METODO[m] ?? "bg-raised text-text-tertiary")}>
              {m}
            </span>
          ))}
        {item.href && <ArrowRight size={12} aria-hidden className="text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100" />}
      </span>

      <span className="mt-0.5 block text-small leading-relaxed text-text-secondary">{item.resumo}</span>

      {item.caminho && (
        <span className="mt-1.5 block overflow-x-auto whitespace-nowrap rounded-[10px] bg-raised px-2.5 py-1.5 font-mono text-caption text-text-tertiary">
          {item.caminho}
        </span>
      )}

      {item.onde && !item.caminho && <span className="mt-1 block text-caption text-text-tertiary">Fica em: {item.onde}</span>}

      {item.nota && (
        <span className="mt-1.5 flex gap-1.5 text-caption leading-relaxed text-text-tertiary">
          <CornerDownRight size={11} aria-hidden className="mt-0.5 shrink-0" />
          <span>{item.nota}</span>
        </span>
      )}
    </>
  );

  const classe = "group block rounded-xl px-2 py-3 text-left";

  return (
    <li className="border-b border-border-subtle last:border-b-0">
      {item.href ? (
        <Link href={item.href} className={cn(classe, "transition-colors duration-120 hover:bg-raised", focusRing)}>
          {corpo}
        </Link>
      ) : (
        <div className={classe}>{corpo}</div>
      )}
    </li>
  );
}

/** Os blocos do builder, lidos da própria paleta. */
function Blocos({ termo }: { termo: string }) {
  return (
    <div className="flex flex-col gap-5">
      {PALETTE_GROUPS.map((grupo) => {
        const itens = termo ? grupo.items.filter((i) => normalizar(`${i.label} ${i.hint}`).includes(termo)) : grupo.items;
        if (itens.length === 0) return null;

        return (
          <div key={grupo.id}>
            <p className="mb-1 px-2 font-mono text-caption uppercase tracking-wider text-text-tertiary">{grupo.label}</p>
            <ul className="grid sm:grid-cols-2 sm:gap-x-4">
              {itens.map((item) => {
                const Icone = ICON_REGISTRY[item.key];
                const estilo = BLOCK_STYLES[item.key];
                return (
                  <li
                    key={item.key}
                    className={cn(
                      "flex items-start gap-2.5 border-b border-border-subtle px-2 py-2.5",
                      // Ferramenta de um agente: recuada, presa ao bloco de cima.
                      item.tool && "ml-3 border-l-2 border-l-border-default"
                    )}
                  >
                    {/* A cor do ícone é a do bloco no builder (dado), não enfeite. */}
                    <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-[10px]", estilo?.badgeBg, estilo?.badgeText)}>
                      <Icone size={13} aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-small text-text-primary">{item.label}</span>
                      <span className="block text-caption leading-relaxed text-text-tertiary">{item.hint}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

/** As fontes do Dashboard, lidas do catálogo que a própria tela usa. */
function Fontes({ termo }: { termo: string }) {
  const grupos = [...new Set(FONTES.map((f) => f.grupo))];

  return (
    <div className="flex flex-col gap-5">
      {grupos.map((g) => {
        const itens = FONTES.filter((f) => f.grupo === g && (!termo || textoDaFonte(f).includes(termo)));
        if (itens.length === 0) return null;

        return (
          <div key={g}>
            <p className="mb-1 px-2 font-mono text-caption uppercase tracking-wider text-text-tertiary">{g}</p>
            <ul className="grid sm:grid-cols-2 sm:gap-x-4">
              {itens.map((f) => (
                <li key={f.chave} className="border-b border-border-subtle px-2 py-2.5">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-small text-text-primary">{f.rotulo}</span>
                    <span className="shrink-0 rounded-full bg-raised px-1.5 font-mono text-caption text-text-tertiary">
                      {f.tipo === "numero" ? "número" : f.tipo === "serie" ? "gráfico" : f.tipo === "quebra" ? "pizza/barras" : "tabela"}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-caption leading-relaxed text-text-tertiary">{f.explicacao}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
