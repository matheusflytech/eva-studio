"use client";

import * as React from "react";
import { Plus, Trash2, Loader2, Pencil, X } from "lucide-react";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal, ModalContent } from "@/components/ui/modal";
import { ListaOrdenavel } from "@/components/crm/config/lista-ordenavel";
import { ConfirmarExclusao } from "@/components/crm/config/confirmar-exclusao";
import { CampoEditor } from "@/components/crm/campos-personalizados";
import { TIPOS_DE_CAMPO, TIPO_POR_ID, type DefinicaoDeCampo, type EntidadeDoCampo, type OpcaoDeCampo, type TipoDeCampo } from "@/lib/custom-fields";
import { cn } from "@/lib/utils";

interface FunilSimples { id: string; name: string }

// Sugestões por tipo de negócio: a pessoa não começa de uma página em branco.
const SUGESTOES: Record<EntidadeDoCampo, { label: string; type: TipoDeCampo; options?: string[] }[]> = {
  deal: [
    { label: "Origem do lead", type: "select", options: ["Indicação", "Instagram", "Google", "Site", "Evento"] },
    { label: "Data da visita", type: "date" },
    { label: "Valor do orçamento", type: "currency" },
    { label: "Tem financiamento", type: "checkbox" },
    { label: "Observações internas", type: "longtext" },
  ],
  contact: [
    { label: "Cidade", type: "text" },
    { label: "Data de nascimento", type: "date" },
    { label: "Como conheceu", type: "select", options: ["Indicação", "Instagram", "Google", "Evento"] },
    { label: "Instagram", type: "url" },
  ],
};

