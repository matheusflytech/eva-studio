"use client";

import * as React from "react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronRight, Copy, Check, Plus } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { FundoVivo } from "@/components/layout/fundo-vivo";
import { MarcaEva } from "@/components/layout/marca-eva";
import { pulsar } from "@/lib/fundo/eventos";
import { idCurto } from "@/lib/contrato/rotas";

// Painel da equipe Eva (superadmin): todos os contratos, com membros e chaves
// ativas; criar contrato; entrar em qualquer um. A rota de dados responde 404
// para quem não é superadmin, então esta tela só mostra "não encontrado".
//
// Fica fora do app (sem menu nem contrato), então usa o palco do login: preto,
// feixe de luz, fundo vivo e um cartão de vidro, mais largo, com a lista.

interface Linha {
  id: string;
  name: string;
  createdAt: string;
  membros: number;
  chavesAtivas: number;
}

// A ação mais forte do palco escuro é a cápsula clara, como o "Entrar" do login.
const CAPSULA_CLARA = "bg-inverse font-semibold text-inverse-fg hover:bg-inverse/90";

function Palco({ children }: { children?: React.ReactNode }) {
  return (
    <div data-theme="dark" className="tela-de-entrada relative flex min-h-[100dvh] flex-col overflow-hidden">
      <FundoVivo escuro forca={2.4} className="pointer-events-none absolute inset-0 h-full w-full" />
      <span className="feixe-de-luz" aria-hidden="true" />
      <span className="feixe-de-luz feixe-fino" aria-hidden="true" />
      {children}
    </div>
  );
}

