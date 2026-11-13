"use client";

import * as React from "react";
import { Image as ImageIcon, Pencil, Plus, Send, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { Notice } from "@/components/ui/notice";
import { textoComOpcoes } from "@/lib/disparos/lista";
import { subirArquivo, type ArquivoEnviado } from "@/lib/disparos/subir-arquivo";
import { cn } from "@/lib/utils";

// Modelos de disparo do contrato: texto, até 3 opções numeradas e um arquivo.
// Cada um aparece como ficaria no WhatsApp; "Usar" preenche o novo disparo.

export interface Modelo {
  id: string;
  name: string;
  text: string;
  options: string[];
  mediaPath: string | null;
  mediaType: string | null;
  mediaMime: string | null;
  mediaName: string | null;
}

export function useModelos() {
  const [modelos, setModelos] = React.useState<Modelo[] | null>(null);
  const [aviso, setAviso] = React.useState<string | null>(null);
  const carregar = React.useCallback(async () => {
    const r = await fetch("/api/broadcast-templates", { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    setModelos(r.ok ? j.modelos ?? [] : []);
    setAviso(j.aviso ?? (r.ok ? null : j.error ?? "Não consegui carregar os modelos."));
  }, []);
  React.useEffect(() => {
    void carregar();
  }, [carregar]);
  return { modelos, aviso, carregar };
}

/** *texto* em negrito, como o WhatsApp mostra. */
function comNegrito(texto: string): React.ReactNode[] {
  return texto.split(/(\*[^*\n]+\*)/g).map((parte, i) => (/^\*[^*\n]+\*$/.test(parte) ? <b key={i}>{parte.slice(1, -1)}</b> : parte));
}

/** Balão do WhatsApp com a imagem, o texto e as opções. `compacta`: imagem menor e texto recolhido (lista de modelos). */
export function PreviaDoWhatsApp({ text, options, mediaPath, mediaType, mediaName, compacta = false }: Pick<Modelo, "text" | "options" | "mediaPath" | "mediaType" | "mediaName"> & { compacta?: boolean }) {
  const corpo = textoComOpcoes(text, options);
  const [aberta, setAberta] = React.useState(false);
  const recolher = compacta && !aberta;
  return (
    <div className="rounded-[18px] bg-[#0b141a] p-3">
      <div className="ml-auto max-w-[300px] overflow-hidden rounded-[12px] rounded-tr-[4px] bg-[#005c4b] text-[13px] leading-snug text-[#e9edef] shadow">
        {mediaPath && mediaType === "image" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/media?path=${encodeURIComponent(mediaPath)}`} alt={mediaName ?? "Imagem do disparo"} className={cn("w-full object-cover", recolher ? "max-h-[160px]" : "max-h-[360px]")} />
        )}
        {mediaPath && mediaType !== "image" && (
          <p className="flex items-center gap-2 border-b border-white/10 px-3 py-2 text-[12px] opacity-80">
            <ImageIcon size={14} aria-hidden /> {mediaName ?? "arquivo"}
          </p>
        )}
        {corpo && <p className={cn("whitespace-pre-wrap px-3 py-2", recolher && "line-clamp-6")}>{comNegrito(corpo)}</p>}
      </div>
      {compacta && (
        <button type="button" onClick={() => setAberta((v) => !v)} aria-expanded={aberta} className="mt-2 block w-full text-center text-caption font-medium text-[#8696a0] hover:text-[#e9edef]">
          {aberta ? "Recolher" : "Ver mensagem inteira"}
        </button>
      )}
    </div>
  );
}

export function ModelosDeDisparo({ modelos, aviso, carregar, onUsar }: { modelos: Modelo[] | null; aviso: string | null; carregar: () => Promise<void>; onUsar: (m: Modelo) => void }) {
  const [editando, setEditando] = React.useState<Modelo | "novo" | null>(null);

  async function apagar(m: Modelo) {
    if (!window.confirm(`Apagar o modelo "${m.name}"?`)) return;
    await fetch(`/api/broadcast-templates/${m.id}`, { method: "DELETE" });
    await carregar();
  }

  return (
    <section aria-labelledby="modelos-titulo" className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 id="modelos-titulo" className="text-body-lg font-semibold text-text-primary">Modelos</h2>
        <span className="font-mono text-caption tabular-nums text-text-tertiary">{modelos?.length ?? 0}</span>
        <Button type="button" variant="secondary" size="sm" className="ml-auto" onClick={() => setEditando("novo")}>
          <Plus size={13} aria-hidden /> Novo modelo
        </Button>
      </div>
      {aviso && <Notice tone="warning">{aviso}</Notice>}
      {modelos && modelos.length === 0 && !aviso && (
        <p className="rounded-[20px] border border-dashed border-border-default p-5 text-small text-text-tertiary">
          Nenhum modelo ainda. Salve a mensagem (texto, imagem e opções) para mostrar e reusar.
        </p>
      )}
      <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {modelos?.map((m) => (
          <li key={m.id} className="flex flex-col gap-3 rounded-[24px] border border-border-subtle bg-panel p-4">
            <div className="flex items-center gap-1">
              <p className="min-w-0 flex-1 truncate text-body font-semibold text-text-primary">{m.name}</p>
              <IconButton size="sm" aria-label={`Editar ${m.name}`} onClick={() => setEditando(m)}>
                <Pencil />
              </IconButton>
              <IconButton size="sm" aria-label={`Apagar ${m.name}`} className="hover:text-danger" onClick={() => void apagar(m)}>
                <Trash2 />
              </IconButton>
            </div>
            <PreviaDoWhatsApp {...m} compacta />
            <Button type="button" variant="primary" size="sm" onClick={() => onUsar(m)}>
              <Send size={13} aria-hidden /> Usar no disparo
            </Button>
          </li>
        ))}
      </ul>

      <Drawer open={!!editando} onOpenChange={(v) => !v && setEditando(null)}>
        {editando && (
          <EditorDeModelo
            modelo={editando === "novo" ? null : editando}
            fechar={() => setEditando(null)}
            salvo={async () => {
              setEditando(null);
              await carregar();
            }}
          />
        )}
      </Drawer>
    </section>
  );
}

function EditorDeModelo({ modelo, fechar, salvo }: { modelo: Modelo | null; fechar: () => void; salvo: () => Promise<void> }) {
  const [name, setName] = React.useState(modelo?.name ?? "");
  const [text, setText] = React.useState(modelo?.text ?? "");
  const [opcoes, setOpcoes] = React.useState<string[]>([0, 1, 2].map((i) => modelo?.options[i] ?? ""));
  const [arquivo, setArquivo] = React.useState<ArquivoEnviado | null>(
    modelo?.mediaPath ? { path: modelo.mediaPath, type: modelo.mediaType ?? "image", mime: modelo.mediaMime ?? "", name: modelo.mediaName ?? "arquivo" } : null
  );
  const [subindo, setSubindo] = React.useState(false);
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function escolher(file: File) {
    setSubindo(true);
    setErro(null);
    try {
      setArquivo(await subirArquivo(file));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível enviar o arquivo.");
    } finally {
      setSubindo(false);
    }
  }

  async function salvar() {
    setSalvando(true);
    setErro(null);
    const r = await fetch(modelo ? `/api/broadcast-templates/${modelo.id}` : "/api/broadcast-templates", {
      method: modelo ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, text, options: opcoes, media: arquivo }),
    });
    const j = await r.json().catch(() => ({}));
    setSalvando(false);
    if (!r.ok) return setErro(j.error ?? "Não consegui salvar.");
    await salvo();
  }

  return (
    <DrawerContent
      title={modelo ? "Editar modelo" : "Novo modelo"}
      description="Como a mensagem vai chegar no WhatsApp."
      size="md"
      footer={
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={fechar}>
            Cancelar
          </Button>
          <Button type="button" variant="primary" disabled={salvando || subindo} onClick={() => void salvar()}>
            {salvando ? "Salvando..." : "Salvar modelo"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <Label htmlFor="modelo-nome">Nome</Label>
          <Input id="modelo-nome" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Lista 1 · Interior (com Scudeler)" />
        </div>
        <div>
          <Label htmlFor="modelo-texto">Texto</Label>
          <Textarea id="modelo-texto" rows={7} value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <div>
          <Label>Opções de resposta (opcional)</Label>
          <div className="flex flex-col gap-1.5">
            {opcoes.map((o, i) => (
              <Input key={i} value={o} aria-label={`Opção ${i + 1}`} placeholder={`${i + 1}.`} onChange={(e) => setOpcoes(opcoes.map((x, j) => (j === i ? e.target.value : x)))} />
            ))}
          </div>
        </div>
        <div>
          <Label>Imagem ou arquivo (opcional)</Label>
          <input
            ref={inputRef}
            type="file"
            accept="image/*,video/*,application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void escolher(f);
              e.target.value = "";
            }}
          />
          {arquivo ? (
            <div className="flex items-center gap-2 rounded-[14px] bg-raised px-3 py-2 text-small">
              <ImageIcon size={15} aria-hidden className="text-text-tertiary" />
              <span className="min-w-0 flex-1 truncate text-text-primary">{arquivo.name}</span>
              <IconButton size="sm" aria-label="Tirar arquivo" onClick={() => setArquivo(null)}>
                <X />
              </IconButton>
            </div>
          ) : (
            <Button type="button" variant="secondary" size="sm" disabled={subindo} onClick={() => inputRef.current?.click()}>
              <ImageIcon size={13} aria-hidden /> {subindo ? "Enviando arquivo..." : "Escolher arquivo"}
            </Button>
          )}
        </div>
        <div>
          <Label className="mb-1.5">Prévia</Label>
          <PreviaDoWhatsApp text={text} options={opcoes} mediaPath={arquivo?.path ?? null} mediaType={arquivo?.type ?? null} mediaName={arquivo?.name ?? null} />
        </div>
        {erro && <Notice tone="danger">{erro}</Notice>}
      </div>
    </DrawerContent>
  );
}
