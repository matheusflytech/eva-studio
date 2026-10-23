"use client";

import * as React from "react";
import { Archive, ArchiveRestore, Loader2, Package, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal, ModalContent } from "@/components/ui/modal";
import { ConfirmarExclusao } from "@/components/crm/config/confirmar-exclusao";
import { RECORRENCIAS, moeda, rotuloDaRecorrencia, type ProdutoDoCatalogo, type Recorrencia } from "@/lib/produtos";
import { reaisDigitados } from "@/lib/dinheiro";
import { cn } from "@/lib/utils";

// Catálogo de produtos e serviços: o que a equipe adiciona nos negócios.
// Mudar o preço aqui não mexe em negócio que já tem o item (o item guarda o
// preço do dia em que entrou).

async function chamar(url: string, metodo: string, corpo?: unknown) {
  try {
    const res = await fetch(url, {
      method: metodo,
      headers: corpo ? { "Content-Type": "application/json" } : undefined,
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    const dados = await res.json().catch(() => ({}));
    return { ok: res.ok, erro: res.ok ? null : ((dados.error as string) ?? "Algo deu errado."), dados };
  } catch {
    return { ok: false, erro: "Sem conexão. Tente de novo.", dados: {} };
  }
}

const SUFIXO: Record<Recorrencia, string> = { unico: "", mensal: "/mês", anual: "/ano" };

export function ProdutosEditor() {
  const [produtos, setProdutos] = React.useState<ProdutoDoCatalogo[]>([]);
  const [disponivel, setDisponivel] = React.useState(true);
  const [carregando, setCarregando] = React.useState(true);
  const [busca, setBusca] = React.useState("");
  const [comArquivados, setComArquivados] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [editando, setEditando] = React.useState<ProdutoDoCatalogo | "novo" | null>(null);
  const [excluindo, setExcluindo] = React.useState<ProdutoDoCatalogo | null>(null);

  const carregar = React.useCallback(async () => {
    const q = new URLSearchParams();
    if (busca.trim()) q.set("busca", busca.trim());
    if (comArquivados) q.set("arquivados", "1");
    const r = await chamar(`/api/products?${q}`, "GET");
    if (r.ok) {
      setProdutos(r.dados.produtos ?? []);
      setDisponivel(r.dados.disponivel !== false);
    } else setErro(r.erro);
    setCarregando(false);
  }, [busca, comArquivados]);

  // Busca com uma pausa curta: não dispara uma chamada por tecla.
  React.useEffect(() => {
    const t = setTimeout(carregar, 250);
    return () => clearTimeout(t);
  }, [carregar]);

  async function arquivar(p: ProdutoDoCatalogo, arquivado: boolean) {
    setErro(null);
    const r = await chamar(`/api/products/${p.id}`, "PATCH", { archived: arquivado });
    if (!r.ok) setErro(r.erro);
    await carregar();
  }

  if (!carregando && !disponivel) {
    return (
      <EmptyState
        icon={<Package size={36} className="text-text-tertiary" aria-hidden />}
        title="Produtos ainda não ativados"
        description="O catálogo de produtos precisa ser ligado no banco de dados antes do primeiro uso. Fale com quem administra a Eva."
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[560px] text-small text-text-secondary">
          O que você vende. Na ficha do negócio, a equipe escolhe daqui e o valor do negócio passa a ser a soma dos produtos.
        </p>
        <Button onClick={() => setEditando("novo")}>
          <Plus size={15} /> Novo produto
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search size={15} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, código ou categoria"
            aria-label="Buscar produtos"
            className="h-10 pl-9"
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-small text-text-secondary">
          <Switch checked={comArquivados} onCheckedChange={setComArquivados} aria-label="Mostrar arquivados" />
          Mostrar arquivados
        </label>
      </div>

      {erro && <div role="alert" className="rounded-[14px] bg-danger-subtle px-4 py-3 text-small text-danger">{erro}</div>}

      {carregando ? (
        <p className="text-body text-text-tertiary">Carregando...</p>
      ) : produtos.length === 0 ? (
        <EmptyState
          icon={<Package size={36} className="text-text-tertiary" aria-hidden />}
          title={busca ? "Nada encontrado" : "Nenhum produto ainda"}
          description={
            busca
              ? "Tente outro nome ou código."
              : "Cadastre o que você vende (planos, serviços, peças) para montar os negócios item por item."
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {produtos.map((p) => (
            <li
              key={p.id}
              className={cn("flex items-center gap-3 rounded-[14px] bg-raised p-3 ring-1 ring-border-subtle", p.archivedAt && "opacity-60")}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-small font-medium text-text-primary">{p.name}</span>
                  {p.sku && <span className="text-caption tabular-nums text-text-tertiary">{p.sku}</span>}
                  {p.recurrence !== "unico" && <Badge variant="accent">{rotuloDaRecorrencia(p.recurrence)}</Badge>}
                  {p.category && <Badge>{p.category}</Badge>}
                  {p.archivedAt && <Badge>Arquivado</Badge>}
                </div>
                {p.description && <p className="mt-0.5 truncate text-caption text-text-tertiary">{p.description}</p>}
              </div>
              <div className="shrink-0 text-right">
                <div className="text-body font-semibold tabular-nums text-text-primary">
                  {moeda(p.priceCents)}
                  <span className="text-caption font-normal text-text-tertiary">{SUFIXO[p.recurrence]}</span>
                </div>
                <div className="text-caption text-text-tertiary">por {p.unit}</div>
              </div>
              <button type="button" onClick={() => setEditando(p)} aria-label={`Editar ${p.name}`} title="Editar" className="rounded-lg p-2 text-text-tertiary outline-none hover:bg-hover hover:text-text-primary focus-visible:ring-2 focus-visible:ring-focus">
                <Pencil size={15} />
              </button>
              <button
                type="button"
                onClick={() => arquivar(p, !p.archivedAt)}
                aria-label={p.archivedAt ? `Reativar ${p.name}` : `Arquivar ${p.name}`}
                title={p.archivedAt ? "Reativar" : "Arquivar (some da busca, os negócios antigos ficam)"}
                className="rounded-lg p-2 text-text-tertiary outline-none hover:bg-hover hover:text-text-primary focus-visible:ring-2 focus-visible:ring-focus"
              >
                {p.archivedAt ? <ArchiveRestore size={15} /> : <Archive size={15} />}
              </button>
              {p.archivedAt && (
                <button type="button" onClick={() => setExcluindo(p)} aria-label={`Excluir ${p.name}`} title="Excluir" className="rounded-lg p-2 text-text-tertiary outline-none hover:bg-danger-subtle hover:text-danger focus-visible:ring-2 focus-visible:ring-danger/60">
                  <Trash2 size={15} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {editando && (
        <ProdutoModal
          produto={editando === "novo" ? null : editando}
          aoFechar={() => setEditando(null)}
          aoSalvar={async () => {
            setEditando(null);
            await carregar();
          }}
        />
      )}

      {excluindo && (
        <ConfirmarExclusao
          titulo={`Excluir "${excluindo.name}"?`}
          descricao="Some do catálogo de vez. Os negócios que já têm este produto continuam com o item, o nome e o preço."
          onCancelar={() => setExcluindo(null)}
          onConfirmar={async () => {
            const r = await chamar(`/api/products/${excluindo.id}`, "DELETE");
            if (!r.ok) return r.erro;
            setExcluindo(null);
            await carregar();
            return null;
          }}
        />
      )}
    </div>
  );
}

const reaisParaTexto = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function ProdutoModal({
  produto,
  aoFechar,
  aoSalvar,
}: {
  produto: ProdutoDoCatalogo | null;
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const [nome, setNome] = React.useState(produto?.name ?? "");
  const [sku, setSku] = React.useState(produto?.sku ?? "");
  const [preco, setPreco] = React.useState(produto ? reaisParaTexto(produto.priceCents) : "");
  const [unidade, setUnidade] = React.useState(produto?.unit ?? "un");
  const [recorrencia, setRecorrencia] = React.useState<Recorrencia>(produto?.recurrence ?? "unico");
  const [categoria, setCategoria] = React.useState(produto?.category ?? "");
  const [descricao, setDescricao] = React.useState(produto?.description ?? "");
  const [busy, setBusy] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) return setErro("Dê um nome ao produto.");
    const reais = reaisDigitados(preco);
    if (reais === null) return setErro("Preço inválido (máximo R$ 21 milhões).");
    setBusy(true);
    setErro(null);
    const corpo = { name: nome, sku, price: reais, unit: unidade, recurrence: recorrencia, category: categoria, description: descricao };
    const r = produto ? await chamar(`/api/products/${produto.id}`, "PATCH", corpo) : await chamar("/api/products", "POST", corpo);
    setBusy(false);
    if (!r.ok) return setErro(r.erro);
    aoSalvar();
  }

  return (
    <Modal open onOpenChange={(o) => !o && aoFechar()}>
      <ModalContent
        title={produto ? "Editar produto" : "Novo produto"}
        description={produto ? "Negócios que já têm este produto mantêm o preço de quando o item entrou." : undefined}
        className="max-h-[92dvh] max-w-xl overflow-y-auto"
      >
        <form onSubmit={salvar} className="flex flex-col gap-4">
          <div>
            <Label htmlFor="prod-nome">Nome</Label>
            <Input id="prod-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Plano Pro, Instalação, Painel 550W" autoFocus maxLength={200} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="prod-preco">Preço (R$)</Label>
              <Input id="prod-preco" inputMode="decimal" value={preco} onChange={(e) => setPreco(e.target.value)} placeholder="0,00" className="tabular-nums" />
            </div>
            <div>
              <Label htmlFor="prod-recorrencia">Cobrança</Label>
              <Select id="prod-recorrencia" value={recorrencia} onChange={(e) => setRecorrencia(e.target.value as Recorrencia)}>
                {RECORRENCIAS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.id === "unico" ? "Única (uma vez)" : r.rotulo}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="prod-unidade">Unidade</Label>
              <Input id="prod-unidade" value={unidade} onChange={(e) => setUnidade(e.target.value)} placeholder="un, h, licença" maxLength={20} />
            </div>
            <div>
              <Label htmlFor="prod-sku">Código (opcional)</Label>
              <Input id="prod-sku" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SKU ou código interno" maxLength={60} />
            </div>
          </div>
          <div>
            <Label htmlFor="prod-categoria">Categoria (opcional)</Label>
            <Input id="prod-categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="Ex.: Assinatura, Serviço, Equipamento" maxLength={80} />
          </div>
          <div>
            <Label htmlFor="prod-descricao">Descrição (opcional)</Label>
            <Textarea id="prod-descricao" rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={2000} />
          </div>
          {erro && <p role="alert" className="text-small text-danger">{erro}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={aoFechar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 size={14} className="animate-spin" />} {produto ? "Salvar" : "Criar produto"}
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
}
