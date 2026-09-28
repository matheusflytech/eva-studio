"use client";

import * as React from "react";
import Link from "next/link";
import { Search, X, ArrowRight, ArrowLeft, CornerDownRight } from "lucide-react";
import { SeloAjuda } from "@/components/layout/marca-ajuda";
import { Input } from "@/components/ui/input";
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

const CORES_DO_METODO: Record<string, string> = {
  GET: "bg-blue-500/15 text-blue-400",
  POST: "bg-emerald-500/15 text-emerald-400",
  PATCH: "bg-amber-500/15 text-amber-400",
  PUT: "bg-amber-500/15 text-amber-400",
  DELETE: "bg-danger/15 text-danger",
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

  return (
    <div className="flex-1 p-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <SeloAjuda />
          <div>
            <h1 className="font-display text-2xl font-semibold text-text-primary">Eva Help</h1>
            <p className="mt-1 max-w-2xl text-[14px] text-text-secondary">
              Tudo que dá para fazer no Eva Studio, onde fica cada coisa, e o que entra e sai por API.
            </p>
          </div>
        </div>
        <div className="relative min-w-[260px] flex-1 sm:max-w-sm">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <Input
            placeholder="Buscar: disparo, webhook, etiqueta, pizza..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-9 pr-9"
          />
          {busca && (
            <button
              type="button"
              onClick={() => setBusca("")}
              aria-label="Limpar busca"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </header>

      {termo && (
        <p className="mb-4 text-[12.5px] text-text-tertiary">
          {totalAchado === 0
            ? `Nada com “${busca}”.`
            : `${totalAchado} resultado(s) para “${busca}”.`}
        </p>
      )}

      <div className="flex gap-6">
        {/* Uma seção por vez. Tudo num scroll só transformava a tela num
            documento longo — dá pra rolar até achar, mas não dá pra saber onde
            você está nem quanto falta. */}
        <nav className="sticky top-8 hidden h-fit w-[230px] shrink-0 flex-col gap-0.5 lg:flex">
          {SECOES.map((s) => {
            const n = contagem.get(s.id) ?? 0;
            const ativa = s.id === secaoAtiva;
            const apagada = !!termo && n === 0;
            return (
              <button
                key={s.id}
                type="button"
                disabled={apagada}
                onClick={() => setSecaoAtiva(s.id)}
                className={cn(
                  "flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[12.5px] transition-colors",
                  ativa
                    ? "bg-surface-2 font-medium text-text-primary"
                    : "text-text-secondary hover:bg-surface-2 hover:text-text-primary",
                  apagada && "opacity-35 hover:bg-transparent"
                )}
              >
                <s.icone
                  size={14}
                  className={cn("shrink-0", ativa ? "text-accent-400" : "text-text-tertiary")}
                />
                <span className="min-w-0 flex-1 truncate">{s.titulo}</span>
                {termo && n > 0 && (
                  <span className="shrink-0 rounded-md bg-surface-3 px-1.5 text-[10.5px] tabular-nums text-text-tertiary">
                    {n}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="min-w-0 flex-1">
          {totalAchado === 0 ? (
            <p className="glass-card rounded-3xl px-6 py-14 text-center text-[13.5px] text-text-secondary">
              Nada com “{busca}”. Tente outra palavra — os termos aqui são os mesmos que aparecem nas telas.
            </p>
          ) : (
            (() => {
              const s = secoes.find((x) => x.id === secaoAtiva) ?? secoes[0];
              if (!s) return null;
              const i = SECOES.findIndex((x) => x.id === s.id);
              const anterior = SECOES[i - 1];
              const proxima = SECOES[i + 1];

              return (
                <>
                  <section className="glass-card rounded-3xl p-6">
                    <div className="mb-1 flex items-center gap-2.5">
                      <s.icone size={17} className="text-accent-400" />
                      <h2 className="font-display text-[17px] font-semibold text-text-primary">{s.titulo}</h2>
                    </div>
                    <p className="mb-5 max-w-3xl text-[13px] leading-relaxed text-text-secondary">{s.intro}</p>

                    {s.especial === "blocos" ? (
                      <Blocos termo={termo} />
                    ) : s.especial === "fontes" ? (
                      <Fontes termo={termo} />
                    ) : (
                      <div className="flex flex-col gap-1">
                        {s.itens.map((it) => (
                          <LinhaDeItem key={it.titulo} item={it} />
                        ))}
                      </div>
                    )}
                  </section>

                  {/* Ir pra próxima sem voltar ao índice: quem está lendo tudo
                      lê em ordem, e obrigar a subir a cada seção cansa. */}
                  <div className="mt-4 flex items-center justify-between gap-3">
                    {anterior ? (
                      <button
                        type="button"
                        onClick={() => setSecaoAtiva(anterior.id)}
                        className="group inline-flex min-w-0 items-center gap-2 rounded-xl px-3 py-2 text-left text-[12.5px] text-text-tertiary transition-colors hover:bg-surface-2 hover:text-text-primary"
                      >
                        <ArrowLeft size={14} className="shrink-0" />
                        <span className="truncate">{anterior.titulo}</span>
                      </button>
                    ) : (
                      <span />
                    )}
                    {proxima && (
                      <button
                        type="button"
                        onClick={() => setSecaoAtiva(proxima.id)}
                        className="group inline-flex min-w-0 items-center gap-2 rounded-xl px-3 py-2 text-right text-[12.5px] text-text-tertiary transition-colors hover:bg-surface-2 hover:text-text-primary"
                      >
                        <span className="truncate">{proxima.titulo}</span>
                        <ArrowRight size={14} className="shrink-0" />
                      </button>
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
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13.5px] font-medium text-text-primary">{item.titulo}</span>
        {item.metodo &&
          item.metodo.split(" · ").map((m) => (
            <span
              key={m}
              className={cn(
                "rounded-md px-1.5 py-0.5 font-mono text-[10.5px] font-semibold",
                CORES_DO_METODO[m] ?? "bg-surface-3 text-text-tertiary"
              )}
            >
              {m}
            </span>
          ))}
        {item.href && (
          <ArrowRight size={12} className="text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100" />
        )}
      </div>

      <p className="mt-0.5 text-[12.5px] leading-relaxed text-text-secondary">{item.resumo}</p>

      {item.caminho && (
        <p className="mt-1.5 overflow-x-auto whitespace-nowrap rounded-lg bg-surface-3 px-2.5 py-1.5 font-mono text-[11.5px] text-text-tertiary">
          {item.caminho}
        </p>
      )}

      {item.onde && !item.caminho && (
        <p className="mt-1 text-[11.5px] text-text-tertiary">Fica em: {item.onde}</p>
      )}

      {item.nota && (
        <p className="mt-1.5 flex gap-1.5 text-[11.5px] leading-relaxed text-text-tertiary">
          <CornerDownRight size={11} className="mt-0.5 shrink-0" />
          <span>{item.nota}</span>
        </p>
      )}
    </>
  );

  const classe = "group block rounded-2xl px-3.5 py-3 text-left transition-colors hover:bg-surface-2";

  return item.href ? (
    <Link href={item.href} className={classe}>{corpo}</Link>
  ) : (
    <div className={cn(classe, "hover:bg-transparent")}>{corpo}</div>
  );
}

/** Os blocos do builder, lidos da própria paleta. */
function Blocos({ termo }: { termo: string }) {
  return (
    <div className="flex flex-col gap-5">
      {PALETTE_GROUPS.map((grupo) => {
        const itens = termo
          ? grupo.items.filter((i) =>
              normalizar(`${i.label} ${i.hint}`).includes(termo)
            )
          : grupo.items;
        if (itens.length === 0) return null;

        return (
          <div key={grupo.id}>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
              {grupo.label}
            </p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {itens.map((item) => {
                const Icone = ICON_REGISTRY[item.key];
                const estilo = BLOCK_STYLES[item.key];
                return (
                  <div
                    key={item.key}
                    className={cn(
                      "flex items-start gap-2.5 rounded-2xl bg-surface-2 px-3.5 py-2.5",
                      item.tool && "ml-3 border-l-2 border-purple-400/40"
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                        estilo?.badgeBg,
                        estilo?.badgeText
                      )}
                    >
                      <Icone size={13} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] text-text-primary">{item.label}</span>
                      <span className="block text-[11.5px] leading-relaxed text-text-tertiary">
                        {item.hint}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
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
        const itens = FONTES.filter(
          (f) => f.grupo === g && (!termo || textoDaFonte(f).includes(termo))
        );
        if (itens.length === 0) return null;

        return (
          <div key={g}>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">{g}</p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {itens.map((f) => (
                <div key={f.chave} className="rounded-2xl bg-surface-2 px-3.5 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[13px] text-text-primary">{f.rotulo}</span>
                    <span className="shrink-0 rounded-md bg-surface-3 px-1.5 py-0.5 text-[10px] text-text-tertiary">
                      {f.tipo === "numero" ? "número" : f.tipo === "serie" ? "gráfico" : f.tipo === "quebra" ? "pizza/barras" : "tabela"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11.5px] leading-relaxed text-text-tertiary">{f.explicacao}</p>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
