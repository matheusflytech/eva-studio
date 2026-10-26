"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, ChevronRight, Plus, Trash2, Upload } from "lucide-react";
import type { Node } from "@xyflow/react";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { generateId } from "@/lib/utils";
import type { BlockAction, BlockCard, BlockCondition, BlockContent, FlowNodeData } from "./flow-node";
import { getBlockDefault } from "./block-defaults";
import { PALETTE_GROUPS } from "./palette-groups";
import { IconeDoBloco } from "./icone-do-bloco";
import { CaptureConfig } from "./capture-config";
import type { IconKey } from "./icon-registry";

// ---------------------------------------------------------------------------
// Painel do Bloco do Studio. Ordem no motor (flow-engine.ts): ações de entrada
// → conteúdo → espera a resposta → ações de saída → saída. As ações guardam
// os mesmos dados dos blocos de ação e são editadas pelo mesmo inspetor.
// ---------------------------------------------------------------------------

export type AbaDoBloco = "conteudo" | "saidas" | "acoes";

const ACOES: IconKey[] = [
  "variable",
  "http",
  "email",
  "crm-deal",
  "crm-stage",
  "crm-task",
  "crm-tag",
  "crm-update",
  "crm-note",
  "crm-lookup",
  "track-event",
];
// "Registrar evento" só existe dentro do Bloco, por isso não vem da paleta.
const ROTULO = new Map<string, string>([...PALETTE_GROUPS.flatMap((g) => g.items.map((i) => [i.key, i.label] as const)), ["track-event", "Registrar evento"]]);

/** Desenha o inspetor de uma ação (o NodeInspector, vindo de fora para não haver import circular). */
export type InspetorDeAcao = (props: {
  node: Node<FlowNodeData>;
  onChange: (data: Partial<FlowNodeData>) => void;
  onDelete: () => void;
  onClose: () => void;
}) => React.ReactNode;

function mover<T>(lista: T[], i: number, delta: number): T[] {
  const j = i + delta;
  if (j < 0 || j >= lista.length) return lista;
  const nova = [...lista];
  [nova[i], nova[j]] = [nova[j], nova[i]];
  return nova;
}

export function PainelDoBloco({
  data,
  aba,
  onChange,
  inspetorDaAcao,
}: {
  data: FlowNodeData;
  aba: AbaDoBloco;
  onChange: (patch: Partial<FlowNodeData>) => void;
  inspetorDaAcao: InspetorDeAcao;
}) {
  // Ação aberta: qual lista e qual id. O inspetor dela cobre o painel.
  const [aberta, setAberta] = React.useState<{ lista: "entryActions" | "exitActions"; id: string } | null>(null);
  const acao = aberta ? (data[aberta.lista] ?? []).find((a) => a.id === aberta.id) : undefined;

  if (aba === "acoes" && aberta && acao) {
    const lista = aberta.lista;
    const trocar = (fn: (atuais: BlockAction[]) => BlockAction[]) => onChange({ [lista]: fn(data[lista] ?? []) });
    return inspetorDaAcao({
        node: { id: acao.id, position: { x: 0, y: 0 }, data: acao.data },
        onChange: (patch) => trocar((atuais) => atuais.map((a) => (a.id === acao.id ? { ...a, data: { ...a.data, ...patch } } : a))),
        onDelete: () => {
          trocar((atuais) => atuais.filter((a) => a.id !== acao.id));
          setAberta(null);
        },
        onClose: () => setAberta(null),
    });
  }

  if (aba === "saidas") return <CondicoesDoBloco data={data} onChange={onChange} />;
  if (aba === "acoes") {
    return (
      <div className="flex flex-col gap-5">
        <ListaDeAcoes
          titulo="Ao entrar no bloco"
          ajuda="Antes de mandar o conteúdo."
          acoes={data.entryActions ?? []}
          onChange={(entryActions) => onChange({ entryActions })}
          abrir={(id) => setAberta({ lista: "entryActions", id })}
        />
        <ListaDeAcoes
          titulo="Ao sair do bloco"
          ajuda={data.waitForReply ? "Depois da resposta, antes de escolher a saída." : "Depois do conteúdo, antes de escolher a saída."}
          acoes={data.exitActions ?? []}
          onChange={(exitActions) => onChange({ exitActions })}
          abrir={(id) => setAberta({ lista: "exitActions", id })}
        />
      </div>
    );
  }
  return <ConteudoDoBloco data={data} onChange={onChange} />;
}

