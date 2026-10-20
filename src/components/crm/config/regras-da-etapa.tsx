"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, Input, Label, Textarea } from "@/components/ui/input";
import { IconButton } from "@/components/ui/icon-button";
import { Notice } from "@/components/ui/notice";
import { ListaOrdenavel } from "@/components/crm/config/lista-ordenavel";
import type { DefinicaoDeCampo } from "@/lib/custom-fields";
import {
  CAMPOS_PADRAO,
  DIAS_PARADO_MAXIMO,
  ORIENTACAO_MAXIMA,
  type MotivoDePerda,
  type RegraDaEtapa,
} from "@/lib/regras-de-etapa";

// ---------------------------------------------------------------------------
// Configuração das regras por etapa (Personalizar o CRM → Funis e etapas):
// campos exigidos ao ENTRAR na etapa (nunca na criação), se ela pode ser
// pulada, prazo de "parado" e a orientação. E os motivos de perda do funil.
// ---------------------------------------------------------------------------

async function salvar(url: string, corpo: unknown): Promise<string | null> {
  try {
    const res = await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    if (res.ok) return null;
    const d = await res.json().catch(() => ({}));
    return typeof d.error === "string" ? d.error : "Não foi possível salvar.";
  } catch {
    return "Sem conexão. Tente de novo.";
  }
}

/** Resumo curto da regra para a linha da etapa ("2 obrigatórios · parado em 7 dias"). */
export function resumoDaRegra(regra: RegraDaEtapa | undefined, tipo: string): string {
  if (!regra) return "";
  const partes: string[] = [];
  const n = regra.camposObrigatorios.length;
  if (n) partes.push(`${n} ${n === 1 ? "obrigatório" : "obrigatórios"}`);
  if (n && !regra.podeSerPulada) partes.push("não pode ser pulada");
  if (tipo === "open") partes.push(regra.diasParado ? `parado em ${regra.diasParado} dias` : "nunca fica parado");
  if (regra.orientacao) partes.push("com orientação");
  return partes.join(" · ");
}

