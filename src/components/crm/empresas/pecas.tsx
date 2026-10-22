import * as React from "react";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/design-system/format";
import { CATEGORY_CLASSES } from "@/lib/design-system/category-classes";
import type { CategoryColor } from "@/lib/design-system/tokens";

// Peças pequenas de Empresas (lista e página). Mesmo espírito da foto do
// contato: a cor é identidade, tirada do id, então a mesma empresa tem a mesma
// cor na lista e na página. O logo é quadrado de canto largo (conta), a pessoa
// é redonda (gente).

const CORES: CategoryColor[] = ["blue", "cyan", "teal", "green", "amber", "orange", "red", "rose", "violet", "purple", "indigo", "slate"];

function corDa(semente: string): CategoryColor {
  let h = 0;
  for (let i = 0; i < semente.length; i++) h = (h * 31 + semente.charCodeAt(i)) | 0;
  return CORES[Math.abs(h) % CORES.length];
}

const TAMANHOS_DO_LOGO = {
  md: "size-9 rounded-[10px] text-caption",
  xl: "size-24 rounded-[26px] text-title",
} as const;

/** Logo da empresa: iniciais num quadrado arredondado, na cor da empresa. */
export function LogoDaEmpresa({
  nome,
  semente,
  tamanho = "md",
  className,
}: {
  nome: string;
  /** O que decide a cor (o id da empresa). */
  semente: string;
  tamanho?: keyof typeof TAMANHOS_DO_LOGO;
  className?: string;
}) {
  const cor = CATEGORY_CLASSES[corDa(semente || nome)];
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center font-semibold",
        cor.subtle,
        cor.fg,
        TAMANHOS_DO_LOGO[tamanho],
        className
      )}
    >
      {initials(nome || "?")}
    </span>
  );
}

const TAMANHOS_DA_PESSOA = {
  sm: "size-6 text-caption",
  md: "size-9 text-small",
} as const;

/** Pessoa (dono da conta, contato da empresa): iniciais num círculo. */
export function FotoDaPessoa({
  nome,
  semente,
  tamanho = "sm",
  className,
}: {
  nome: string;
  semente: string;
  tamanho?: keyof typeof TAMANHOS_DA_PESSOA;
  className?: string;
}) {
  const cor = CATEGORY_CLASSES[corDa(semente || nome)];
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold",
        cor.subtle,
        cor.fg,
        TAMANHOS_DA_PESSOA[tamanho],
        className
      )}
    >
      {initials(nome || "?")}
    </span>
  );
}

export function formatCnpj(raw: string): string {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length !== 14) return raw;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function normalizeUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

export function money(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

/** "São Paulo/SP", só a cidade, ou nada. */
export function cidadeUf(city: string, uf: string): string {
  return city && uf ? `${city}/${uf}` : city || "";
}