function ConteudoDoBloco({ data, onChange }: { data: FlowNodeData; onChange: (patch: Partial<FlowNodeData>) => void }) {
  const itens = data.blockContents ?? [];
  const mudar = (i: number, parte: Partial<BlockContent>) =>
    onChange({ blockContents: itens.map((c, j) => (j === i ? { ...c, ...parte } : c)) });
  const adicionar = (type: BlockContent["type"]) =>
    onChange({
      blockContents: [
        ...itens,
        type === "typing"
          ? { id: generateId(), type, seconds: 2 }
          : type === "media"
            ? { id: generateId(), type, mediaType: "image" }
            : type === "carousel"
              ? { id: generateId(), type, cards: [novoCard()] }
              : { id: generateId(), type },
      ],
    });

  return (
    <div className="flex flex-col gap-3">
      <p className="text-caption text-text-tertiary">Mandado na ordem da lista. Use {"{variavel}"} para personalizar.</p>
      {itens.map((c, i) => (
        <div key={c.id} className="flex flex-col gap-2 rounded-[14px] border border-border-subtle bg-raised p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-caption font-medium uppercase tracking-wide text-text-tertiary">
              {ROTULO_DO_CONTEUDO[c.type]}
            </span>
            <span className="flex items-center">
              <BotaoPequeno rotulo="Subir" onClick={() => onChange({ blockContents: mover(itens, i, -1) })} disabled={i === 0}>
                <ArrowUp size={13} />
              </BotaoPequeno>
              <BotaoPequeno rotulo="Descer" onClick={() => onChange({ blockContents: mover(itens, i, 1) })} disabled={i === itens.length - 1}>
                <ArrowDown size={13} />
              </BotaoPequeno>
              <BotaoPequeno rotulo="Remover" perigo onClick={() => onChange({ blockContents: itens.filter((_, j) => j !== i) })}>
                <Trash2 size={13} />
              </BotaoPequeno>
            </span>
          </div>
          <CamposDoConteudo c={c} n={i + 1} mudar={(parte) => mudar(i, parte)} />
        </div>
      ))}
      <div className="grid grid-cols-2 gap-2">
        {(["text", "media", "link", "location", "carousel", "typing"] as const).map((t) => (
          <BotaoAdicionar key={t} onClick={() => adicionar(t)}>
            {ROTULO_DO_CONTEUDO[t]}
          </BotaoAdicionar>
        ))}
      </div>
      <p className="text-caption text-text-tertiary">
        Conteúdo vindo de uma API: chame a API numa ação de entrada, guarde numa variável e use {"{variavel}"} no texto.
      </p>

      <section className="flex flex-col gap-3 border-t border-border-subtle pt-4">
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-[14px] bg-raised px-3 py-2.5">
          <span>
            <span className="block text-small font-medium text-text-primary">Esperar resposta do cliente</span>
            <span className="block text-caption text-text-tertiary">
              {data.waitForReply ? "O último texto vira a pergunta; os botões vão junto com ele." : "O bloco manda o conteúdo e segue."}
            </span>
          </span>
          <Switch checked={!!data.waitForReply} onCheckedChange={(v) => onChange({ waitForReply: v })} aria-label="Esperar resposta do cliente" />
        </label>
        {data.waitForReply && (
          <label className="flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-text-secondary">
            <span className="whitespace-nowrap">Sem resposta em</span>
            <Input
              type="number"
              min={1}
              className="w-20"
              aria-label="Minutos sem resposta"
              placeholder="—"
              value={data.replyTimeoutMinutes ?? ""}
              onChange={(e) => {
                const n = Math.floor(Number(e.target.value));
                onChange({ replyTimeoutMinutes: n > 0 ? n : undefined });
              }}
            />
            <span>min, segue pela saída &quot;Não respondeu&quot;.</span>
          </label>
        )}
        {data.waitForReply && <CaptureConfig data={data} onChange={onChange} />}
      </section>
    </div>
  );
}

const ROTULO_DO_CONTEUDO: Record<BlockContent["type"], string> = {
  text: "Texto",
  typing: "Digitando…",
  media: "Mídia",
  link: "Link",
  location: "Localização",
  carousel: "Carrossel",
};

const novoCard = (): BlockCard => ({ id: generateId(), title: "", buttons: [] });

