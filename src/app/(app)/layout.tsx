"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { Sidebar } from "@/components/layout/sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { session, isLoading } = useAuth();
  const [menuAberto, setMenuAberto] = React.useState(false);

  // Navegou: fecha a gaveta. Sem isso, tocar num item do menu no celular leva
  // pra outra tela com o menu ainda aberto por cima dela.
  React.useEffect(() => {
    setMenuAberto(false);
  }, [pathname]);

  React.useEffect(() => {
    if (!isLoading && !session) {
      router.replace("/login");
    }
  }, [isLoading, session, router]);

  if (isLoading || !session) {
    return <div className="min-h-screen bg-bg-base" />;
  }

  return (
    <div className="app-backdrop flex h-[100dvh] flex-col gap-3 overflow-hidden p-3 lg:flex-row">
      {/* O menu de 248px não cabe num celular de 390px: ocupava a tela inteira e
          o conteúdo desaparecia. Abaixo de 1024px vira uma gaveta, aberta por
          uma barra no topo. */}
      <div className="hidden lg:flex">
        <Sidebar />
      </div>

      <header className="glass-card flex shrink-0 items-center justify-between rounded-2xl px-3 py-2 lg:hidden">
        <button
          type="button"
          onClick={() => setMenuAberto(true)}
          aria-label="Abrir o menu"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-2 hover:text-text-primary"
        >
          <Menu size={20} />
        </button>
        <span className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/eva-mark.png" alt="" width={20} height={20} />
          <span className="font-display text-[14px] font-bold text-text-primary">Eva</span>
        </span>
        <span className="w-9" />
      </header>

      {menuAberto && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-label="Menu">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMenuAberto(false)} />
          <div className="absolute inset-y-0 left-0 w-[290px] max-w-[88vw] p-3">
            <button
              type="button"
              onClick={() => setMenuAberto(false)}
              aria-label="Fechar o menu"
              className="absolute right-5 top-5 z-10 flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary hover:bg-surface-2 hover:text-text-primary"
            >
              <X size={17} />
            </button>
            <Sidebar mobile />
          </div>
        </div>
      )}

      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto rounded-3xl">{children}</main>
    </div>
  );
}
