"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { ArrowDown, ArrowUp, Loader2, Plus, Search, Trash2, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  moeda,
  rotuloDaRecorrencia,
  textoDaQuantidade,
  type ItemDoNegocio,
  type ProdutoDoCatalogo,
  type ResumoDosItens,
} from "@/lib/produtos";
import { BotaoDeIcone } from "./pecas";
import { mensagemDeErro } from "./use-ficha";

// Produtos (itens) do negócio na ficha: blocos com edição no lugar, busca no
// catálogo, item avulso, total, MRR/ARR e a chave "usar valor manual".
// As contas são do servidor: a tela manda o que mudou e mostra o que voltou.

export interface DadosDosItens {
  itens: ItemDoNegocio[];
  valorManual: boolean;
  resumo: ResumoDosItens;
  disponivel: boolean;
}

/**
 * Itens do negócio. `aoMudar` recarrega a ficha (o valor do negócio muda
 * junto com os itens).
 */
export function useItensDoNegocio(dealId: string, aoMudar: () => void | Promise<void>) {
  const [dados, setDados] = React.useState<DadosDosItens | null>(null);

  React.useEffect(() => {
    let vivo = true;
    fetch(`/api/deals/${dealId}/items`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => vivo && d && setDados(d))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [dealId]);

  /** Chama a API dos itens. Devolve a mensagem de erro, ou null se deu certo. */
  const enviar = React.useCallback(
    async (caminho: string, metodo: string, corpo?: unknown): Promise<string | null> => {
      try {
        const res = await fetch(`/api/deals/${dealId}/items${caminho}`, {
          method: metodo,
          headers: corpo ? { "Content-Type": "application/json" } : undefined,
          body: corpo ? JSON.stringify(corpo) : undefined,
        });
        if (!res.ok) return await mensagemDeErro(res, "Não foi possível salvar.");
        setDados(await res.json());
        await aoMudar();
        return null;
      } catch {
        return "Sem conexão. Tente de novo.";
      }
    },
    [dealId, aoMudar]
  );

  return { dados, enviar };
}

export type ItensDoNegocio = ReturnType<typeof useItensDoNegocio>;

const reais = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "R$" pequeno e apagado na frente do número grande (v5). */
function ValorEmBloco({ cents, className }: { cents: number; className?: string }) {
  return (
    <span className={cn("font-medium tabular-nums tracking-tight text-text-primary", className)}>
      <span className="mr-0.5 text-caption font-normal text-text-tertiary">R$</span>
      {reais(cents)}
    </span>
  );
}

/**
 * Produtos em blocos (cartão lateral da ficha, v5): um bloco por item com o
 * total, e o "+" para adicionar do catálogo ou avulso. Clicar num bloco abre
 * a edição dele embaixo (quantidade, preço, desconto, ordem, remover). No fim,
 * a chave "usar valor manual" e o total com MRR/ARR.
 */
export function ProdutosDoNegocio({ estado }: { estado: ItensDoNegocio }) {
  const { dados, enviar } = estado;
  const [adicionando, setAdicionando] = React.useState(false);
  const [aberto, setAberto] = React.useState<string | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);

  // Produtos não ativados no banco (ou ainda carregando): a seção não aparece.
  if (!dados || !dados.disponivel) return null;
  const { itens, resumo, valorManual } = dados;
  const indiceAberto = itens.findIndex((x) => x.id === aberto);
  const itemAberto = indiceAberto >= 0 ? itens[indiceAberto] : null;

  async function rodar(caminho: string, metodo: string, corpo?: unknown) {
    setErro(null);
    const falha = await enviar(caminho, metodo, corpo);
    if (falha) setErro(falha);
    return falha;
  }

  function mover(i: number, delta: number) {
    const ordem = itens.map((x) => x.id);
    const [id] = ordem.splice(i, 1);
    ordem.splice(i + delta, 0, id);
    return rodar("", "PATCH", { ordem });
  }

  return (
    <section aria-label="Produtos" className="flex flex-col gap-2">
      <p className="font-mono text-caption text-text-tertiary">
        Produtos{itens.length > 0 && <span className="ml-1.5 text-text-secondary">{itens.length}</span>}
      </p>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-2">
        {itens.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-expanded={aberto === item.id}
            onClick={() => {
              setAdicionando(false);
              setAberto((v) => (v === item.id ? null : item.id));
            }}
            className={cn(
              "flex min-w-0 flex-col gap-3 rounded-[14px] bg-raised px-3 py-2.5 text-left outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-focus",
              aberto === item.id && "ring-1 ring-inset ring-border-strong"
            )}
          >
            <span className="truncate text-caption text-text-secondary" title={item.name}>
              {item.name}
              {textoDaQuantidade(item.quantity) !== "1" && <span className="text-text-tertiary"> × {textoDaQuantidade(item.quantity)}</span>}
            </span>
            <ValorEmBloco cents={item.totalCents} className="text-body-lg" />
          </button>
        ))}
        <button
          type="button"
          aria-label="Adicionar produto"
          title="Adicionar produto"
          aria-expanded={adicionando}
          onClick={() => {
            setAberto(null);
            setAdicionando((v) => !v);
          }}
          className={cn(
            "grid min-h-16 place-items-center rounded-[14px] border border-dashed border-border-default text-text-secondary outline-none transition-colors hover:bg-hover hover:text-text-primary focus-visible:ring-2 focus-visible:ring-focus",
            adicionando && "bg-hover text-text-primary"
          )}
        >
          <Plus size={16} aria-hidden />
        </button>
      </div>

      {itens.length === 0 && !adicionando && (
        <p className="text-caption text-text-tertiary">
          Nenhum produto. Adicione do catálogo ou um item avulso: o valor do negócio passa a ser a soma.{" "}
          <Link href="/deals/configure?tab=products" className="text-accent-fg hover:underline">
            Montar o catálogo
          </Link>
        </p>
      )}

      {adicionando && (
        <Adicionar
          aoAdicionar={async (corpo) => {
            const falha = await rodar("", "POST", corpo);
            if (!falha) setAdicionando(false);
            return falha;
          }}
          aoFechar={() => setAdicionando(false)}
        />
      )}

      {erro && (
        <p role="alert" className="rounded-[10px] bg-danger-subtle px-3 py-2 text-small text-danger">
          {erro}
        </p>
      )}

      {itemAberto && (
        <EditorDoItem
          key={`${itemAberto.id}:${itemAberto.quantity}:${itemAberto.unitPriceCents}:${itemAberto.discountType}:${itemAberto.discountValue}`}
          item={itemAberto}
          primeiro={indiceAberto === 0}
          ultimo={indiceAberto === itens.length - 1}
          onSalvar={(corpo) => rodar(`/${itemAberto.id}`, "PATCH", corpo)}
          onRemover={async () => {
            const falha = await rodar(`/${itemAberto.id}`, "DELETE");
            if (!falha) setAberto(null);
            return falha;
          }}
          onSubir={() => mover(indiceAberto, -1)}
          onDescer={() => mover(indiceAberto, 1)}
          onFechar={() => setAberto(null)}
        />
      )}

      {itens.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border-subtle pt-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-caption text-text-tertiary">Total dos produtos</span>
            <ValorEmBloco cents={resumo.totalCents} className="text-body" />
          </div>
          {resumo.temRecorrencia && (
            <p className="text-right font-mono text-caption tabular-nums text-text-secondary" title="MRR: receita recorrente por mês (anual conta 1/12). ARR: MRR × 12.">
              MRR {moeda(resumo.mrrCents)} · ARR {moeda(resumo.arrCents)}
            </p>
          )}
          <label className="flex cursor-pointer items-start gap-2.5 text-caption text-text-secondary">
            <Switch checked={valorManual} onCheckedChange={(v) => rodar("", "PATCH", { valorManual: v })} aria-label="Usar valor manual" className="mt-0.5" />
            <span>
              Usar valor manual
              <span className="block text-text-tertiary">
                {valorManual ? "O valor do negócio é o digitado em Sobre o negócio, não a soma." : "Desligado: o valor do negócio é a soma dos produtos."}
              </span>
            </span>
          </label>
        </div>
      )}
    </section>
  );
}