const TIPOS_DE_MIDIA: { value: NonNullable<BlockContent["mediaType"]>; label: string }[] = [
  { value: "image", label: "Imagem" },
  { value: "video", label: "Vídeo" },
  { value: "audio", label: "Áudio" },
  { value: "document", label: "Documento" },
  { value: "sticker", label: "Figurinha" },
];

/** Os campos de cada tipo de conteúdo. Texto aceita {variavel} em todos. */
function CamposDoConteudo({ c, n, mudar }: { c: BlockContent; n: number; mudar: (parte: Partial<BlockContent>) => void }) {
  if (c.type === "typing") {
    return (
      <label className="flex items-center gap-2 text-small text-text-secondary">
        Por
        <Input
          type="number"
          min={1}
          max={10}
          className="w-20"
          value={c.seconds ?? 2}
          onChange={(e) => mudar({ seconds: Math.min(10, Math.max(1, Number(e.target.value) || 1)) })}
        />
        segundos, antes da próxima mensagem (WhatsApp).
      </label>
    );
  }
  if (c.type === "media") {
    const urlRuim = !c.path && !!c.url?.trim() && !/^https?:\/\//i.test(c.url.trim()) && !c.url.trim().startsWith("{");
    return (
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <Select aria-label={`Tipo da mídia ${n}`} className="w-[130px] shrink-0" value={c.mediaType ?? "image"} onChange={(e) => mudar({ mediaType: e.target.value as BlockContent["mediaType"] })}>
            {TIPOS_DE_MIDIA.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </Select>
          {c.path ? (
            <span className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-[10px] bg-raised pl-3 text-small text-text-secondary">
              <span className="truncate">{c.fileName || "Arquivo enviado"}</span>
              <BotaoPequeno rotulo={`Tirar o arquivo ${n}`} perigo onClick={() => mudar({ path: undefined, fileName: undefined })}>
                <Trash2 size={13} aria-hidden="true" />
              </BotaoPequeno>
            </span>
          ) : (
            <Input aria-label={`Link do arquivo ${n}`} placeholder="https://… (link público)" value={c.url ?? ""} onChange={(e) => mudar({ url: e.target.value })} />
          )}
        </div>
        {!c.path && <EnviarArquivo n={n} tipo={c.mediaType ?? "image"} mudar={mudar} />}
        {urlRuim && <p className="text-caption text-warning">O link precisa começar com https://.</p>}
        {c.mediaType === "sticker" && (
          <p className="text-caption text-text-tertiary">Figurinha: imagem .webp de 512×512. Onde não existe figurinha, sai como imagem.</p>
        )}
        {c.mediaType === "document" && (
          <Input aria-label={`Nome do arquivo ${n}`} placeholder="Nome que o cliente vê (ex: catalogo.pdf)" value={c.fileName ?? ""} onChange={(e) => mudar({ fileName: e.target.value || undefined })} />
        )}
        {c.mediaType !== "audio" && c.mediaType !== "sticker" && (
          <Input aria-label={`Legenda ${n}`} placeholder="Legenda (opcional)" value={c.text ?? ""} onChange={(e) => mudar({ text: e.target.value })} />
        )}
      </div>
    );
  }
  if (c.type === "carousel") return <CamposDoCarrossel c={c} n={n} mudar={mudar} />;
  if (c.type === "link") {
    return (
      <div className="flex flex-col gap-2">
        <Input aria-label={`Texto do link ${n}`} placeholder="Texto (ex: Veja o catálogo)" value={c.text ?? ""} onChange={(e) => mudar({ text: e.target.value })} />
        <Input aria-label={`Endereço do link ${n}`} placeholder="https://…" value={c.url ?? ""} onChange={(e) => mudar({ url: e.target.value })} />
      </div>
    );
  }
  if (c.type === "location") {
    const numero = (v: string) => (v.trim() === "" || !Number.isFinite(Number(v)) ? undefined : Number(v));
    return (
      <div className="flex flex-col gap-2">
        <Input aria-label={`Nome do lugar ${n}`} placeholder="Nome do lugar (ex: Loja Centro)" value={c.text ?? ""} onChange={(e) => mudar({ text: e.target.value })} />
        <Input aria-label={`Endereço ${n}`} placeholder="Endereço" value={c.address ?? ""} onChange={(e) => mudar({ address: e.target.value })} />
        <div className="flex gap-2">
          <Input aria-label={`Latitude ${n}`} inputMode="decimal" placeholder="Latitude (opcional)" value={c.latitude ?? ""} onChange={(e) => mudar({ latitude: numero(e.target.value) })} />
          <Input aria-label={`Longitude ${n}`} inputMode="decimal" placeholder="Longitude (opcional)" value={c.longitude ?? ""} onChange={(e) => mudar({ longitude: numero(e.target.value) })} />
        </div>
        <p className="text-caption text-text-tertiary">
          Com latitude e longitude, o WhatsApp recebe o pino no mapa; nos outros canais sai como texto com o link do mapa.
        </p>
      </div>
    );
  }
  return <Textarea aria-label={`Texto ${n}`} rows={3} value={c.text ?? ""} onChange={(e) => mudar({ text: e.target.value })} />;
}

/** Sobe o arquivo direto para o storage privado; o motor manda com link assinado. */
function EnviarArquivo({ n, tipo, mudar }: { n: number; tipo: NonNullable<BlockContent["mediaType"]>; mudar: (parte: Partial<BlockContent>) => void }) {
  const [estado, setEstado] = React.useState<{ enviando: boolean; erro?: string }>({ enviando: false });
  const aceita = tipo === "sticker" ? "image/webp" : tipo === "document" ? ".pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx" : `${tipo}/*`;

  async function enviar(file: File) {
    setEstado({ enviando: true });
    try {
      const res = await fetch("/api/flows/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, mime: file.type, size: file.size }),
      });
      const auth = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(auth.error ?? "Não foi possível enviar o arquivo.");
      const form = new FormData();
      form.append("cacheControl", "3600");
      form.append("", file);
      const up = await fetch(auth.uploadUrl, { method: "PUT", body: form });
      if (!up.ok) throw new Error("O envio do arquivo falhou.");
      // Figurinha é .webp, que o storage classifica como imagem: o tipo escolhido manda.
      const mediaType = tipo === "sticker" ? "sticker" : (auth.type as BlockContent["mediaType"]);
      mudar({ path: auth.path, url: undefined, fileName: file.name, mediaType });
      setEstado({ enviando: false });
    } catch (e) {
      setEstado({ enviando: false, erro: e instanceof Error ? e.message : "Não foi possível enviar o arquivo." });
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-full border border-dashed border-border-default text-small font-medium text-text-secondary transition-colors focus-within:border-accent-solid hover:border-accent-solid hover:text-text-primary">
        <Upload size={14} aria-hidden="true" />
        {estado.enviando ? "Enviando…" : "Ou envie um arquivo (até 16 MB)"}
        <input
          type="file"
          className="sr-only"
          accept={aceita}
          aria-label={`Enviar arquivo ${n}`}
          disabled={estado.enviando}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void enviar(f);
          }}
        />
      </label>
      {estado.erro && <p role="alert" className="text-caption text-danger">{estado.erro}</p>}
    </div>
  );
}

