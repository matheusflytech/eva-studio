"use client";

import * as React from "react";
import { Plus, Trash2, Loader2, Star, Check } from "lucide-react";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Modal, ModalContent } from "@/components/ui/modal";
import { ListaOrdenavel } from "@/components/crm/config/lista-ordenavel";
import { ConfirmarExclusao } from "@/components/crm/config/confirmar-exclusao";
import { CORES_DE_ETAPA, COR_DA_ETAPA, corDaEtapa } from "@/lib/custom-fields";
import { cn } from "@/lib/utils";

interface Etapa {
  id: string;
  name: string;
  position: number;
  probability: number;
  type: string;
  color: string;
  dealCount: number;
}
interface Funil {
  id: string;
  name: string;
  isDefault: boolean;
  dealCount: number;
  stages: Etapa[];
}

const TIPOS = [
  { id: "open", rotulo: "Aberta" },
  { id: "won", rotulo: "Ganho" },
  { id: "lost", rotulo: "Perdido" },
];

async function chamar(url: string, metodo: string, corpo?: unknown): Promise<{ ok: boolean; erro: string | null; dados: Record<string, unknown> }> {
  const res = await fetch(url, {
    method: metodo,
    headers: corpo ? { "Content-Type": "application/json" } : undefined,
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const dados = await res.json().catch(() => ({}));
  return { ok: res.ok, erro: res.ok ? null : (dados.error as string) ?? "Algo deu errado.", dados };
}

export function FunisEditor() {
  const [funis, setFunis] = React.useState<Funil[]>([]);
  const [selecionado, setSelecionado] = React.useState("");
  const [carregando, setCarregando] = React.useState(true);
  const [erro, setErro] = React.useState<string | null>(null);
  const [novoFunil, setNovoFunil] = React.useState(false);
  const [excluindoFunil, setExcluindoFunil] = React.useState(false);
  const [excluindoEtapa, setExcluindoEtapa] = React.useState<Etapa | null>(null);

  const carregar = React.useCallback(async () => {
    const res = await fetch("/api/pipelines");
    const d = await res.json().catch(() => ({}));
    const lista: Funil[] = d.pipelines ?? [];
    setFunis(lista);
    setSelecionado((atual) => (lista.some((f) => f.id === atual) ? atual : lista[0]?.id ?? ""));
    setCarregando(false);
  }, []);

  React.useEffect(() => { carregar(); }, [carregar]);

  const funil = funis.find((f) => f.id === selecionado);

  async function executar(p: Promise<{ ok: boolean; erro: string | null }>) {
    setErro(null);
    const r = await p;
    if (!r.ok) setErro(r.erro);
    await carregar();
    return r;
  }

  function reordenarEtapas(nova: Etapa[]) {
    if (!funil) return;
    // Mostra a nova ordem já; o servidor confirma depois.
    setFunis((fs) => fs.map((f) => (f.id === funil.id ? { ...f, stages: nova } : f)));
    executar(chamar(`/api/pipelines/${funil.id}/stages/reorder`, "POST", { ids: nova.map((e) => e.id) }));
  }

  if (carregando) return <p className="text-[14px] text-text-tertiary">Carregando...</p>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        {funis.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setSelecionado(f.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] ring-1 transition-colors",
              f.id === selecionado
                ? "bg-accent-500/15 text-text-primary ring-accent-500/50"
                : "bg-surface-2 text-text-secondary ring-border-subtle hover:text-text-primary"
            )}
          >
            {f.isDefault && <Star size={12} className="text-amber-400" />}
            {f.name}
            <span className="text-[11.5px] text-text-tertiary">{f.dealCount}</span>
          </button>
        ))}
        <Button variant="ghost" onClick={() => setNovoFunil(true)}>
          <Plus size={15} /> Novo funil
        </Button>
      </div>

      {erro && <div className="rounded-2xl bg-danger/10 px-4 py-3 text-sm text-danger">{erro}</div>}

      {funil && (
        <section className="glass-card rounded-3xl p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-[220px] flex-1">
              <Label htmlFor="nome-funil">Nome do funil</Label>
              <Input
                key={funil.id + funil.name}
                id="nome-funil"
                defaultValue={funil.name}
                onBlur={(e) => {
                  const nome = e.target.value.trim();
                  if (nome && nome !== funil.name) executar(chamar(`/api/pipelines/${funil.id}`, "PATCH", { name: nome }));
                }}
              />
            </div>
            <div className="flex gap-2">
              {!funil.isDefault && (
                <Button variant="ghost" onClick={() => executar(chamar(`/api/pipelines/${funil.id}`, "PATCH", { isDefault: true }))}>
                  <Star size={14} /> Tornar padrão
                </Button>
              )}
              {funis.length > 1 && (
                <Button variant="ghost" onClick={() => setExcluindoFunil(true)} className="text-danger hover:bg-danger/10">
                  <Trash2 size={14} /> Excluir funil
                </Button>
              )}
            </div>
          </div>

          <div className="mt-6">
            <h3 className="text-[13px] font-medium text-text-secondary">Etapas</h3>
            <p className="mb-3 mt-0.5 text-[12.5px] text-text-tertiary">
              Arraste pela alça para mudar a ordem. O tipo diz ao sistema o que a etapa significa: &quot;Ganho&quot; e &quot;Perdido&quot; encerram o negócio e entram nas contas de conversão.
            </p>
            <ListaOrdenavel itens={funil.stages} onReordenar={reordenarEtapas}>
              {(etapa, alca) => (
                <LinhaDeEtapa
                  key={etapa.id}
                  etapa={etapa}
                  alca={alca}
                  podeExcluir={funil.stages.length > 1}
                  aoMudar={(corpo) => executar(chamar(`/api/pipelines/${funil.id}/stages/${etapa.id}`, "PATCH", corpo))}
                  aoExcluir={() => setExcluindoEtapa(etapa)}
                />
              )}
            </ListaOrdenavel>
            <NovaEtapa
              desabilitado={funil.stages.length >= 20}
              aoCriar={(nome) => executar(chamar(`/api/pipelines/${funil.id}/stages`, "POST", { name: nome }))}
            />
          </div>
        </section>
      )}

      {novoFunil && (
        <NovoFunilModal
          aoFechar={() => setNovoFunil(false)}
          aoCriar={async (nome, etapas) => {
            const r = await chamar("/api/pipelines", "POST", { name: nome, stages: etapas });
            if (!r.ok) return r.erro;
            const novo = (r.dados.pipeline as { id: string }).id;
            await carregar();
            setSelecionado(novo);
            setNovoFunil(false);
            return null;
          }}
        />
      )}

      {excluindoFunil && funil && (
        <ConfirmarExclusao
          titulo={`Excluir o funil "${funil.name}"?`}
          descricao={
            funil.dealCount > 0
              ? `Ele tem ${funil.dealCount} negócio(s). Eles não são apagados: vão para o funil que você escolher, na etapa de mesmo nome (ou a equivalente).`
              : "O funil está vazio, nenhum negócio será afetado."
          }
          destinos={funil.dealCount > 0 ? funis.filter((f) => f.id !== funil.id).map((f) => ({ id: f.id, nome: f.name })) : undefined}
          rotuloDestino="Mover os negócios para o funil"
          onCancelar={() => setExcluindoFunil(false)}
          onConfirmar={async (destino) => {
            const r = await chamar(`/api/pipelines/${funil.id}${destino ? `?moverPara=${destino}` : ""}`, "DELETE");
            if (!r.ok) return r.erro;
            setExcluindoFunil(false);
            await carregar();
            return null;
          }}
        />
      )}

      {excluindoEtapa && funil && (
        <ConfirmarExclusao
          titulo={`Excluir a etapa "${excluindoEtapa.name}"?`}
          descricao={
            excluindoEtapa.dealCount > 0
              ? `Ela tem ${excluindoEtapa.dealCount} negócio(s). Escolha para qual etapa eles vão.`
              : "A etapa está vazia, nenhum negócio será afetado."
          }
          destinos={
            excluindoEtapa.dealCount > 0
              ? funil.stages.filter((e) => e.id !== excluindoEtapa.id).map((e) => ({ id: e.id, nome: e.name }))
              : undefined
          }
          rotuloDestino="Mover os negócios para a etapa"
          onCancelar={() => setExcluindoEtapa(null)}
          onConfirmar={async (destino) => {
            const r = await chamar(
              `/api/pipelines/${funil.id}/stages/${excluindoEtapa.id}${destino ? `?moverPara=${destino}` : ""}`,
              "DELETE"
            );
            if (!r.ok) return r.erro;
            setExcluindoEtapa(null);
            await carregar();
            return null;
          }}
        />
      )}
    </div>
  );
}