function Copiar({ texto }: { texto: string }) {
  const [ok, setOk] = React.useState(false);
  return (
    <button
      type="button"
      title="Copiar o id completo"
      aria-label={`Copiar o id ${texto}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          setOk(true);
          setTimeout(() => setOk(false), 1500);
        } catch {
          /* sem área de transferência */
        }
      }}
      className="grid h-6 w-6 place-items-center rounded-full text-text-tertiary transition-colors hover:bg-hover hover:text-text-primary"
    >
      {ok ? <Check size={12} className="text-success" /> : <Copy size={12} />}
    </button>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const { session, isLoading } = useAuth();
  const [busca, setBusca] = React.useState("");
  const [linhas, setLinhas] = React.useState<Linha[]>([]);
  const [total, setTotal] = React.useState(0);
  const [pagina, setPagina] = React.useState(1);
  const [negado, setNegado] = React.useState(false);
  const [carregando, setCarregando] = React.useState(true);
  const [novo, setNovo] = React.useState("");
  const [erro, setErro] = React.useState<string | null>(null);

  const carregar = React.useCallback(async (termo: string, p: number) => {
    setCarregando(true);
    try {
      const res = await fetch(`/api/admin/contratos?busca=${encodeURIComponent(termo)}&pagina=${p}`);
      if (!res.ok) {
        setNegado(true);
        return;
      }
      const d = await res.json();
      setTotal(d.total);
      setPagina(d.pagina);
      setLinhas((atual) => (p === 1 ? d.contratos : [...atual, ...d.contratos]));
    } finally {
      setCarregando(false);
    }
  }, []);

  React.useEffect(() => {
    if (isLoading) return;
    if (!session) {
      router.replace("/login");
      return;
    }
    const t = setTimeout(() => carregar(busca, 1), busca ? 250 : 0);
    return () => clearTimeout(t);
  }, [busca, carregar, isLoading, session, router]);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    pulsar((e.currentTarget as HTMLFormElement).querySelector("button[type=submit]"), 1.8);
    setErro(null);
    const res = await fetch("/api/admin/contratos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: novo }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErro(d.error ?? "Não foi possível criar o contrato.");
      return;
    }
    // Entra no contrato novo, direto nas configurações (para convidar o cliente).
    router.push(`/${d.contrato.id}/settings?tab=members`);
  }

  if (isLoading || !session) return <Palco />;

  if (negado) {
    return (
      <Palco>
        <main className="relative z-10 flex flex-1 items-center justify-center px-4">
          <div className="cartao-vidro w-full max-w-[380px] text-center">
            <h1 className="text-title font-semibold tracking-tight text-text-primary">Página não encontrada</h1>
            <NextLink href="/contracts" className={buttonVariants({ size: "lg", className: `mt-6 h-11 w-full ${CAPSULA_CLARA}` })}>
              Voltar
            </NextLink>
          </div>
        </main>
      </Palco>
    );
  }

  return (
    <Palco>
      <header className="relative z-10 flex items-center justify-between gap-3 px-4 pt-5 sm:px-8 sm:pt-7">
        <NextLink href="/contracts?choose=1" className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2" })}>
          <ArrowLeft size={14} aria-hidden="true" /> Escolher contrato
        </NextLink>
        <span className="text-small font-semibold text-text-secondary">Eva Holding</span>
      </header>

      <main className="relative z-10 flex flex-1 flex-col items-center px-4 py-8 sm:py-12">
        <div className="cartao-vidro w-full max-w-[760px]">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-page ring-1 ring-border-default">
              <MarcaEva size={20} className="text-text-primary" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <h1 className="text-heading font-semibold tracking-tight text-text-primary">Painel da Eva</h1>
                {!carregando || linhas.length > 0 ? (
                  <span className="font-mono text-caption tabular-nums text-text-tertiary">
                    {total.toLocaleString("pt-BR")} {total === 1 ? "contrato" : "contratos"}
                  </span>
                ) : null}
              </div>
              <p className="text-small text-text-secondary">
                Todos os contratos da plataforma. Você entra em qualquer um como dono, sem precisar de convite.
              </p>
            </div>
          </div>

          {/* Criar contrato: a única ação principal da tela. */}
          <form onSubmit={criar} className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              value={novo}
              onChange={(e) => setNovo(e.target.value)}
              placeholder="Nome do cliente (ex.: Renato Stefan)"
              aria-label="Nome do novo contrato"
              className="min-w-0 flex-1"
            />
            <Button type="submit" size="lg" disabled={!novo.trim()} className={`h-11 shrink-0 ${CAPSULA_CLARA}`}>
              <Plus size={15} aria-hidden="true" /> Criar contrato
            </Button>
          </form>
          {erro && <p className="mt-2 text-small text-danger">{erro}</p>}

          <p className="mt-7 font-mono text-caption text-text-tertiary">Contratos</p>
          <SearchInput
            value={busca}
            onValueChange={setBusca}
            placeholder="Pesquisar por nome ou id"
            aria-label="Pesquisar"
            className="mt-2"
          />

          {/* Lista colada com linhas finas: nome, id, membros e chaves; a linha inteira entra no contrato. */}
          <ul className="mt-3 border-y border-border-default" aria-busy={carregando || undefined}>
            {linhas.map((l) => (
              <li
                key={l.id}
                className="group relative flex min-h-14 items-center gap-3 border-t border-border-default px-2 transition-colors first:border-t-0 hover:bg-hover"
              >
                <div className="min-w-0 flex-1 py-2.5">
                  <NextLink
                    href={`/${idCurto(l.id)}/home`}
                    aria-label={`Entrar no contrato ${l.name}`}
                    className="block truncate text-body font-medium text-text-primary outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:rounded-[10px] focus-visible:after:ring-2 focus-visible:after:ring-focus"
                  >
                    {l.name}
                  </NextLink>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 font-mono text-caption tabular-nums text-text-tertiary">
                    {/* relative z-10: o id e o copiar ficam acima do link esticado. */}
                    <span className="relative z-10 inline-flex items-center gap-0.5">
                      <code title={l.id}>{l.id.slice(0, 8)}</code>
                      <Copiar texto={l.id} />
                    </span>
                    <span>
                      {l.membros} {l.membros === 1 ? "membro" : "membros"}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {l.chavesAtivas} {l.chavesAtivas === 1 ? "chave ativa" : "chaves ativas"}
                    </span>
                  </p>
                </div>
                <span className="hidden shrink-0 text-small text-text-tertiary transition-colors group-hover:text-text-primary sm:inline">
                  Entrar no contrato
                </span>
                <ChevronRight
                  size={15}
                  aria-hidden="true"
                  className="shrink-0 text-text-tertiary transition-transform group-hover:translate-x-0.5 group-hover:text-text-primary"
                />
              </li>
            ))}
            {carregando && linhas.length === 0 &&
              [0, 1, 2].map((i) => (
                <li key={i} className="border-t border-border-default py-2.5 first:border-t-0">
                  <div className="h-9 animate-pulse rounded-[14px] bg-raised motion-reduce:animate-none" />
                </li>
              ))}
            {!carregando && linhas.length === 0 && (
              <li className="px-2 py-6 text-center text-small text-text-tertiary">
                {busca ? `Nenhum contrato com “${busca}”.` : "Nenhum contrato ainda."}
              </li>
            )}
          </ul>

          <div className="mt-3 flex min-h-7 items-center justify-between gap-3">
            <span className="font-mono text-caption tabular-nums text-text-tertiary">{`${linhas.length} de ${total}`}</span>
            {linhas.length < total && (
              <Button variant="ghost" size="sm" loading={carregando} onClick={() => carregar(busca, pagina + 1)}>
                Mostrar mais
              </Button>
            )}
          </div>
        </div>
      </main>
    </Palco>
  );
}
