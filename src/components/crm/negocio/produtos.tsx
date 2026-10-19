"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { ArrowDown, ArrowUp, Loader2, Package, Plus, Search, X } from "lucide-react";
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
import { BotaoDeIcone, BotaoDeSecao, Secao } from "./pecas";
import { mensagemDeErro } from "./use-ficha";

// Produtos (itens) do negócio na ficha: tabela editável no lugar, busca no
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

export function ProdutosDoNegocio({ estado }: { estado: ItensDoNegocio }) {
  const { dados, enviar } = estado;
  const [adicionando, setAdicionando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  // Produtos não ativados no banco (ou ainda carregando): a seção não aparece.
  if (!dados || !dados.disponivel) return null;
  const { itens, resumo, valorManual } = dados;

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
    <Secao
      titulo="Produtos"
      contagem={itens.length}
      acao={
        <BotaoDeSecao onClick={() => setAdicionando((v) => !v)} aria-expanded={adicionando}>
          <Plus size={13} aria-hidden /> Adicionar
        </BotaoDeSecao>
      }
    >
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
        <p role="alert" className="mb-2 rounded-lg bg-danger/10 px-3 py-2 text-[12.5px] text-danger">
          {erro}
        </p>
      )}

      {itens.length === 0 ? (
        !adicionando && (
          <div className="flex flex-col items-start gap-1 rounded-xl border border-dashed border-border-subtle px-3 py-4 text-[13px] text-text-secondary">
            <span className="flex items-center gap-2">
              <Package size={15} aria-hidden className="text-text-tertiary" /> Nenhum produto neste negócio.
            </span>
            <span className="text-[12px] text-text-tertiary">
              Adicione do catálogo ou um item avulso: o valor do negócio passa a ser a soma.{" "}
              <Link href="/negocios/configurar?aba=produtos" className="text-accent-400 hover:underline">
                Montar o catálogo
              </Link>
            </span>
          </div>
        )
      ) : (
        <>
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[560px] border-separate border-spacing-0 text-[13px]">
              <thead>
                <tr className="text-left text-[11.5px] text-text-tertiary">
                  <th scope="col" className="px-1 pb-1.5 font-normal">Produto</th>
                  <th scope="col" className="w-[76px] px-1 pb-1.5 font-normal">Qtd.</th>
                  <th scope="col" className="w-[108px] px-1 pb-1.5 font-normal">Preço (R$)</th>
                  <th scope="col" className="w-[124px] px-1 pb-1.5 font-normal">Desconto</th>
                  <th scope="col" className="w-[104px] px-1 pb-1.5 text-right font-normal">Total</th>
                  <th scope="col" className="w-[84px] px-1 pb-1.5"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {itens.map((item, i) => (
                  <LinhaDoItem
                    key={`${item.id}:${item.quantity}:${item.unitPriceCents}:${item.discountType}:${item.discountValue}`}
                    item={item}
                    primeiro={i === 0}
                    ultimo={i === itens.length - 1}
                    onSalvar={(corpo) => rodar(`/${item.id}`, "PATCH", corpo)}
                    onRemover={() => rodar(`/${item.id}`, "DELETE")}
                    onSubir={() => mover(i, -1)}
                    onDescer={() => mover(i, 1)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap items-end justify-between gap-3 border-t border-border-subtle pt-3">
            <label className="flex max-w-[320px] cursor-pointer items-start gap-2.5 text-[12.5px] text-text-secondary">
              <Switch
                checked={valorManual}
                onCheckedChange={(v) => rodar("", "PATCH", { valorManual: v })}
                aria-label="Usar valor manual"
                className="mt-0.5"
              />
              <span>
                Usar valor manual
                <span className="block text-[11.5px] text-text-tertiary">
                  {valorManual
                    ? "O valor do negócio é o digitado em Sobre o negócio, não a soma."
                    : "Desligado: o valor do negócio é a soma dos produtos."}
                </span>
              </span>
            </label>
            <div className="text-right">
              <div className="text-[11.5px] text-text-tertiary">Total dos produtos</div>
              <div className="font-display text-[18px] font-semibold tabular-nums text-text-primary">{moeda(resumo.totalCents)}</div>
              {resumo.temRecorrencia && (
                <div className="mt-0.5 text-[12px] tabular-nums text-text-secondary" title="MRR: receita recorrente por mês (anual conta 1/12). ARR: MRR × 12.">
                  MRR {moeda(resumo.mrrCents)} · ARR {moeda(resumo.arrCents)}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </Secao>
  );
}

const classeDaCelula =
  "h-8 w-full rounded-md border border-transparent bg-transparent px-1.5 text-[13px] tabular-nums text-text-primary outline-none transition-colors " +
  "hover:border-border-subtle hover:bg-surface-2 focus:border-accent-500/60 focus:bg-surface-2 focus:ring-2 focus:ring-accent-500/20";

/** Campo de texto da tabela: salva ao sair (ou Enter), só se mudou; Esc desfaz. */
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

function LinhaDoItem({
  item,
  primeiro,
  ultimo,
  onSalvar,
  onRemover,
  onSubir,
  onDescer,
}: {
  item: ItemDoNegocio;
  primeiro: boolean;
  ultimo: boolean;
  onSalvar: (corpo: Record<string, unknown>) => Promise<string | null>;
  onRemover: () => Promise<string | null>;
  onSubir: () => void;
  onDescer: () => void;
}) {
  const desconto = item.discountValue
    ? item.discountType === "percentual"
      ? (item.discountValue / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })
      : reais(item.discountValue)
    : "";
  const detalhes = [item.sku, item.recurrence !== "unico" ? rotuloDaRecorrencia(item.recurrence) : "", !item.productId ? "Avulso" : ""]
    .filter(Boolean)
    .join(" · ");

  return (
    <tr className="align-middle">
      <td className="border-t border-border-subtle px-1 py-1.5">
        <div className="min-w-0">
          <div className="truncate font-medium text-text-primary" title={item.name}>{item.name}</div>
          {detalhes && <div className="truncate text-[11.5px] text-text-tertiary">{detalhes}</div>}
        </div>
      </td>
      <td className="border-t border-border-subtle px-1 py-1.5">
        <Celula valor={textoDaQuantidade(item.quantity)} rotulo={`Quantidade de ${item.name}`} onSalvar={(v) => onSalvar({ quantity: v })} />
      </td>
      <td className="border-t border-border-subtle px-1 py-1.5">
        <Celula valor={reais(item.unitPriceCents)} rotulo={`Preço unitário de ${item.name}`} onSalvar={(v) => onSalvar({ unitPrice: v || "0" })} />
      </td>
      <td className="border-t border-border-subtle px-1 py-1.5">
        <div className="flex items-center gap-1">
          <Celula valor={desconto} rotulo={`Desconto de ${item.name}`} onSalvar={(v) => onSalvar({ discount: v })} className="min-w-0" />
          <select
            aria-label={`Tipo de desconto de ${item.name}`}
            value={item.discountType}
            onChange={(e) => onSalvar({ discountType: e.target.value })}
            className="h-8 shrink-0 rounded-md border border-transparent bg-transparent px-1 text-[12px] text-text-secondary outline-none hover:border-border-subtle hover:bg-surface-2 focus:ring-2 focus:ring-accent-500/20"
          >
            <option value="percentual">%</option>
            <option value="valor">R$</option>
          </select>
        </div>
      </td>
      <td className="border-t border-border-subtle px-1 py-1.5 text-right font-medium tabular-nums text-text-primary">{moeda(item.totalCents)}</td>
      <td className="border-t border-border-subtle px-1 py-1.5">
        <div className="flex justify-end gap-0.5">
          <BotaoDeIcone rotulo={`Subir ${item.name}`} onClick={onSubir} disabled={primeiro}>
            <ArrowUp size={13} aria-hidden />
          </BotaoDeIcone>
          <BotaoDeIcone rotulo={`Descer ${item.name}`} onClick={onDescer} disabled={ultimo}>
            <ArrowDown size={13} aria-hidden />
          </BotaoDeIcone>
          <BotaoDeIcone rotulo={`Remover ${item.name}`} onClick={onRemover} className="hover:bg-danger/10 hover:text-danger">
            <X size={14} aria-hidden />
          </BotaoDeIcone>
        </div>
      </td>
    </tr>
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
    <div className="mb-3 rounded-xl border border-border-subtle bg-surface-2 p-3">
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
              className="h-9 w-full rounded-lg border border-border-default bg-surface-1 pl-8 pr-2 text-[13px] text-text-primary outline-none placeholder:text-text-tertiary focus:border-accent-500/60 focus:ring-2 focus:ring-accent-500/20"
            />
          </div>
          <ul className="mt-2 flex max-h-[240px] flex-col gap-0.5 overflow-y-auto" aria-label="Produtos encontrados">
            {resultados === null ? (
              <li className="px-2 py-1.5 text-[12.5px] text-text-tertiary">Buscando...</li>
            ) : resultados.length === 0 ? (
              <li className="px-2 py-1.5 text-[12.5px] text-text-tertiary">
                {busca ? "Nada encontrado no catálogo." : "O catálogo está vazio."}
              </li>
            ) : (
              resultados.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={!!enviando}
                    onClick={() => escolher({ productId: p.id }, p.id)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left text-[13px] outline-none hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-accent-500/60 disabled:opacity-50"
                  >
                    <span className="min-w-0 truncate text-text-primary">
                      {p.name}
                      {p.sku && <span className="ml-1.5 text-[11.5px] text-text-tertiary">{p.sku}</span>}
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5 tabular-nums text-text-secondary">
                      {enviando === p.id && <Loader2 size={13} className="animate-spin" aria-hidden />}
                      {moeda(p.priceCents)}
                      {p.recurrence !== "unico" && <span className="text-[11px] text-text-tertiary">{rotuloDaRecorrencia(p.recurrence).toLowerCase()}</span>}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
          <div className="mt-2 flex items-center justify-between border-t border-border-subtle pt-2 text-[12px]">
            <button type="button" onClick={() => setAvulso(true)} className="rounded px-1 text-accent-400 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent-500/60">
              + Item avulso (fora do catálogo)
            </button>
            <button type="button" onClick={aoFechar} className="rounded px-1 text-text-tertiary outline-none hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent-500/60">
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
          <label className="min-w-[180px] flex-1 text-[11.5px] text-text-tertiary">
            Nome do item
            <input
              autoFocus
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              maxLength={200}
              placeholder="Ex.: Frete, Taxa de instalação"
              className="mt-0.5 h-9 w-full rounded-lg border border-border-default bg-surface-1 px-2 text-[13px] text-text-primary outline-none focus:border-accent-500/60 focus:ring-2 focus:ring-accent-500/20"
            />
          </label>
          <label className="w-[120px] text-[11.5px] text-text-tertiary">
            Preço (R$)
            <input
              value={preco}
              onChange={(e) => setPreco(e.target.value)}
              inputMode="decimal"
              placeholder="0,00"
              className="mt-0.5 h-9 w-full rounded-lg border border-border-default bg-surface-1 px-2 text-[13px] tabular-nums text-text-primary outline-none focus:border-accent-500/60 focus:ring-2 focus:ring-accent-500/20"
            />
          </label>
          <button
            type="submit"
            disabled={!nome.trim() || !!enviando}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent-500 px-3 text-[13px] font-medium text-white outline-none hover:bg-accent-400 focus-visible:ring-2 focus-visible:ring-accent-500/60 disabled:opacity-40"
          >
            {enviando && <Loader2 size={13} className="animate-spin" aria-hidden />} Adicionar
          </button>
          <button type="button" onClick={() => setAvulso(false)} className="h-9 rounded-lg px-2 text-[12.5px] text-text-tertiary outline-none hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent-500/60">
            Voltar ao catálogo
          </button>
        </form>
      )}
    </div>
  );
}