function LinhaDeEtapa({
  etapa,
  alca,
  podeExcluir,
  aoMudar,
  aoExcluir,
}: {
  etapa: Etapa;
  alca: React.ReactNode;
  podeExcluir: boolean;
  aoMudar: (corpo: Record<string, unknown>) => void;
  aoExcluir: () => void;
}) {
  const [corAberta, setCorAberta] = React.useState(false);
  const cor = corDaEtapa(etapa.color, etapa.type);
  const fechada = etapa.type !== "open";

  return (
    <div className="rounded-2xl bg-surface-2 p-2.5 ring-1 ring-border-subtle">
      <div className="flex flex-wrap items-center gap-2">
        {alca}
        <button
          type="button"
          onClick={() => setCorAberta((v) => !v)}
          aria-label="Escolher a cor da etapa"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg hover:bg-surface-3"
        >
          <span className={cn("h-3 w-3 rounded-full", cor.ponto)} />
        </button>
        <Input
          key={etapa.id + etapa.name}
          defaultValue={etapa.name}
          aria-label="Nome da etapa"
          className="h-9 min-w-[140px] flex-1"
          onBlur={(e) => {
            const nome = e.target.value.trim();
            if (nome && nome !== etapa.name) aoMudar({ name: nome });
            else e.target.value = etapa.name;
          }}
        />
        <div className="w-[140px]">
          <Select value={etapa.type} aria-label="Tipo da etapa" className="h-9" onChange={(e) => aoMudar({ type: e.target.value })}>
            {TIPOS.map((t) => (
              <option key={t.id} value={t.id}>{t.rotulo}</option>
            ))}
          </Select>
        </div>
        <label className="flex items-center gap-1.5 text-[12px] text-text-tertiary" title="Chance de fechar: usada na previsão ponderada">
          <Input
            key={etapa.id + etapa.probability + etapa.type}
            type="number"
            min={0}
            max={100}
            defaultValue={etapa.probability}
            disabled={fechada}
            aria-label="Probabilidade em porcentagem"
            className="h-9 w-[72px] px-2.5"
            onBlur={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v) && v !== etapa.probability) aoMudar({ probability: v });
            }}
          />
          %
        </label>
        <span className="w-[54px] text-right text-[11.5px] text-text-tertiary">{etapa.dealCount} neg.</span>
        <button
          type="button"
          onClick={aoExcluir}
          disabled={!podeExcluir}
          aria-label="Excluir etapa"
          className="rounded-lg p-2 text-text-tertiary hover:bg-danger/10 hover:text-danger disabled:pointer-events-none disabled:opacity-30"
        >
          <Trash2 size={15} />
        </button>
      </div>
      {corAberta && (
        <div className="mt-2 flex flex-wrap items-center gap-2 pl-8">
          {CORES_DE_ETAPA.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Cor ${c}`}
              onClick={() => { aoMudar({ color: c }); setCorAberta(false); }}
              className={cn("flex h-7 w-7 items-center justify-center rounded-full ring-offset-2 ring-offset-surface-2", COR_DA_ETAPA[c].ponto, etapa.color === c && "ring-2 ring-text-primary")}
            >
              {etapa.color === c && <Check size={13} className="text-black/70" />}
            </button>
          ))}
          <button type="button" onClick={() => { aoMudar({ color: "" }); setCorAberta(false); }} className="text-[12px] text-text-tertiary hover:text-text-primary">
            Cor padrão
          </button>
        </div>
      )}
    </div>
  );
}

function NovaEtapa({ aoCriar, desabilitado }: { aoCriar: (nome: string) => Promise<unknown>; desabilitado: boolean }) {
  const [nome, setNome] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function criar() {
    if (!nome.trim()) return;
    setBusy(true);
    await aoCriar(nome.trim());
    setNome("");
    setBusy(false);
  }

  return (
    <form
      className="mt-3 flex gap-2"
      onSubmit={(e) => { e.preventDefault(); criar(); }}
    >
      <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder={desabilitado ? "Limite de 20 etapas" : "Nome da nova etapa"} disabled={desabilitado} />
      <Button type="submit" disabled={busy || !nome.trim() || desabilitado}>
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Adicionar
      </Button>
    </form>
  );
}

const MODELOS = [
  { nome: "Vendas simples", etapas: ["Novo", "Em contato", "Proposta", "Negociação", "Ganho", "Perdido"] },
  { nome: "Atendimento", etapas: ["Recebido", "Em atendimento", "Aguardando cliente", "Resolvido"] },
  { nome: "Em branco", etapas: ["Início", "Ganho", "Perdido"] },
];

function NovoFunilModal({
  aoFechar,
  aoCriar,
}: {
  aoFechar: () => void;
  aoCriar: (nome: string, etapas: { name: string; type: string; probability: number }[]) => Promise<string | null>;
}) {
  const [nome, setNome] = React.useState("");
  const [modelo, setModelo] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  async function criar() {
    setBusy(true);
    setErro(null);
    const nomes = MODELOS[modelo].etapas;
    const abertas = nomes.filter((n) => n !== "Ganho" && n !== "Perdido" && n !== "Resolvido");
    const etapas = nomes.map((n) => {
      const type = n === "Ganho" || n === "Resolvido" ? "won" : n === "Perdido" ? "lost" : "open";
      const i = abertas.indexOf(n);
      return { name: n, type, probability: type === "open" ? Math.round(((i + 1) / (abertas.length + 1)) * 80) : 0 };
    });
    const e = await aoCriar(nome.trim(), etapas);
    setBusy(false);
    if (e) setErro(e);
  }

  return (
    <Modal open onOpenChange={(o) => !o && aoFechar()}>
      <ModalContent title="Novo funil" description="Escolha um ponto de partida. Dá para mudar tudo depois.">
        <div className="flex flex-col gap-4">
          <div>
            <Label htmlFor="novo-funil">Nome</Label>
            <Input id="novo-funil" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Pós-venda, Parcerias, Instalações..." autoFocus />
          </div>
          <div className="flex flex-col gap-2">
            {MODELOS.map((m, i) => (
              <button
                key={m.nome}
                type="button"
                onClick={() => setModelo(i)}
                className={cn(
                  "rounded-2xl px-4 py-3 text-left ring-1 transition-colors",
                  modelo === i ? "bg-accent-500/12 ring-accent-500/50" : "bg-surface-2 ring-border-subtle hover:ring-border-strong"
                )}
              >
                <div className="text-[13.5px] font-medium text-text-primary">{m.nome}</div>
                <div className="mt-0.5 text-[12px] text-text-tertiary">{m.etapas.join("  >  ")}</div>
              </button>
            ))}
          </div>
          {erro && <p className="text-[13px] text-danger">{erro}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={aoFechar}>Cancelar</Button>
            <Button onClick={criar} disabled={busy || !nome.trim()}>
              {busy && <Loader2 size={15} className="animate-spin" />} Criar funil
            </Button>
          </div>
        </div>
      </ModalContent>
    </Modal>
  );
}
