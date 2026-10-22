"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { ExternalLink, ThumbsDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Label, Textarea, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Modal, ModalContent } from "@/components/ui/modal";
import { Notice } from "@/components/ui/notice";
import { useToast } from "@/components/ui/toast";
import { CampoEditor } from "@/components/crm/campos-personalizados";
import { BuscaDeVinculo } from "@/components/crm/negocio/pecas";
import { buscarContatos, buscarEmpresas } from "@/components/crm/negocio/vinculos";
import type { DefinicaoDeCampo } from "@/lib/custom-fields";
import {
  corpoDoModal,
  montarCamposDoModal,
  type CampoDoModal,
  type CampoFaltando,
  type MotivoDePerda,
  type ValoresDoModal,
} from "@/lib/regras-de-etapa";
import { MS_PARA_DESFAZER, corpoParaDesfazer, tituloDaMudanca } from "@/lib/lixeira";
import { avisarNaIlha, pulsar } from "@/lib/fundo/eventos";

// ---------------------------------------------------------------------------
// Mudança de etapa na tela, igual em todo lugar (quadro, prévia, ficha):
// manda o PATCH; se o servidor responder 422 com os campos que faltam, abre
// "Complete para mover" só com eles (salva e move numa ação; cancelar devolve
// o cartão); para a etapa de perda, pede o motivo antes. As regras moram no
// servidor (moveDealStage) — aqui só se mostra o que ele pediu.
//
// Com `de` (a etapa de onde sai), depois de mover aparece o toast com
// "Desfazer": volta para `de` pelo mesmo PATCH (mesmas regras; ganho/perdido
// reabrem na etapa anterior). Com `naIlha`, o aviso vai para a ilha da casca
// (v5) e o fundo pulsa a partir do cartão, no lugar do toast.
// ---------------------------------------------------------------------------

export interface EtapaDoMovimento {
  id: string;
  name: string;
  type: string;
}

export interface PedidoDeMudanca {
  dealId: string;
  nome: string;
  pipelineId: string;
  para: EtapaDoMovimento;
  /** Campos personalizados do funil (para o modal). */
  defs: DefinicaoDeCampo[];
  /** Corpo extra do PATCH (ex.: { reabrir: true }). */
  extra?: Record<string, unknown>;
  /** Etapa de onde o negócio sai: com ela, o toast oferece "Desfazer". */
  de?: EtapaDoMovimento;
  /** Depois de desfazer (recarregar a tela). */
  aoDesfazer?: () => void;
}

export type ResultadoDaTentativa = "movido" | "aguardando" | "erro";

type RespostaDoServidor =
  | { ok: true }
  | { ok: false; status: number; erro: string; codigo?: string; faltando?: CampoFaltando[] };

