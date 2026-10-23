"use client";

import * as React from "react";
import { ViewTransition } from "react";
import NextLink from "next/link";
import { useRouter, usePathname, useParams } from "next/navigation";
import { Menu, X, ShieldOff, Search } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { Sidebar } from "@/components/layout/sidebar";
import { ehIdDeContrato, idCurto, mesmoContrato } from "@/lib/contrato/rotas";
import { buttonVariants } from "@/components/ui/button";
import { BuscaGlobal, useBuscaGlobal } from "@/components/busca/paleta-de-busca";
import { FundoVivo } from "@/components/layout/fundo-vivo";
import { Ilha } from "@/components/layout/ilha";
import { pulsar } from "@/lib/fundo/eventos";
import { MarcaEva } from "@/components/layout/marca-eva";

// Tudo dentro de /<idDoContrato>/... A URL é a fonte da verdade do contrato:
// o /api/me recebe o id pelo cabeçalho e confere o vínculo no servidor. Aqui só
// se espera a sessão DAQUELE contrato chegar antes de desenhar a tela.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { contrato } = useParams<{ contrato: string }>();
  const { session, isLoading, sessaoDoContrato } = useAuth();
  const [menuAberto, setMenuAberto] = React.useState(false);

  // Navegou: fecha a gaveta. Sem isso, tocar num item do menu no celular leva
  // pra outra tela com o menu ainda aberto por cima dela.
  React.useEffect(() => {
    setMenuAberto(false);
    // Trocou de tela: uma onda curta no fundo vivo, do centro.
    pulsar(null, 0.9);
  }, [pathname]);

  React.useEffect(() => {
    if (!isLoading && !session) {
      router.replace("/login");
    }
  }, [isLoading, session, router]);

  if (!ehIdDeContrato(contrato)) return <SemAcesso padrao={session?.contratoPadrao ?? null} />;

  // Sessão ainda é do contrato anterior (acabou de trocar): espera a certa.
  if (isLoading || !session || sessaoDoContrato !== contrato) {
    return <div className="min-h-screen bg-bg-base" />;
  }

  if (session.semAcesso || !mesmoContrato(session.contratoId, contrato)) {
    return <SemAcesso padrao={session.contratoPadrao ?? null} />;
  }

  return (
    // Busca global (Ctrl+K / ⌘K) e atalhos G/?: um por contrato, por cima de todas as telas.
    <BuscaGlobal>
      {/* Uma superfície só: menu colado na borda, conteúdo ao lado, e o fundo
          vivo (curvas de nível) por trás dos dois. */}
      <div className="app-backdrop relative isolate flex h-[100dvh] flex-col overflow-hidden lg:flex-row">
        <FundoVivo />
        {/* O menu de 240px não cabe num celular de 390px: ocupava a tela inteira e
            o conteúdo desaparecia. Abaixo de 1024px vira uma gaveta, aberta por
            uma barra no topo. O menu acompanha o tema do app. */}
        <div className="relative z-10 hidden lg:flex" data-print-ocultar>
          <Sidebar />
        </div>

        <header className="relative z-10 flex shrink-0 items-center justify-between border-b border-border-subtle bg-panel/80 px-3 py-2 backdrop-blur lg:hidden" data-print-ocultar>
          <button
            type="button"
            onClick={() => setMenuAberto(true)}
            aria-label="Abrir o menu"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-2 hover:text-text-primary"
          >
            <Menu size={20} />
          </button>
          <span className="flex items-center gap-2">
            <MarcaEva size={18} className="text-text-primary" />
            <span className="font-display text-[14px] font-bold text-text-primary">Eva</span>
          </span>
          <BotaoBuscarNoTopo />
        </header>

        {menuAberto && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-label="Menu">
            <div className="absolute inset-0 bg-backdrop backdrop-blur-md" onClick={() => setMenuAberto(false)} />
            <div className="absolute inset-y-0 left-0 w-[290px] max-w-[88vw]">
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

        <div className="app-conteudo relative z-10 flex min-h-0 min-w-0 flex-1 flex-col">
          {/* Notificações: descem do topo só quando acontece algo (nada fixo aqui). */}
          <Ilha />
          <main className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:pt-5">
            {/* key: a cada tela nova a entrada roda de novo (cascata em globals.css). */}
            <ViewTransition key={pathname} enter="none" exit="eva-tela-sai" default="none">
              <div className="entrada-de-tela flex min-h-0 flex-1 flex-col">{children}</div>
            </ViewTransition>
          </main>
        </div>
      </div>
    </BuscaGlobal>
  );
}

/** Lupa da barra do celular (no computador o botão fica no menu lateral). */
function BotaoBuscarNoTopo() {
  const { abrir } = useBuscaGlobal();
  return (
    <button
      type="button"
      onClick={abrir}
      aria-label="Buscar"
      className="flex h-9 w-9 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-2 hover:text-text-primary"
    >
      <Search size={18} aria-hidden />
    </button>
  );
}

// Link de contrato de outro cliente, contrato que não existe ou do qual a
// pessoa saiu: a mesma tela para os três, sem dizer qual é o caso.
function SemAcesso({ padrao }: { padrao: string | null }) {
  return (
    <div className="app-backdrop flex min-h-[100dvh] items-center justify-center p-6">
      <div className="glass-card max-w-md rounded-3xl p-8 text-center">
        <ShieldOff size={28} className="mx-auto mb-3 text-text-tertiary" />
        <h1 className="font-display text-lg font-semibold text-text-primary">Você não tem acesso a este contrato</h1>
        <p className="mt-2 text-[13px] text-text-secondary">
          O link pode ser de outro cliente, ou seu acesso foi removido. Se precisa entrar, peça um convite ao dono do
          contrato.
        </p>
        <NextLink
          href={padrao ? `/${idCurto(padrao)}/inicio` : "/ir"}
          className={buttonVariants({ size: "md", className: "mt-5" })}
        >
          Ir para o meu contrato
        </NextLink>
      </div>
    </div>
  );
}