/** Cards do carrossel: imagem, título, descrição e até 3 botões de link. */
function CamposDoCarrossel({ c, n, mudar }: { c: BlockContent; n: number; mudar: (parte: Partial<BlockContent>) => void }) {
  const cards = c.cards ?? [];
  const mudarCard = (i: number, parte: Partial<BlockCard>) => mudar({ cards: cards.map((k, j) => (j === i ? { ...k, ...parte } : k)) });
  return (
    <div className="flex flex-col gap-2">
      {cards.map((k, i) => {
        const botoes = k.buttons ?? [];
        const mudarBotao = (b: number, parte: Partial<{ label: string; url: string }>) =>
          mudarCard(i, { buttons: botoes.map((x, j) => (j === b ? { ...x, ...parte } : x)) });
        return (
          <div key={k.id} className="flex flex-col gap-2 rounded-[12px] border border-border-subtle p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-caption font-medium text-text-tertiary">Card {i + 1}</span>
              <span className="flex items-center">
                <BotaoPequeno rotulo={`Subir o card ${i + 1}`} onClick={() => mudar({ cards: mover(cards, i, -1) })} disabled={i === 0}>
                  <ArrowUp size={13} aria-hidden="true" />
                </BotaoPequeno>
                <BotaoPequeno rotulo={`Descer o card ${i + 1}`} onClick={() => mudar({ cards: mover(cards, i, 1) })} disabled={i === cards.length - 1}>
                  <ArrowDown size={13} aria-hidden="true" />
                </BotaoPequeno>
                <BotaoPequeno rotulo={`Apagar o card ${i + 1}`} perigo onClick={() => mudar({ cards: cards.filter((_, j) => j !== i) })}>
                  <Trash2 size={13} aria-hidden="true" />
                </BotaoPequeno>
              </span>
            </div>
            <Input aria-label={`Imagem do card ${i + 1} do carrossel ${n}`} placeholder="Link da imagem (https://…)" value={k.imageUrl ?? ""} onChange={(e) => mudarCard(i, { imageUrl: e.target.value || undefined })} />
            <Input aria-label={`Título do card ${i + 1} do carrossel ${n}`} placeholder="Título" maxLength={80} value={k.title} onChange={(e) => mudarCard(i, { title: e.target.value })} />
            <Input aria-label={`Descrição do card ${i + 1} do carrossel ${n}`} placeholder="Descrição (opcional)" maxLength={80} value={k.description ?? ""} onChange={(e) => mudarCard(i, { description: e.target.value || undefined })} />
            {botoes.map((b, j) => (
              <div key={b.id} className="flex gap-1.5">
                <Input aria-label={`Texto do botão ${j + 1} do card ${i + 1}`} placeholder="Botão" maxLength={20} className="w-[110px] shrink-0" value={b.label} onChange={(e) => mudarBotao(j, { label: e.target.value })} />
                <Input aria-label={`Link do botão ${j + 1} do card ${i + 1}`} placeholder="https://…" value={b.url} onChange={(e) => mudarBotao(j, { url: e.target.value })} />
                <BotaoPequeno rotulo={`Apagar o botão ${j + 1} do card ${i + 1}`} perigo onClick={() => mudarCard(i, { buttons: botoes.filter((_, x) => x !== j) })}>
                  <Trash2 size={13} aria-hidden="true" />
                </BotaoPequeno>
              </div>
            ))}
            {botoes.length < 3 && (
              <button
                type="button"
                onClick={() => mudarCard(i, { buttons: [...botoes, { id: generateId(), label: "", url: "" }] })}
                className="flex items-center gap-1 self-start text-caption font-medium text-accent-fg"
              >
                <Plus size={12} aria-hidden="true" /> Botão com link
              </button>
            )}
          </div>
        );
      })}
      {cards.length < 10 && <BotaoAdicionar onClick={() => mudar({ cards: [...cards, novoCard()] })}>Card</BotaoAdicionar>}
      <p className="text-caption text-text-tertiary">
        Instagram, Messenger e o chat do site mostram os cards. WhatsApp e Telegram recebem uma lista com os links.
      </p>
    </div>
  );
}