const classeDaCelula =
  "h-8 w-full rounded-[10px] border border-transparent bg-raised px-2 text-small tabular-nums text-text-primary outline-none transition-colors " +
  "hover:border-border-subtle focus:border-accent-solid focus:ring-2 focus:ring-accent-solid/20";

/** Campo de texto do item: salva ao sair (ou Enter), só se mudou; Esc desfaz. */
function Celula({
  valor,
  rotulo,
  onSalvar,
  className,
}: {
  valor: string;
  rotulo: string;
  onSalvar: (v: string) => Promise<string | null>;
  className?: string;
}) {
  const [texto, setTexto] = React.useState(valor);
  async function sair() {
    if (texto.trim() === valor) return;
    const falha = await onSalvar(texto.trim());
    if (falha) setTexto(valor);
  }
  return (
    <input
      aria-label={rotulo}
      inputMode="decimal"
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={sair}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setTexto(valor);
          e.currentTarget.blur();
        }
      }}
      className={cn(classeDaCelula, className)}
    />
  );
}

/** Edição do item aberto: quantidade, preço, desconto, total, ordem e remover. */
function EditorDoItem({
  item,
  primeiro,
  ultimo,
  onSalvar,
  onRemover,
  onSubir,
  onDescer,
  onFechar,
}: {
  item: ItemDoNegocio;
  primeiro: boolean;
  ultimo: boolean;
  onSalvar: (corpo: Record<string, unknown>) => Promise<string | null>;
  onRemover: () => Promise<string | null>;
  onSubir: () => void;
  onDescer: () => void;
  onFechar: () => void;
}) {
  const desconto = item.discountValue
    ? item.discountType === "percentual"
      ? (item.discountValue / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })
      : reais(item.discountValue)
    : "";
  const detalhes = [item.sku, item.recurrence !== "unico" ? rotuloDaRecorrencia(item.recurrence) : "", !item.productId ? "Avulso" : ""]
    .filter(Boolean)
    .join(" · ");
  const rotulo = "mb-1 block font-mono text-caption text-text-tertiary";

  return (
    <div className="flex flex-col gap-3 rounded-[14px] border border-border-subtle p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-small font-medium text-text-primary" title={item.name}>
            {item.name}
          </p>
          {detalhes && <p className="truncate text-caption text-text-tertiary">{detalhes}</p>}
        </div>
        <BotaoDeIcone rotulo={`Subir ${item.name}`} onClick={onSubir} disabled={primeiro}>
          <ArrowUp size={13} aria-hidden />
        </BotaoDeIcone>
        <BotaoDeIcone rotulo={`Descer ${item.name}`} onClick={onDescer} disabled={ultimo}>
          <ArrowDown size={13} aria-hidden />
        </BotaoDeIcone>
        <BotaoDeIcone rotulo={`Remover ${item.name}`} onClick={onRemover} className="hover:bg-danger-subtle hover:text-danger">
          <Trash2 size={13} aria-hidden />
        </BotaoDeIcone>
        <BotaoDeIcone rotulo="Fechar edição do produto" onClick={onFechar}>
          <X size={14} aria-hidden />
        </BotaoDeIcone>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <span className={rotulo}>Qtd.</span>
          <Celula valor={textoDaQuantidade(item.quantity)} rotulo={`Quantidade de ${item.name}`} onSalvar={(v) => onSalvar({ quantity: v })} />
        </div>
        <div>
          <span className={rotulo}>Preço (R$)</span>
          <Celula valor={reais(item.unitPriceCents)} rotulo={`Preço unitário de ${item.name}`} onSalvar={(v) => onSalvar({ unitPrice: v || "0" })} />
        </div>
        <div>
          <span className={rotulo}>Desconto</span>
          <div className="flex items-center gap-1">
            <Celula valor={desconto} rotulo={`Desconto de ${item.name}`} onSalvar={(v) => onSalvar({ discount: v })} className="min-w-0" />
            <select
              aria-label={`Tipo de desconto de ${item.name}`}
              value={item.discountType}
              onChange={(e) => onSalvar({ discountType: e.target.value })}
              className="h-8 shrink-0 rounded-[10px] border border-transparent bg-raised px-1 text-caption text-text-secondary outline-none hover:border-border-subtle focus:ring-2 focus:ring-accent-solid/20"
            >
              <option value="percentual">%</option>
              <option value="valor">R$</option>
            </select>
          </div>
        </div>
        <div className="text-right">
          <span className={rotulo}>Total</span>
          <span className="inline-flex h-8 items-center text-small font-medium tabular-nums text-text-primary">{moeda(item.totalCents)}</span>
        </div>
      </div>
    </div>
  );
}