export function RegrasDaEtapaEditor({
  funilId,
  etapa,
  regra,
  defs,
  onSalvo,
}: {
  funilId: string;
  etapa: { id: string; name: string; type: string };
  regra: RegraDaEtapa;
  defs: DefinicaoDeCampo[];
  onSalvo: () => void;
}) {
  const [campos, setCampos] = React.useState<string[]>(regra.camposObrigatorios);
  const [podeSerPulada, setPodeSerPulada] = React.useState(regra.podeSerPulada);
  const [dias, setDias] = React.useState(regra.diasParado ? String(regra.diasParado) : "");
  const [orientacao, setOrientacao] = React.useState(regra.orientacao);
  const [erro, setErro] = React.useState<string | null>(null);
  const [salvando, setSalvando] = React.useState(false);
  const [salvo, setSalvo] = React.useState(false);
  const aberta = etapa.type === "open";
  const perda = etapa.type === "lost";
  const id = `regra-${etapa.id}`;

  const opcoes = [
    ...CAMPOS_PADRAO.map((c) => ({ id: c.id as string, rotulo: c.rotulo })),
    ...defs.map((d) => ({ id: `cf:${d.key}`, rotulo: d.label })),
  ];
  const marcar = (c: string, v: boolean) => setCampos((atual) => (v ? [...new Set([...atual, c])] : atual.filter((x) => x !== c)));

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    const falha = await salvar(`/api/pipelines/${funilId}/regras`, {
      stageId: etapa.id,
      camposObrigatorios: perda ? [] : campos,
      podeSerPulada,
      diasParado: aberta ? dias.trim() || null : null,
      orientacao,
    });
    setSalvando(false);
    setErro(falha);
    if (!falha) {
      setSalvo(true);
      setTimeout(() => setSalvo(false), 1200);
      onSalvo();
    }
  }

  return (
    <form onSubmit={enviar} className="mt-2 flex flex-col gap-4 rounded-lg border border-border-subtle bg-panel p-3">
      {!perda && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-small font-medium text-text-primary">Campos obrigatórios ao entrar em {etapa.name}</legend>
          <p className="text-caption text-text-tertiary">
            Nunca na criação do negócio: só ao mover para esta etapa. Faltou algo, a tela pede só esses campos antes de mover.
          </p>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {opcoes.map((o) => (
              <label key={o.id} className="flex cursor-pointer items-center gap-2 text-small text-text-primary">
                <Checkbox checked={campos.includes(o.id)} onCheckedChange={(v) => marcar(o.id, v === true)} />
                <span className="truncate">{o.rotulo}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {aberta && (
        <label className="flex cursor-pointer items-start gap-2 text-small text-text-primary">
          <Checkbox checked={!podeSerPulada} onCheckedChange={(v) => setPodeSerPulada(v !== true)} className="mt-0.5" />
          <span>
            Não pode ser pulada
            <span className="block text-caption text-text-tertiary">
              Quem passar por cima desta etapa (ex.: de Novo direto para Negociação, ou para Ganho) também precisa dos campos dela.
            </span>
          </span>
        </label>
      )}

      {aberta && (
        <Field label="Dias sem atividade para ficar parado" hint="Vazio = nunca fica parado. Atividade: tarefa concluída, nota, mensagem, edição de campo.">
          <Input
            id={`${id}-dias`}
            type="number"
            min={1}
            max={DIAS_PARADO_MAXIMO}
            value={dias}
            onChange={(e) => setDias(e.target.value)}
            className="w-28"
          />
        </Field>
      )}

      <Field label="O que fazer nesta etapa (opcional)" hint="Aparece no cabeçalho da coluna e na ficha do negócio.">
        <Textarea id={`${id}-orientacao`} rows={2} maxLength={ORIENTACAO_MAXIMA} value={orientacao} onChange={(e) => setOrientacao(e.target.value)} />
      </Field>

      {erro && <Notice tone="danger">{erro}</Notice>}
      <div className="flex items-center justify-end gap-2">
        {salvo && <span className="text-caption text-success">Salvo</span>}
        <Button type="submit" size="sm" variant="secondary" loading={salvando}>
          Salvar regras da etapa
        </Button>
      </div>
    </form>
  );
}

interface LinhaDeMotivo {
  id: string;
  rotulo: string;
  exigeNota: boolean;
}

let sequencia = 0;
const novoId = () => `novo-${Date.now()}-${++sequencia}`;

export function MotivosDePerdaEditor({
  funilId,
  motivos,
  onSalvo,
}: {
  funilId: string;
  motivos: MotivoDePerda[];
  onSalvo: () => void;
}) {
  const [linhas, setLinhas] = React.useState<LinhaDeMotivo[]>(motivos.map((m) => ({ ...m })));
  const [novo, setNovo] = React.useState("");
  const [erro, setErro] = React.useState<string | null>(null);
  const [salvando, setSalvando] = React.useState(false);
  const [salvo, setSalvo] = React.useState(false);

  const mudar = (id: string, p: Partial<LinhaDeMotivo>) => setLinhas((ls) => ls.map((l) => (l.id === id ? { ...l, ...p } : l)));

  async function enviar() {
    setSalvando(true);
    setErro(null);
    const falha = await salvar(`/api/pipelines/${funilId}/motivos`, {
      // Linha nova não leva id: o servidor cria.
      motivos: linhas.map((l) => ({ ...(l.id.startsWith("novo-") ? {} : { id: l.id }), rotulo: l.rotulo, exigeNota: l.exigeNota })),
    });
    setSalvando(false);
    setErro(falha);
    if (!falha) {
      setSalvo(true);
      setTimeout(() => setSalvo(false), 1200);
      onSalvo();
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <ListaOrdenavel itens={linhas} onReordenar={setLinhas}>
        {(l, alca) => (
          <div key={l.id} className="flex items-center gap-2 rounded-lg border border-border-subtle bg-panel px-2 py-1.5">
            {alca}
            <Input
              aria-label="Nome do motivo"
              value={l.rotulo}
              maxLength={80}
              onChange={(e) => mudar(l.id, { rotulo: e.target.value })}
              className="min-w-0 flex-1"
            />
            <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-caption text-text-secondary">
              <Checkbox checked={l.exigeNota} onCheckedChange={(v) => mudar(l.id, { exigeNota: v === true })} />
              Pede nota
            </label>
            <IconButton
              aria-label={`Tirar o motivo ${l.rotulo}`}
              size="sm"
              disabled={linhas.length <= 1}
              onClick={() => setLinhas((ls) => ls.filter((x) => x.id !== l.id))}
            >
              <Trash2 />
            </IconButton>
          </div>
        )}
      </ListaOrdenavel>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const rotulo = novo.trim();
          if (!rotulo) return;
          setLinhas((ls) => [...ls, { id: novoId(), rotulo, exigeNota: false }]);
          setNovo("");
        }}
      >
        <Label htmlFor={`novo-motivo-${funilId}`} className="sr-only">
          Novo motivo de perda
        </Label>
        <Input id={`novo-motivo-${funilId}`} value={novo} maxLength={80} onChange={(e) => setNovo(e.target.value)} placeholder="Novo motivo" />
        <Button type="submit" variant="secondary" disabled={!novo.trim()}>
          <Plus size={14} aria-hidden="true" /> Adicionar
        </Button>
      </form>
      {erro && <Notice tone="danger">{erro}</Notice>}
      <div className="flex items-center justify-end gap-2">
        {salvo && <span className="text-caption text-success">Salvo</span>}
        <Button size="sm" variant="secondary" loading={salvando} onClick={enviar}>
          Salvar motivos
        </Button>
      </div>
    </div>
  );
}