function CondicoesDoBloco({ data, onChange }: { data: FlowNodeData; onChange: (patch: Partial<FlowNodeData>) => void }) {
  const lista = data.exitConditions ?? [];
  const mudar = (i: number, parte: Partial<BlockCondition>) =>
    onChange({ exitConditions: lista.map((c, j) => (j === i ? { ...c, ...parte } : c)) });
  return (
    <div className="flex flex-col gap-3">
      <p className="text-caption text-text-tertiary">
        Vale a primeira condição verdadeira, de cima para baixo. Sem nenhuma, segue pelo botão escolhido (ou pela saída
        normal). Cada condição vira uma porta no card: ligue ao bloco de destino.
      </p>
      {lista.map((c, i) => (
        <div key={c.id} className="flex flex-col gap-2 rounded-[14px] border border-border-subtle bg-raised p-3">
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <Label htmlFor={`cond-nome-${c.id}`}>Nome da saída</Label>
              <Input id={`cond-nome-${c.id}`} placeholder="ex: Cliente VIP" value={c.label} onChange={(e) => mudar(i, { label: e.target.value })} />
            </div>
            <BotaoPequeno rotulo="Subir" onClick={() => onChange({ exitConditions: mover(lista, i, -1) })} disabled={i === 0}>
              <ArrowUp size={13} />
            </BotaoPequeno>
            <BotaoPequeno rotulo="Remover" perigo onClick={() => onChange({ exitConditions: lista.filter((_, j) => j !== i) })}>
              <Trash2 size={13} />
            </BotaoPequeno>
          </div>
          <div>
            <Label htmlFor={`cond-expr-${c.id}`}>Condição</Label>
            <Input
              id={`cond-expr-${c.id}`}
              className="font-mono text-small"
              placeholder='ex: {plano} == "pro"'
              value={c.expression}
              onChange={(e) => mudar(i, { expression: e.target.value })}
            />
          </div>
        </div>
      ))}
      <BotaoAdicionar onClick={() => onChange({ exitConditions: [...lista, { id: generateId(), label: "", expression: "" }] })}>
        Adicionar condição
      </BotaoAdicionar>
    </div>
  );
}