/** Painel de adicionar: busca no catálogo ou item avulso. */
function Adicionar({
  aoAdicionar,
  aoFechar,
}: {
  aoAdicionar: (corpo: Record<string, unknown>) => Promise<string | null>;
  aoFechar: () => void;
}) {
  const [busca, setBusca] = React.useState("");
  const [resultados, setResultados] = React.useState<ProdutoDoCatalogo[] | null>(null);
  const [avulso, setAvulso] = React.useState(false);
  const [nome, setNome] = React.useState("");
  const [preco, setPreco] = React.useState("");
  const [enviando, setEnviando] = React.useState<string | null>(null);

  React.useEffect(() => {
    let vivo = true;
    const t = setTimeout(() => {
      const q = new URLSearchParams({ limite: "8" });
      if (busca.trim()) q.set("busca", busca.trim());
      fetch(`/api/products?${q}`)
        .then((r) => (r.ok ? r.json() : { produtos: [] }))
        .then((d) => vivo && setResultados(d.produtos ?? []))
        .catch(() => vivo && setResultados([]));
    }, 200);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [busca]);

  async function escolher(corpo: Record<string, unknown>, chave: string) {
    setEnviando(chave);
    await aoAdicionar(corpo);
    setEnviando(null);
  }

  return (
    <div className="rounded-[14px] border border-border-subtle bg-raised p-3">
      {!avulso ? (
        <>
          <div className="relative">
            <Search size={14} aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <input
              autoFocus
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && aoFechar()}
              placeholder="Buscar no catálogo por nome ou código"
              aria-label="Buscar produto no catálogo"
              className="h-9 w-full rounded-lg border border-border-default bg-panel pl-8 pr-2 text-small text-text-primary outline-none placeholder:text-text-tertiary focus:border-accent-solid focus:ring-2 focus:ring-accent-solid/20"
            />
          </div>
          <ul className="mt-2 flex max-h-[240px] flex-col gap-0.5 overflow-y-auto" aria-label="Produtos encontrados">
            {resultados === null ? (
              <li className="px-2 py-1.5 text-small text-text-tertiary">Buscando...</li>
            ) : resultados.length === 0 ? (
              <li className="px-2 py-1.5 text-small text-text-tertiary">
                {busca ? "Nada encontrado no catálogo." : "O catálogo está vazio."}
              </li>
            ) : (
              resultados.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={!!enviando}
                    onClick={() => escolher({ productId: p.id }, p.id)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left text-small outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-50"
                  >
                    <span className="min-w-0 truncate text-text-primary">
                      {p.name}
                      {p.sku && <span className="ml-1.5 text-caption text-text-tertiary">{p.sku}</span>}
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5 tabular-nums text-text-secondary">
                      {enviando === p.id && <Loader2 size={13} className="animate-spin" aria-hidden />}
                      {moeda(p.priceCents)}
                      {p.recurrence !== "unico" && <span className="text-caption text-text-tertiary">{rotuloDaRecorrencia(p.recurrence).toLowerCase()}</span>}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
          <div className="mt-2 flex items-center justify-between border-t border-border-subtle pt-2 text-caption">
            <button type="button" onClick={() => setAvulso(true)} className="rounded px-1 text-accent-fg outline-none hover:underline focus-visible:ring-2 focus-visible:ring-focus">
              + Item avulso (fora do catálogo)
            </button>
            <button type="button" onClick={aoFechar} className="rounded px-1 text-text-tertiary outline-none hover:text-text-primary focus-visible:ring-2 focus-visible:ring-focus">
              Fechar
            </button>
          </div>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!nome.trim()) return;
            escolher({ name: nome, unitPrice: preco || "0" }, "avulso");
          }}
          className="flex flex-wrap items-end gap-2"
        >
          <label className="min-w-40 flex-1 text-caption text-text-tertiary">
            Nome do item
            <input
              autoFocus
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              maxLength={200}
              placeholder="Ex.: Frete, Taxa de instalação"
              className="mt-0.5 h-9 w-full rounded-lg border border-border-default bg-panel px-2 text-small text-text-primary outline-none focus:border-accent-solid focus:ring-2 focus:ring-accent-solid/20"
            />
          </label>
          <label className="w-[120px] text-caption text-text-tertiary">
            Preço (R$)
            <input
              value={preco}
              onChange={(e) => setPreco(e.target.value)}
              inputMode="decimal"
              placeholder="0,00"
              className="mt-0.5 h-9 w-full rounded-lg border border-border-default bg-panel px-2 text-small tabular-nums text-text-primary outline-none focus:border-accent-solid focus:ring-2 focus:ring-accent-solid/20"
            />
          </label>
          <button
            type="submit"
            disabled={!nome.trim() || !!enviando}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent-solid px-3.5 text-small font-medium text-text-on-accent outline-none hover:bg-accent-solid-hover focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-40"
          >
            {enviando && <Loader2 size={13} className="animate-spin" aria-hidden />} Adicionar
          </button>
          <button type="button" onClick={() => setAvulso(false)} className="h-9 rounded-full px-2 text-small text-text-tertiary outline-none hover:text-text-primary focus-visible:ring-2 focus-visible:ring-focus">
            Voltar ao catálogo
          </button>
        </form>
      )}
    </div>
  );
}
