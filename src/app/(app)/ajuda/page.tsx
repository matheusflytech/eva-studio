"use client";

import * as React from "react";
import Link from "next/link";
import { Search, X, ArrowRight, CornerDownRight, LifeBuoy } from "lucide-react";
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

function textoDoItem(i: Item): string {
  return normalizar(`${i.titulo} ${i.resumo} ${i.onde ?? ""} ${i.nota ?? ""} ${i.caminho ?? ""} ${i.metodo ?? ""}`);
}

export default function AjudaPage() {
  const [busca, setBusca] = React.useState("");
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

  const secoes = React.useMemo(() => {
    if (!termo) return SECOES;
    return SECOES.map((s) => {
      if (s.especial === "blocos") {
        const achou = blocos.some((b) => normalizar(`${b.label} ${b.hint}`).includes(termo));
        return achou ? s : { ...s, itens: [], especial: undefined, oculta: true };
      }
      if (s.especial === "fontes") {
        const achou = FONTES.some((f) => normalizar(`${f.rotulo} ${f.explicacao}`).includes(termo));
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
      return n + FONTES.filter((f) => !termo || normalizar(f.rotulo + " " + f.explicacao).includes(termo)).length;
    }
    return n + s.itens.length;
  }, 0);

  return (
    <div className="flex-1 p-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent-400">
            <LifeBuoy size={22} />
          </span>
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

      <div className="flex gap-8">
        {/* Índice fixo. Some na busca: filtrando, a lista já é curta e o índice
            passaria a apontar pra seção que não está mais na tela. */}
        {!termo && (
          <nav className="sticky top-8 hidden h-fit w-[210px] shrink-0 flex-col gap-0.5 xl:flex">
            {SECOES.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-[12.5px] text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary"
              >
                <s.icone size={14} className="shrink-0 text-text-tertiary" />
                <span className="truncate">{s.titulo}</span>
              </a>
            ))}
          </nav>
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-5">
          {secoes.length === 0 ? (
            <p className="glass-card rounded-3xl px-6 py-14 text-center text-[13.5px] text-text-secondary">
              Nada com “{busca}”. Tente outra palavra — os termos aqui são os mesmos que aparecem nas telas.
            </p>
          ) : (
            secoes.map((s) => (
              <section key={s.id} id={s.id} className="glass-card scroll-mt-8 rounded-3xl p-6">
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
                    {s.itens.map((i) => (
                      <LinhaDeItem key={i.titulo} item={i} />
                    ))}
                  </div>
                )}
              </section>
            ))
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
          (f) => f.grupo === g && (!termo || normalizar(`${f.rotulo} ${f.explicacao}`).includes(termo))
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