function ListaDeAcoes({
  titulo,
  ajuda,
  acoes,
  onChange,
  abrir,
}: {
  titulo: string;
  ajuda: string;
  acoes: BlockAction[];
  onChange: (acoes: BlockAction[]) => void;
  abrir: (id: string) => void;
}) {
  function adicionar(iconKey: IconKey) {
    const id = generateId();
    const padrao = getBlockDefault(iconKey)?.data ?? {};
    onChange([...acoes, { id, data: { label: ROTULO.get(iconKey) ?? iconKey, ...padrao, iconKey } as FlowNodeData }]);
    abrir(id);
  }
  return (
    <section className="flex flex-col gap-2">
      <div>
        <h3 className="text-caption font-medium uppercase tracking-wide text-text-tertiary">{titulo}</h3>
        <p className="text-caption text-text-tertiary">{ajuda}</p>
      </div>
      {acoes.map((a, i) => (
        <div key={a.id} className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => abrir(a.id)}
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[12px] bg-raised px-3 py-2 text-left transition-colors hover:bg-hover"
          >
            <IconeDoBloco iconKey={a.data.iconKey} size={15} className="shrink-0 text-text-secondary" />
            <span className="min-w-0 flex-1 truncate text-small text-text-primary">{a.data.label}</span>
            <ChevronRight size={14} className="shrink-0 text-text-tertiary" aria-hidden="true" />
          </button>
          <BotaoPequeno rotulo="Subir" onClick={() => onChange(mover(acoes, i, -1))} disabled={i === 0}>
            <ArrowUp size={13} />
          </BotaoPequeno>
        </div>
      ))}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-9 items-center justify-center gap-1.5 rounded-full border border-dashed border-border-default text-small font-medium text-text-secondary transition-colors hover:border-accent-solid hover:text-text-primary"
          >
            <Plus size={14} aria-hidden="true" /> Adicionar ação
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          collisionPadding={12}
          className="max-h-[min(60vh,var(--radix-dropdown-menu-content-available-height))] w-60 overflow-y-auto overscroll-contain"
        >
          <DropdownMenuLabel>Dados e integrações</DropdownMenuLabel>
          {ACOES.filter((k) => !k.startsWith("crm-")).map((k) => (
            <ItemDeAcao key={k} iconKey={k} escolher={adicionar} />
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>CRM</DropdownMenuLabel>
          {ACOES.filter((k) => k.startsWith("crm-")).map((k) => (
            <ItemDeAcao key={k} iconKey={k} escolher={adicionar} />
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </section>
  );
}

function ItemDeAcao({ iconKey, escolher }: { iconKey: IconKey; escolher: (k: IconKey) => void }) {
  return (
    <DropdownMenuItem onSelect={() => escolher(iconKey)} className="gap-2.5">
      <IconeDoBloco iconKey={iconKey} size={15} className="shrink-0 text-text-secondary" />
      {ROTULO.get(iconKey) ?? iconKey}
    </DropdownMenuItem>
  );
}

function BotaoPequeno({
  rotulo,
  onClick,
  disabled,
  perigo,
  children,
}: {
  rotulo: string;
  onClick: () => void;
  disabled?: boolean;
  perigo?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={rotulo}
      title={rotulo}
      onClick={onClick}
      disabled={disabled}
      className={
        "shrink-0 rounded-lg p-2 text-text-tertiary transition-colors hover:bg-hover disabled:pointer-events-none disabled:opacity-40 " +
        (perigo ? "hover:text-danger" : "hover:text-text-primary")
      }
    >
      {children}
    </button>
  );
}

function BotaoAdicionar({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full border border-dashed border-border-default text-small font-medium text-text-secondary transition-colors hover:border-accent-solid hover:text-text-primary"
    >
      <Plus size={14} aria-hidden="true" /> {children}
    </button>
  );
}
