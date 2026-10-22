"use client";

import * as React from "react";
import NextLink from "next/link";
import { usePathname } from "@/lib/contrato/navegacao";
import { ArrowLeftRight, Check, ChevronsUpDown, HelpCircle, ImageUp, Keyboard, LogOut, Settings, ShieldCheck, UserRound } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import Link from "@/components/contrato/link";
import { trocarContrato } from "@/lib/contrato/rotas";
import { useBuscaGlobal } from "@/components/busca/paleta-de-busca";
import { iniciais } from "@/components/inbox/tipos";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

// ---------------------------------------------------------------------------
// Você e o contrato num lugar só: cartão no rodapé do menu lateral (foto,
// nome, papel) que abre, por cima da tela e com o fundo desfocado, os seus
// contratos, "Trocar de contrato" e a conta. Trocar mantém a tela (a seção)
// e troca o contrato da URL: /A/negocios/123 → /B/negocios. A lista completa
// (com busca, para quem tem muitos) é a tela /contratos.
// ---------------------------------------------------------------------------

const NO_MENU = 6;

export function OrgSwitcher({ collapsed }: { collapsed?: boolean }) {
  const { session, logOut, updateOrgLogo } = useAuth();
  const { abrirAtalhos } = useBuscaGlobal();
  const pathname = usePathname();
  const [aberto, setAberto] = React.useState(false);
  const nome = session?.name ?? "";
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const podeEditar = session?.permissoes?.includes("contrato:gerenciar") ?? false;
  const contratos = session?.contratos ?? [];
  const secao = pathname.split("/").filter(Boolean)[0] ?? "inicio";

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") updateOrgLogo(reader.result);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  return (
    <DropdownMenu open={aberto} onOpenChange={setAberto}>
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
      {/* Véu desfocado: o menu é uma camada por cima da tela, não um balão solto. */}
      {aberto && <div className="fixed inset-0 z-40 bg-backdrop backdrop-blur-md motion-safe:animate-[ds-fade-in_200ms_ease-out]" aria-hidden="true" />}
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex w-full items-center gap-2.5 rounded-2xl border border-border-subtle bg-raised p-2 text-left transition-colors hover:bg-hover",
            collapsed && "justify-center p-1.5"
          )}
          aria-label="Sua conta e seus contratos"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-inverse text-small font-semibold text-inverse-fg">
            {iniciais(nome) || "?"}
          </span>
          {!collapsed && (
            <>
              <span className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="truncate text-small font-semibold text-text-primary">{nome}</span>
                <span className="truncate text-caption text-text-tertiary">
                  {session?.papelNome ? `${session.papelNome} · ` : ""}
                  {session?.orgName ?? "Contrato"}
                </span>
              </span>
              <ChevronsUpDown size={14} className="shrink-0 text-text-tertiary" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" sideOffset={10} className="z-50 w-[300px] rounded-3xl p-1.5">
        <div className="flex items-center gap-3 px-2.5 pb-3 pt-2">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-inverse text-body font-semibold text-inverse-fg">{iniciais(nome) || "?"}</span>
          <span className="min-w-0">
            <p className="truncate text-body font-semibold text-text-primary">{nome}</p>
            <p className="truncate text-caption text-text-tertiary">{session?.email}</p>
          </span>
        </div>
        <div className="mx-1 mb-1 rounded-2xl border border-border-subtle bg-raised p-1.5">
          <p className="px-2 pb-1 pt-1 font-mono text-caption text-text-tertiary">Seus contratos</p>
          {(contratos.length > 0 ? contratos.slice(0, NO_MENU) : [{ id: session?.contratoId ?? "", name: session?.orgName ?? "Contrato" }]).map((c) => {
            const atual = c.id === session?.contratoId;
            return (
              <DropdownMenuItem key={c.id} asChild>
                <NextLink href={trocarContrato(pathname, c.id)} className="h-10">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-inverse text-caption font-semibold text-inverse-fg">
                    {atual && session?.orgLogoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={session.orgLogoUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      c.name.charAt(0).toUpperCase()
                    )}
                  </span>
                  <span className="flex-1 truncate font-medium">{c.name}</span>
                  {atual && <Check size={14} className="text-accent-fg" />}
                </NextLink>
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuItem asChild>
            <NextLink href={`/contratos?escolher=1&para=${encodeURIComponent(`/${secao}`)}`} className="h-10 text-text-secondary">
              <ArrowLeftRight size={15} /> Trocar de contrato
            </NextLink>
          </DropdownMenuItem>
        </div>
        <DropdownMenuItem asChild>
          <Link href="/configuracoes?aba=conta" className="h-9">
            <UserRound size={15} /> Sua conta
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/configuracoes" className="h-9">
            <Settings size={15} /> Configurações do contrato
          </Link>
        </DropdownMenuItem>
        {podeEditar && (
          <DropdownMenuItem onSelect={() => fileInputRef.current?.click()} className="h-9">
            <ImageUp size={15} /> Alterar imagem do contrato
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={abrirAtalhos} className="h-9">
          <Keyboard size={15} /> Atalhos de teclado
          <span className="ml-auto font-mono text-caption text-text-tertiary">?</span>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/ajuda" className="h-9">
            <HelpCircle size={15} /> Eva Help
          </Link>
        </DropdownMenuItem>
        {session?.superadmin && (
          <DropdownMenuItem asChild>
            <NextLink href="/admin" className="h-9">
              <ShieldCheck size={15} /> Painel da Eva
            </NextLink>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={logOut} className="h-9 text-danger data-[highlighted]:bg-danger-subtle data-[highlighted]:text-danger">
          <LogOut size={15} /> Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