async function chamar(url: string, metodo: string, corpo?: unknown) {
  const res = await fetch(url, {
    method: metodo,
    headers: corpo ? { "Content-Type": "application/json" } : undefined,
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const dados = await res.json().catch(() => ({}));
  return { ok: res.ok, erro: res.ok ? null : ((dados.error as string) ?? "Algo deu errado."), dados };
}

export function CamposEditor({ entity }: { entity: EntidadeDoCampo }) {
  const [campos, setCampos] = React.useState<DefinicaoDeCampo[]>([]);
  const [funis, setFunis] = React.useState<FunilSimples[]>([]);
  const [carregando, setCarregando] = React.useState(true);
  const [erro, setErro] = React.useState<string | null>(null);
  const [editando, setEditando] = React.useState<DefinicaoDeCampo | "novo" | null>(null);
  const [rascunhoNovo, setRascunhoNovo] = React.useState<{ label: string; type: TipoDeCampo; options?: string[] } | null>(null);
  const [excluindo, setExcluindo] = React.useState<DefinicaoDeCampo | null>(null);

  const carregar = React.useCallback(async () => {
    const [c, f] = await Promise.all([
      fetch(`/api/custom-fields?entity=${entity}&todos=1`).then((r) => r.json()).catch(() => ({})),
      entity === "deal" ? fetch("/api/pipelines").then((r) => r.json()).catch(() => ({})) : Promise.resolve({}),
    ]);
    setCampos(c.fields ?? []);
    setFunis(((f as { pipelines?: FunilSimples[] }).pipelines ?? []).map((p) => ({ id: p.id, name: p.name })));
    setCarregando(false);
  }, [entity]);

  React.useEffect(() => { carregar(); }, [carregar]);

  async function reordenar(nova: DefinicaoDeCampo[]) {
    setCampos(nova);
    const r = await chamar("/api/custom-fields/reorder", "POST", { ids: nova.map((c) => c.id) });
    if (!r.ok) setErro(r.erro);
    carregar();
  }

  if (carregando) return <p className="text-[14px] text-text-tertiary">Carregando...</p>;

  const sugestoes = SUGESTOES[entity].filter((s) => !campos.some((c) => c.label.toLowerCase() === s.label.toLowerCase()));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[560px] text-[13.5px] text-text-secondary">
          {entity === "deal"
            ? "Os dados que o seu negócio precisa guardar em cada negociação. Aparecem ao abrir o negócio, e os marcados aparecem como etiqueta no cartão do funil."
            : "Os dados que você quer saber de cada pessoa, além de nome, e-mail e telefone."}
        </p>
        <Button onClick={() => { setRascunhoNovo(null); setEditando("novo"); }}>
          <Plus size={15} /> Novo campo
        </Button>
      </div>

      {erro && <div className="rounded-2xl bg-danger/10 px-4 py-3 text-sm text-danger">{erro}</div>}

      {campos.length === 0 ? (
        <EmptyState
          title="Nenhum campo criado ainda"
          description="Crie campos para guardar o que importa para o seu tipo de negócio, por exemplo consumo mensal, tipo de imóvel ou data da visita."
        />
      ) : (
        <ListaOrdenavel itens={campos} onReordenar={reordenar}>
          {(c, alca) => (
            <div className="flex items-center gap-2 rounded-2xl bg-surface-2 p-2.5 ring-1 ring-border-subtle">
              {alca}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-[13.5px] font-medium text-text-primary">{c.label}</span>
                  {c.required && <Badge>Obrigatório</Badge>}
                  {c.showOnCard && <Badge>No cartão</Badge>}
                  {c.pipelineId && <Badge>{funis.find((f) => f.id === c.pipelineId)?.name ?? "Um funil"}</Badge>}
                </div>
                <div className="mt-0.5 truncate text-[12px] text-text-tertiary">
                  {TIPO_POR_ID.get(c.type)?.rotulo}
                  {c.options.length > 0 && `: ${c.options.map((o) => o.label).join(", ")}`}
                </div>
              </div>
              <button type="button" onClick={() => setEditando(c)} aria-label="Editar campo" className="rounded-lg p-2 text-text-tertiary hover:bg-surface-3 hover:text-text-primary">
                <Pencil size={15} />
              </button>
              <button type="button" onClick={() => setExcluindo(c)} aria-label="Excluir campo" className="rounded-lg p-2 text-text-tertiary hover:bg-danger/10 hover:text-danger">
                <Trash2 size={15} />
              </button>
            </div>
          )}
        </ListaOrdenavel>
      )}

      {sugestoes.length > 0 && campos.length < 40 && (
        <div>
          <p className="mb-2 text-[12.5px] text-text-tertiary">Ideias para começar</p>
          <div className="flex flex-wrap gap-2">
            {sugestoes.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => { setRascunhoNovo(s); setEditando("novo"); }}
                className="rounded-full bg-surface-2 px-3 py-1.5 text-[12.5px] text-text-secondary ring-1 ring-border-subtle hover:text-text-primary"
              >
                + {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {editando && (
        <CampoModal
          entity={entity}
          campo={editando === "novo" ? null : editando}
          sugestao={rascunhoNovo}
          funis={funis}
          aoFechar={() => setEditando(null)}
          aoSalvar={async () => { setEditando(null); await carregar(); }}
        />
      )}

      {excluindo && (
        <ConfirmarExclusaoDeCampo
          campo={excluindo}
          aoCancelar={() => setExcluindo(null)}
          aoExcluido={async () => { setExcluindo(null); await carregar(); }}
        />
      )}
    </div>
  );
}

function ConfirmarExclusaoDeCampo({ campo, aoCancelar, aoExcluido }: { campo: DefinicaoDeCampo; aoCancelar: () => void; aoExcluido: () => void }) {
  const [limpar, setLimpar] = React.useState(false);
  return (
    <ConfirmarExclusao
      titulo={`Excluir o campo "${campo.label}"?`}
      descricao="O campo deixa de aparecer nas telas."
      extra={
        <label className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-surface-2 p-3 text-[13px] text-text-secondary">
          <input type="checkbox" checked={limpar} onChange={(e) => setLimpar(e.target.checked)} className="mt-0.5 h-4 w-4" />
          <span>
            Apagar também os valores já preenchidos.
            <span className="block text-[12px] text-text-tertiary">Sem marcar, os valores ficam guardados e voltam se você criar de novo um campo com o mesmo nome.</span>
          </span>
        </label>
      }
      onCancelar={aoCancelar}
      onConfirmar={async () => {
        const r = await chamar(`/api/custom-fields/${campo.id}${limpar ? "?limpar=1" : ""}`, "DELETE");
        if (!r.ok) return r.erro;
        aoExcluido();
        return null;
      }}
    />
  );
}

interface OpcaoEmEdicao { value?: string; label: string }

function CampoModal({
  entity,
  campo,
  sugestao,
  funis,
  aoFechar,
  aoSalvar,
}: {
  entity: EntidadeDoCampo;
  campo: DefinicaoDeCampo | null;
  sugestao: { label: string; type: TipoDeCampo; options?: string[] } | null;
  funis: FunilSimples[];
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const [label, setLabel] = React.useState(campo?.label ?? sugestao?.label ?? "");
  const [tipo, setTipo] = React.useState<TipoDeCampo>(campo?.type ?? sugestao?.type ?? "text");
  const [opcoes, setOpcoes] = React.useState<OpcaoEmEdicao[]>(
    campo ? campo.options.map((o: OpcaoDeCampo) => ({ value: o.value, label: o.label })) : (sugestao?.options ?? []).map((l) => ({ label: l }))
  );
  const [obrigatorio, setObrigatorio] = React.useState(campo?.required ?? false);
  const [ajuda, setAjuda] = React.useState(campo?.helpText ?? "");
  const [noCartao, setNoCartao] = React.useState(campo?.showOnCard ?? false);
  const [funilId, setFunilId] = React.useState(campo?.pipelineId ?? "");
  const [novaOpcao, setNovaOpcao] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  const info = TIPO_POR_ID.get(tipo)!;
  const editandoExistente = !!campo;

  // Pré-visualização com uma definição provisória: é o que a pessoa vai ver
  // ao preencher o campo.
  const previa: DefinicaoDeCampo = {
    id: "previa", entity, pipelineId: null, key: "previa", label: label || "Campo", type: tipo,
    options: opcoes.filter((o) => o.label.trim()).map((o, i) => ({ value: o.value ?? `o${i}`, label: o.label })),
    required: obrigatorio, helpText: ajuda, showOnCard: noCartao, position: 0,
  };
  const [valorPrevia, setValorPrevia] = React.useState<string | boolean | string[]>("");

  function adicionarOpcao() {
    const t = novaOpcao.trim();
    if (!t) return;
    setOpcoes((o) => [...o, { label: t }]);
    setNovaOpcao("");
  }

  async function salvar() {
    setBusy(true);
    setErro(null);
    const corpo: Record<string, unknown> = {
      label, required: obrigatorio, helpText: ajuda,
      showOnCard: entity === "deal" ? noCartao : false,
      ...(info.comOpcoes ? { options: opcoes } : {}),
      ...(entity === "deal" ? { pipelineId: funilId || null } : {}),
    };
    const r = editandoExistente
      ? await chamar(`/api/custom-fields/${campo.id}`, "PATCH", corpo)
      : await chamar("/api/custom-fields", "POST", { ...corpo, entity, type: tipo });
    setBusy(false);
    if (!r.ok) { setErro(r.erro); return; }
    aoSalvar();
  }

  return (
    <Modal open onOpenChange={(o) => !o && aoFechar()}>
      <ModalContent title={editandoExistente ? "Editar campo" : "Novo campo"} className="max-h-[92dvh] max-w-xl overflow-y-auto">
        <div className="flex flex-col gap-5">
          <div>
            <Label htmlFor="cf-nome">Nome do campo</Label>
            <Input id="cf-nome" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex.: Consumo mensal (kWh)" autoFocus={!editandoExistente} />
          </div>

          <div>
            <Label>Que tipo de informação é?</Label>
            <div className="grid grid-cols-2 gap-2">
              {TIPOS_DE_CAMPO.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  disabled={editandoExistente}
                  onClick={() => setTipo(t.id)}
                  className={cn(
                    "rounded-xl px-3 py-2.5 text-left ring-1 transition-colors disabled:cursor-not-allowed",
                    tipo === t.id ? "bg-accent-500/12 ring-accent-500/50" : "bg-surface-2 ring-border-subtle",
                    editandoExistente && tipo !== t.id && "opacity-40",
                    !editandoExistente && tipo !== t.id && "hover:ring-border-strong"
                  )}
                >
                  <div className="text-[13px] font-medium text-text-primary">{t.rotulo}</div>
                  <div className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-text-tertiary">{t.descricao}</div>
                </button>
              ))}
            </div>
            {editandoExistente && (
              <p className="mt-2 text-[12px] text-text-tertiary">O tipo não muda depois de criado, para não perder o que já foi preenchido. Se precisar de outro tipo, crie um campo novo.</p>
            )}
          </div>

          {info.comOpcoes && (
            <div>
              <Label>Opções da lista</Label>
              <div className="flex flex-col gap-1.5">
                {opcoes.map((o, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={o.label}
                      aria-label={`Opção ${i + 1}`}
                      className="h-10"
                      onChange={(e) => setOpcoes((lista) => lista.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                    />
                    <button type="button" aria-label="Remover opção" onClick={() => setOpcoes((lista) => lista.filter((_, j) => j !== i))} className="rounded-lg p-2 text-text-tertiary hover:bg-danger/10 hover:text-danger">
                      <X size={15} />
                    </button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <Input
                    value={novaOpcao}
                    className="h-10"
                    placeholder="Nova opção"
                    onChange={(e) => setNovaOpcao(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); adicionarOpcao(); } }}
                  />
                  <Button variant="ghost" onClick={adicionarOpcao} disabled={!novaOpcao.trim()}>
                    <Plus size={15} /> Adicionar
                  </Button>
                </div>
              </div>
              {editandoExistente && <p className="mt-2 text-[12px] text-text-tertiary">Renomear uma opção atualiza o nome em todos os cadastros. Remover uma opção não apaga o que já foi escolhido.</p>}
            </div>
          )}

          <div>
            <Label htmlFor="cf-ajuda">Texto de ajuda (opcional)</Label>
            <Input id="cf-ajuda" value={ajuda} onChange={(e) => setAjuda(e.target.value)} placeholder="Aparece abaixo do campo" />
          </div>

          {entity === "deal" && funis.length > 1 && (
            <div>
              <Label htmlFor="cf-funil">Onde aparece</Label>
              <Select id="cf-funil" value={funilId} onChange={(e) => setFunilId(e.target.value)}>
                <option value="">Em todos os funis</option>
                {funis.map((f) => (
                  <option key={f.id} value={f.id}>Só no funil {f.name}</option>
                ))}
              </Select>
            </div>
          )}

          <div className="flex flex-col gap-3 rounded-2xl bg-surface-2 p-4">
            <label className="flex items-center justify-between gap-4 text-[13.5px] text-text-primary">
              <span>
                Preenchimento obrigatório
                <span className="block text-[12px] text-text-tertiary">Ao criar ou editar à mão, não deixa salvar vazio. O agente de IA nunca é bloqueado por isto.</span>
              </span>
              <Switch checked={obrigatorio} onCheckedChange={setObrigatorio} />
            </label>
            {entity === "deal" && (
              <label className="flex items-center justify-between gap-4 text-[13.5px] text-text-primary">
                <span>
                  Mostrar no cartão do funil
                  <span className="block text-[12px] text-text-tertiary">Aparece como etiqueta no cartão. Use com moderação para o cartão não ficar cheio.</span>
                </span>
                <Switch checked={noCartao} onCheckedChange={setNoCartao} />
              </label>
            )}
          </div>

          <div>
            <Label>Como vai aparecer</Label>
            <div className="rounded-2xl border border-dashed border-border-default p-4">
              <Label htmlFor="cf-previa" className="mb-1.5">
                {previa.label}
                {obrigatorio && <span className="ml-1 text-danger">*</span>}
              </Label>
              <CampoEditor id="cf-previa" def={previa} valor={valorPrevia} onChange={setValorPrevia} />
              {ajuda && <p className="mt-1.5 text-[12px] text-text-tertiary">{ajuda}</p>}
            </div>
          </div>

          {erro && <p className="text-[13px] text-danger">{erro}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={aoFechar}>Cancelar</Button>
            <Button onClick={salvar} disabled={busy || !label.trim() || (info.comOpcoes && previa.options.length === 0)}>
              {busy && <Loader2 size={15} className="animate-spin" />} {editandoExistente ? "Salvar" : "Criar campo"}
            </Button>
          </div>
        </div>
      </ModalContent>
    </Modal>
  );
}
