"use client";

import * as React from "react";
import NextLink from "next/link";
import Link from "@/components/contrato/link";
import { ChevronsUpDown, LogOut, Settings, ImageUp, Check, ArrowLeftRight, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { usePathname } from "@/lib/contrato/navegacao";
import { trocarContrato } from "@/lib/contrato/rotas";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

// Seletor de contrato do menu lateral. Trocar mantém a tela (a seção) e troca
// o contrato da URL: /A/negocios/123 → /B/negocios. A lista completa (com
// busca, para quem tem muitos) é a tela /contratos.
const NO_MENU = 6;

export function OrgSwitcher({ collapsed }: { collapsed?: boolean }) {
  const { session, logOut, updateOrgLogo } = useAuth();
  const pathname = usePathname();
  const orgName = session?.orgName ?? "Contrato";
  const initial = orgName.charAt(0).toUpperCase();
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
    <DropdownMenu>
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
      <DropdownMenuTrigger asChild>
        <button className="flex w-full items-center gap-2.5 rounded-xl border border-border-subtle bg-surface-2 p-2 text-left transition-colors hover:border-border-default hover:bg-surface-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-ice text-[13px] font-bold text-bg-base">
            {session?.orgLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={session.orgLogoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              initial
            )}
          </span>
          {!collapsed && (
            <>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[13px] font-semibold text-text-primary">{orgName}</span>
                <span className="truncate text-[11px] text-text-tertiary">
                  Contrato{session?.papelNome ? ` · ${session.papelNome}` : ""}
                </span>
              </span>
              <ChevronsUpDown size={14} className="shrink-0 text-text-tertiary" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[250px]">
        <div className="px-3 py-2">
          <p className="truncate text-[13px] font-medium text-text-primary">{session?.name}</p>
          <p className="truncate text-[12px] text-text-tertiary">{session?.email}</p>
        </div>
        {contratos.length > 1 && (
          <>
            <DropdownMenuSeparator />
            <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">Seus contratos</p>
            {contratos.slice(0, NO_MENU).map((c) => (
              <DropdownMenuItem key={c.id} asChild>
                <NextLink href={trocarContrato(pathname, c.id)}>
                  <span className="flex-1 truncate">{c.name}</span>
                  {c.id === session?.contratoId && <Check size={14} className="text-text-tertiary" />}
                </NextLink>
              </DropdownMenuItem>
            ))}
          </>
        )}
        <DropdownMenuItem asChild>
          <NextLink href={`/contratos?escolher=1&para=${encodeURIComponent(`/${secao}`)}`}>
            <ArrowLeftRight size={15} /> Trocar de contrato
          </NextLink>
        </DropdownMenuItem>
        {session?.superadmin && (
          <DropdownMenuItem asChild>
            <NextLink href="/admin">
              <ShieldCheck size={15} /> Painel da Eva
            </NextLink>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        {podeEditar && (
          <DropdownMenuItem onSelect={() => fileInputRef.current?.click()}>
            <ImageUp size={15} /> Alterar imagem do contrato
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link href="/configuracoes">
            <Settings size={15} /> Configurações do contrato
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={logOut} className="text-danger data-[highlighted]:bg-danger/10 data-[highlighted]:text-danger">
          <LogOut size={15} /> Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