export async function enviarMudanca(dealId: string, corpo: Record<string, unknown>): Promise<RespostaDoServidor> {
  try {
    const res = await fetch(`/api/deals/${dealId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    if (res.ok) return { ok: true };
    const d = await res.json().catch(() => ({}));
    return {
      ok: false,
      status: res.status,
      erro: typeof d.error === "string" ? d.error : "Não foi possível mover o negócio.",
      codigo: typeof d.codigo === "string" ? d.codigo : undefined,
      faltando: Array.isArray(d.faltando) ? d.faltando : undefined,
    };
  } catch {
    return { ok: false, status: 0, erro: "Sem conexão. Tente de novo." };
  }
}

/** Motivos de perda do funil (padrão quando o funil não tem os seus). */
export async function buscarMotivos(pipelineId: string): Promise<MotivoDePerda[]> {
  const res = await fetch(`/api/pipelines/${pipelineId}/regras`).catch(() => null);
  const d = res?.ok ? await res.json().catch(() => null) : null;
  return Array.isArray(d?.motivos) ? d.motivos : [];
}

type Aberto =
  | { tipo: "perda"; pedido: PedidoDeMudanca; resolver: (r: ResultadoDaTentativa) => void }
  | { tipo: "completar"; pedido: PedidoDeMudanca; faltando: CampoFaltando[]; corpo: Record<string, unknown>; resolver: (r: ResultadoDaTentativa) => void };

/**
 * Hook da mudança de etapa. `mover` devolve "movido", "erro" ou, quando abriu
 * um modal, espera a pessoa: "movido" se salvou, "erro" se cancelou.
 * `elementos` são os modais (renderize uma vez na tela).
 */
export function useMudancaDeEtapa({
  onErro,
  naIlha,
}: {
  onErro: (mensagem: string) => void;
  /** Avisa na ilha (com Desfazer) e pulsa o fundo a partir do elemento que esta função devolve. */
  naIlha?: { elemento: (dealId: string) => Element | null };
}) {
  const [aberto, setAberto] = React.useState<Aberto | null>(null);
  const toast = useToast();
  const onErroRef = React.useRef(onErro);
  const naIlhaRef = React.useRef(naIlha);
  React.useEffect(() => {
    onErroRef.current = onErro;
    naIlhaRef.current = naIlha;
  });

  const tentar = React.useCallback(async (pedido: PedidoDeMudanca, corpo: Record<string, unknown>): Promise<ResultadoDaTentativa> => {
    const r = await enviarMudanca(pedido.dealId, corpo);
    if (r.ok) return "movido";
    if (r.status === 422 && r.codigo === "campos_obrigatorios" && r.faltando?.length) {
      return new Promise((resolver) => setAberto({ tipo: "completar", pedido, faltando: r.faltando!, corpo, resolver }));
    }
    onErroRef.current(r.erro);
    return "erro";
  }, []);

  const oferecerDesfazer = React.useCallback(
    (pedido: PedidoDeMudanca) => {
      const corpo = corpoParaDesfazer(pedido.de, pedido.para);
      const ilha = naIlhaRef.current;
      if (ilha) {
        // O cartão já está na coluna nova (a tela move antes da resposta).
        pulsar(ilha.elemento(pedido.dealId), 1.2);
        const de = pedido.de;
        avisarNaIlha({
          titulo: pedido.para.id ? `${pedido.nome} foi para ${pedido.para.name}` : `${pedido.nome} foi reaberto`,
          detalhe: "por você · agora",
          duracao: MS_PARA_DESFAZER,
          acao:
            corpo && de
              ? {
                  rotulo: "Desfazer",
                  // Volta pela mesma tentativa do mover (mesmo PATCH, mesmas regras e o
                  // "Complete para mover" se a etapa de volta pedir campo).
                  aoClicar: async () => {
                    const volta: PedidoDeMudanca = { ...pedido, para: de, de: pedido.para, extra: undefined };
                    const r = await tentar(volta, corpo);
                    if (r !== "movido") return;
                    pulsar(ilha.elemento(pedido.dealId), 1);
                    avisarNaIlha({ titulo: `${pedido.nome} voltou para ${de.name}`, detalhe: "por você · agora" });
                    pedido.aoDesfazer?.();
                  },
                }
              : undefined,
        });
        return;
      }
      if (!corpo) return;
      toast({
        title: tituloDaMudanca(pedido.para),
        durationMs: MS_PARA_DESFAZER,
        action: {
          label: "Desfazer",
          onClick: async () => {
            const r = await enviarMudanca(pedido.dealId, corpo);
            if (!r.ok) {
              toast({ title: "Não deu para desfazer", description: r.erro, tone: "danger" });
              return;
            }
            toast({ title: `Voltou para ${pedido.de?.name ?? "a etapa anterior"}`, tone: "success" });
            pedido.aoDesfazer?.();
          },
        },
      });
    },
    [toast, tentar]
  );

  const mover = React.useCallback(
    async (pedido: PedidoDeMudanca): Promise<ResultadoDaTentativa> => {
      const r: ResultadoDaTentativa =
        pedido.para.type === "lost"
          ? // Perdido pede o motivo antes de qualquer coisa.
            await new Promise((resolver) => setAberto({ tipo: "perda", pedido, resolver }))
          : // Sem etapa (só { reabrir: true }): o servidor volta para a etapa de onde o negócio saiu.
            await tentar(pedido, { ...(pedido.para.id ? { stageId: pedido.para.id } : {}), ...pedido.extra });
      if (r === "movido") oferecerDesfazer(pedido);
      return r;
    },
    [tentar, oferecerDesfazer]
  );

  const fechar = (r: ResultadoDaTentativa) => {
    aberto?.resolver(r);
    setAberto(null);
  };

  const elementos =
    aberto?.tipo === "perda" ? (
      <MarcarPerdido
        nome={aberto.pedido.nome}
        pipelineId={aberto.pedido.pipelineId}
        onCancelar={() => fechar("erro")}
        onConfirmar={async (perda) => {
          const pedido = aberto.pedido;
          const resolver = aberto.resolver;
          setAberto(null);
          resolver(await tentar(pedido, { stageId: pedido.para.id, ...pedido.extra, ...perda }));
        }}
      />
    ) : aberto?.tipo === "completar" ? (
      <CompleteParaMover
        key={aberto.faltando.map((f) => f.campo).join(",")}
        pedido={aberto.pedido}
        faltando={aberto.faltando}
        corpoBase={aberto.corpo}
        onCancelar={() => fechar("erro")}
        onMovido={() => fechar("movido")}
      />
    ) : null;

  return { mover, elementos };
}

// ── Modal "Marcar como perdido" ────────────────────────────────────────────

export function MarcarPerdido({
  nome,
  pipelineId,
  onCancelar,
  onConfirmar,
}: {
  nome: string;
  pipelineId: string;
  onCancelar: () => void;
  onConfirmar: (perda: { motivoId: string; notaDaPerda: string; followUpDias?: number }) => Promise<void> | void;
}) {
  const [motivos, setMotivos] = React.useState<MotivoDePerda[] | null>(null);
  const [motivoId, setMotivoId] = React.useState("");
  const [nota, setNota] = React.useState("");
  const [comFollowUp, setComFollowUp] = React.useState(false);
  const [dias, setDias] = React.useState("30");
  const [enviando, setEnviando] = React.useState(false);

  React.useEffect(() => {
    let vivo = true;
    buscarMotivos(pipelineId).then((m) => vivo && setMotivos(m));
    return () => {
      vivo = false;
    };
  }, [pipelineId]);

  const escolhido = motivos?.find((m) => m.id === motivoId);
  const precisaNota = !!escolhido?.exigeNota;
  const diasValidos = !comFollowUp || (Number.isInteger(Number(dias)) && Number(dias) >= 1 && Number(dias) <= 365);
  const pode = !!escolhido && (!precisaNota || !!nota.trim()) && diasValidos && !enviando;

  return (
    <Modal open onOpenChange={(v) => !v && onCancelar()}>
      <ModalContent
        title="Marcar como perdido"
        description={`${nome}. O motivo entra no relatório de perdas e ajuda a vender melhor da próxima vez.`}
        footer={
          <>
            <Button variant="ghost" onClick={onCancelar}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              form="form-perda"
              type="submit"
              disabled={!pode}
              loading={enviando}
            >
              <ThumbsDown size={14} aria-hidden="true" /> Marcar como perdido
            </Button>
          </>
        }
      >
        <form
          id="form-perda"
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!pode || !escolhido) return;
            setEnviando(true);
            await onConfirmar({ motivoId: escolhido.id, notaDaPerda: nota.trim(), ...(comFollowUp ? { followUpDias: Number(dias) } : {}) });
            setEnviando(false);
          }}
        >
          <Field label="Motivo da perda" required>
            <Select id="perda-motivo" value={motivoId} onChange={(e) => setMotivoId(e.target.value)} disabled={!motivos} autoFocus>
              <option value="">{motivos ? "Escolha o motivo" : "Carregando..."}</option>
              {(motivos ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.rotulo}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={precisaNota ? "Nota" : "Nota (opcional)"} required={precisaNota} hint={precisaNota ? `“${escolhido?.rotulo}” pede uma explicação.` : undefined}>
            <Textarea id="perda-nota" rows={3} maxLength={500} value={nota} onChange={(e) => setNota(e.target.value)} />
          </Field>
          <div className="flex flex-col gap-2">
            <label className="flex cursor-pointer items-center gap-2 text-small text-text-primary">
              <Checkbox checked={comFollowUp} onCheckedChange={(v) => setComFollowUp(v === true)} />
              Criar tarefa para retomar o contato
            </label>
            {comFollowUp && (
              <div className="flex items-center gap-2 pl-6 text-small text-text-secondary">
                <Label htmlFor="perda-dias" className="mb-0 font-normal text-text-secondary">
                  Em
                </Label>
                <Input
                  id="perda-dias"
                  type="number"
                  min={1}
                  max={365}
                  value={dias}
                  onChange={(e) => setDias(e.target.value)}
                  className="w-20"
                  aria-invalid={!diasValidos || undefined}
                />
                dias
              </div>
            )}
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
}

// ── Modal "Complete para mover" ────────────────────────────────────────────

interface Membro {
  id: string;
  name: string;
  email: string;
}

export function CompleteParaMover({
  pedido,
  faltando,
  corpoBase,
  onCancelar,
  onMovido,
}: {
  pedido: PedidoDeMudanca;
  faltando: CampoFaltando[];
  /** O corpo da tentativa (etapa, reabrir, motivo da perda): vai junto com os campos. */
  corpoBase: Record<string, unknown>;
  onCancelar: () => void;
  onMovido: () => void;
}) {
  const [lista, setLista] = React.useState(faltando);
  // Tela que não tem os campos do funil à mão (painel da conversa): busca aqui.
  const [defsBuscadas, setDefsBuscadas] = React.useState<DefinicaoDeCampo[] | null>(null);
  const defs = defsBuscadas ?? pedido.defs;
  const faltaDef = lista.some((f) => f.campo.startsWith("cf:") && !defs.some((d) => `cf:${d.key}` === f.campo));
  React.useEffect(() => {
    if (!faltaDef || defsBuscadas) return;
    fetch(`/api/custom-fields?entity=deal&pipelineId=${encodeURIComponent(pedido.pipelineId)}`)
      .then((r) => (r.ok ? r.json() : { fields: [] }))
      .then((d) => setDefsBuscadas(d.fields ?? []))
      .catch(() => setDefsBuscadas([]));
  }, [faltaDef, defsBuscadas, pedido.pipelineId]);
  const campos = React.useMemo(() => montarCamposDoModal(lista, defs), [lista, defs]);
  const [valores, setValores] = React.useState<ValoresDoModal>({});
  const [nomes, setNomes] = React.useState<Record<string, string>>({});
  const [membros, setMembros] = React.useState<Membro[]>([]);
  const [erro, setErro] = React.useState<string | null>(null);
  const [enviando, setEnviando] = React.useState(false);
  const precisaMembros = campos.some((c) => c.tipo === "responsavel");

  React.useEffect(() => {
    if (!precisaMembros) return;
    fetch("/api/members")
      .then((r) => (r.ok ? r.json() : { members: [] }))
      .then((d) => setMembros(d.members ?? []))
      .catch(() => {});
  }, [precisaMembros]);

  const definir = (campo: string, v: unknown) => setValores((x) => ({ ...x, [campo]: v }));
  const soNaFicha = campos.filter((c) => c.soNaFicha);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    const r = await enviarMudanca(pedido.dealId, { ...corpoBase, ...corpoDoModal(campos, valores) });
    setEnviando(false);
    if (r.ok) return onMovido();
    if (r.status === 422 && r.codigo === "campos_obrigatorios" && r.faltando?.length) {
      setLista(r.faltando);
      setErro("Ainda faltam campos para mover.");
      return;
    }
    setErro(r.erro);
  }

  return (
    <Modal open onOpenChange={(v) => !v && onCancelar()}>
      <ModalContent
        title="Complete para mover"
        description={`Para ${pedido.nome} entrar em ${pedido.para.name || lista[lista.length - 1]?.etapa || "a etapa"}, preencha:`}
        footer={
          <>
            <Button variant="ghost" onClick={onCancelar}>
              Cancelar
            </Button>
            <Button variant="primary" type="submit" form="form-completar" loading={enviando} disabled={campos.every((c) => c.soNaFicha)}>
              Salvar e mover
            </Button>
          </>
        }
      >
        <form id="form-completar" className="flex flex-col gap-4" onSubmit={salvar}>
          {erro && <Notice tone="danger">{erro}</Notice>}
          {campos
            .filter((c) => !c.soNaFicha)
            .map((c) => (
              <CampoDoModalEditor
                key={c.campo}
                campo={c}
                defs={defs}
                valor={valores[c.campo]}
                nome={nomes[c.campo]}
                membros={membros}
                onChange={(v, nome) => {
                  definir(c.campo, v);
                  if (nome !== undefined) setNomes((n) => ({ ...n, [c.campo]: nome }));
                }}
              />
            ))}
          {soNaFicha.length > 0 && (
            <Notice tone="warning">
              {soNaFicha.map((c) => c.rotulo).join(", ")}: adicione na ficha do negócio e mova de novo.{" "}
              <Link href={`/negocios/${pedido.dealId}`} className="inline-flex items-center gap-1 font-medium underline">
                Abrir a ficha <ExternalLink size={12} aria-hidden="true" />
              </Link>
            </Notice>
          )}
        </form>
      </ModalContent>
    </Modal>
  );
}

function CampoDoModalEditor({
  campo,
  defs,
  valor,
  nome,
  membros,
  onChange,
}: {
  campo: CampoDoModal;
  defs: DefinicaoDeCampo[];
  valor: unknown;
  nome?: string;
  membros: Membro[];
  onChange: (v: unknown, nome?: string) => void;
}) {
  const id = `completar-${campo.campo.replace(/[^a-z0-9]/gi, "-")}`;
  const dica = `Pedido por ${campo.etapas.join(" e ")}.`;
  const [buscando, setBuscando] = React.useState(false);
  // Nomes da última busca (para mostrar quem foi escolhido sem outra consulta).
  const nomesDaBusca = React.useRef(new Map<string, string>());

  switch (campo.tipo) {
    case "valor":
      return (
        <Field label={campo.rotulo} required hint={dica}>
          <Input id={id} inputMode="decimal" placeholder="0,00" value={String(valor ?? "")} onChange={(e) => onChange(e.target.value)} autoFocus />
        </Field>
      );
    case "data":
      return (
        <Field label={campo.rotulo} required hint={dica}>
          <Input id={id} type="date" value={String(valor ?? "")} onChange={(e) => onChange(e.target.value)} />
        </Field>
      );
    case "responsavel":
      return (
        <Field label={campo.rotulo} required hint={dica}>
          <Select id={id} value={String(valor ?? "")} onChange={(e) => onChange(e.target.value)}>
            <option value="">Escolha quem cuida</option>
            {membros.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name || m.email}
              </option>
            ))}
          </Select>
        </Field>
      );
    case "contato":
    case "empresa": {
      const ehContato = campo.tipo === "contato";
      return (
        <div className="flex flex-col gap-1">
          <Label>{campo.rotulo}</Label>
          {buscando ? (
            <BuscaDeVinculo
              rotulo={ehContato ? "Buscar contato" : "Buscar empresa"}
              placeholder={ehContato ? "Nome, e-mail ou telefone" : "Nome ou CNPJ"}
              buscar={async (q) => {
                const r = await (ehContato ? buscarContatos(q) : buscarEmpresas(q));
                nomesDaBusca.current = new Map(r.map((o) => [o.id, o.titulo]));
                return r;
              }}
              onEscolher={(escolhido) => {
                onChange(escolhido, nomesDaBusca.current.get(escolhido) ?? "");
                setBuscando(false);
              }}
              onFechar={() => setBuscando(false)}
            />
          ) : (
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-small text-text-primary">{valor ? nome || "Escolhido" : <span className="text-text-tertiary">Nenhum</span>}</span>
              <Button type="button" variant="secondary" size="sm" onClick={() => setBuscando(true)}>
                {valor ? "Trocar" : ehContato ? "Vincular contato" : "Vincular empresa"}
              </Button>
            </div>
          )}
          <p className="text-caption text-text-tertiary">{dica}</p>
        </div>
      );
    }
    case "personalizado": {
      const def = defs.find((d) => `cf:${d.key}` === campo.campo);
      if (!def) return null;
      return (
        <Field label={campo.rotulo} required hint={dica}>
          <CampoEditor id={id} def={def} valor={valor as string | boolean | string[] | undefined} onChange={(v) => onChange(v)} />
        </Field>
      );
    }
    default:
      return null;
  }
}
