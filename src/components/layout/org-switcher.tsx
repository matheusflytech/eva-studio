"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronsUpDown, LogOut, Settings, ImageUp } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export function OrgSwitcher({ collapsed }: { collapsed?: boolean }) {
  const { session, logOut, updateOrgLogo } = useAuth();
  const orgName = session?.orgName ?? "Organização";
  const initial = orgName.charAt(0).toUpperCase();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

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
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleLogoChange}
      />
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
                <span className="text-[11px] text-text-tertiary">Organização</span>
              </span>
              <ChevronsUpDown size={14} className="shrink-0 text-text-tertiary" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[230px]">
        <div className="px-3 py-2">
          <p className="truncate text-[13px] font-medium text-text-primary">{session?.name}</p>
          <p className="truncate text-[12px] text-text-tertiary">{session?.email}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => fileInputRef.current?.click()}>
          <ImageUp size={15} /> Alterar imagem da organização
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/configuracoes">
            <Settings size={15} /> Configurações da organização
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
