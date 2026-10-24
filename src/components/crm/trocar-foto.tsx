"use client";

import * as React from "react";
import { Camera, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { focusRing } from "@/components/ui/styles";
import { useToast } from "@/components/ui/toast";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EXTENSAO_DO_AVATAR } from "@/lib/avatar";

// Botão de câmera sobre um avatar: escolhe a foto, corta em quadrado e reduz
// para 256 px no navegador, sobe direto ao storage e confirma no `endpoint`
// (POST autoriza, PUT grava, DELETE tira). Contato: /api/contacts/{id}/foto;
// a própria foto: /api/me/foto.

const LADO = 256;

/** Corta o centro em quadrado e reduz; WebP quando o navegador sabe, senão PNG. */
async function reduzir(arquivo: File): Promise<Blob> {
  const img = await createImageBitmap(arquivo);
  const lado = Math.min(img.width, img.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = LADO;
  canvas.getContext("2d")!.drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, 0, 0, LADO, LADO);
  img.close();
  return new Promise((ok, falha) => canvas.toBlob((b) => (b ? ok(b) : falha(new Error("Não foi possível ler a imagem."))), "image/webp", 0.85));
}

async function json(res: Response) {
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error ?? "Não foi possível salvar a foto.");
  return d;
}

export function TrocarFoto({
  endpoint,
  temFoto,
  rotulo,
  onMudou,
  children,
  className,
}: {
  endpoint: string;
  temFoto: boolean;
  /** De quem é a foto ("Marcelo Duarte", "perfil"): entra no rótulo do botão. */
  rotulo: string;
  onMudou: (avatarPath: string | null) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const toast = useToast();
  const entrada = React.useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = React.useState(false);

  async function enviar(arquivo: File) {
    if (!EXTENSAO_DO_AVATAR[arquivo.type]) return toast({ title: "Use uma imagem JPG, PNG ou WebP.", tone: "danger" });
    setEnviando(true);
    try {
      const foto = await reduzir(arquivo);
      const auth = await json(await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mime: foto.type, size: foto.size }) }));
      const form = new FormData();
      form.append("cacheControl", "31536000");
      form.append("", foto);
      const up = await fetch(auth.uploadUrl, { method: "PUT", body: form });
      if (!up.ok) throw new Error("O envio da foto falhou.");
      const d = await json(await fetch(endpoint, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: auth.path }) }));
      onMudou(d.avatarPath);
      toast({ title: "Foto atualizada", tone: "success" });
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Não foi possível salvar a foto.", tone: "danger" });
    } finally {
      setEnviando(false);
    }
  }

  async function remover() {
    setEnviando(true);
    try {
      await json(await fetch(endpoint, { method: "DELETE" }));
      onMudou(null);
      toast({ title: "Foto removida" });
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Não foi possível remover a foto.", tone: "danger" });
    } finally {
      setEnviando(false);
    }
  }

  const botao = cn(
    "absolute -bottom-0.5 -right-0.5 grid size-6 place-items-center rounded-full bg-panel text-text-secondary shadow-sm ring-1 ring-border-default",
    "opacity-0 transition-opacity hover:text-text-primary focus-visible:opacity-100 group-hover/foto:opacity-100",
    enviando && "opacity-100",
    focusRing
  );
  const icone = enviando ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <Camera size={12} aria-hidden />;

  return (
    <span className={cn("group/foto relative inline-flex shrink-0", className)}>
      {children}
      <input
        ref={entrada}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void enviar(f);
        }}
      />
      {temFoto ? (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button type="button" disabled={enviando} aria-label={`Foto de ${rotulo}`} className={botao}>
              {icone}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => entrada.current?.click()}>Trocar foto</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void remover()} className="text-danger">
              Remover foto
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <button type="button" disabled={enviando} onClick={() => entrada.current?.click()} aria-label={`Adicionar foto de ${rotulo}`} className={botao}>
          {icone}
        </button>
      )}
    </span>
  );
}
