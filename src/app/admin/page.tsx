"use client";

import * as React from "react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronRight, Copy, Check, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { useAuth } from "@/lib/auth/auth-context";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { MarcaEva } from "@/components/layout/marca-eva";
import { idCurto } from "@/lib/contrato/rotas";

// Painel da equipe Eva (superadmin): todos os contratos, com membros e chaves
// ativas; criar contrato; entrar em qualquer um. A rota de dados responde 404
// para quem não é superadmin, então esta tela só mostra "não encontrado".
//
// Fica fora do app (sem menu nem contrato), mas no mesmo visual das telas de
// dentro: fundo do app, cabeçalho de página e cartões claros.

interface Linha {
  id: string;
  name: string;
  createdAt: string;
  membros: number;
  chavesAtivas: number;
}

function Moldura({ children }: { children?: React.ReactNode }) {
  return <div className="app-backdrop relative isolate flex min-h-[100dvh] flex-col">{children}</div>;
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

  if (isLoading || !session) return <Moldura />;

  if (negado) {
    return (
      <Moldura>
        <main className="flex flex-1 items-center justify-center px-4">
          <Card className="w-full max-w-[380px] p-6 text-center">
            <h1 className="text-title font-semibold tracking-tight text-text-primary">Página não encontrada</h1>
            <NextLink href="/contracts" className={buttonVariants({ className: "mt-5 w-full" })}>
              Voltar
            </NextLink>
          </Card>
        </main>
      </Moldura>
    );
  }

  return (
    <Moldura>
      <header className="flex items-center justify-between gap-3 border-b border-border-subtle bg-panel/80 px-4 py-2.5 backdrop-blur sm:px-6">
        <span className="flex items-center gap-2 text-small font-semibold text-text-primary">
          <MarcaEva size={18} /> Painel da Eva
        </span>
        <NextLink href="/contracts?choose=1" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          <ArrowLeft size={14} aria-hidden="true" /> Escolher contrato
        </NextLink>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-8 sm:px-6">
        <PageHeader
          title="Contratos"
          meta={!carregando || linhas.length > 0 ? `${total.toLocaleString("pt-BR")} ${total === 1 ? "contrato" : "contratos"}` : undefined}
          description="Todos os contratos da plataforma. Você entra em qualquer um como dono, sem precisar de convite."
        />

        {/* Criar contrato: a única ação principal da tela. */}
        <Card className="p-4">
          <form onSubmit={criar} className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              value={novo}
              onChange={(e) => setNovo(e.target.value)}
              placeholder="Nome do cliente (ex.: Renata Estefan)"
              aria-label="Nome do novo contrato"
              className="min-w-0 flex-1"
            />
            <Button type="submit" disabled={!novo.trim()} className="shrink-0">
              <Plus size={15} aria-hidden="true" /> Criar contrato
            </Button>
          </form>
          {erro && <p className="mt-2 text-small text-danger">{erro}</p>}
          <p className="mt-2 text-caption text-text-tertiary">Depois de criar, você vai direto para Membros para convidar o cliente.</p>
        </Card>

        <Card className="overflow-hidden p-0">
          <div className="border-b border-border-subtle p-3">
            <SearchInput value={busca} onValueChange={setBusca} placeholder="Pesquisar por nome ou id" aria-label="Pesquisar" />
          </div>

          {/* A linha inteira entra no contrato. */}
          <ul aria-busy={carregando || undefined}>
            {linhas.map((l) => (
              <li
                key={l.id}
                className="group relative flex min-h-14 items-center gap-4 border-t border-border-subtle px-4 transition-colors first:border-t-0 hover:bg-hover"
              >
                <div className="min-w-0 flex-1 py-2.5">
                  <NextLink
                    href={`/${idCurto(l.id)}/home`}
                    aria-label={`Entrar no contrato ${l.name}`}
                    className="block truncate text-body font-medium text-text-primary outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-focus"
                  >
                    {l.name}
                  </NextLink>
                  {/* relative z-10: o id e o copiar ficam acima do link esticado. */}
                  <span className="relative z-10 mt-0.5 inline-flex items-center gap-0.5 font-mono text-caption tabular-nums text-text-tertiary">
                    <code title={l.id}>{l.id.slice(0, 8)}</code>
                    <Copiar texto={l.id} />
                  </span>
                </div>
                <span className="hidden w-24 shrink-0 text-right text-small tabular-nums text-text-secondary sm:block">
                  {l.membros} {l.membros === 1 ? "membro" : "membros"}
                </span>
                <span className="hidden w-28 shrink-0 text-right text-small tabular-nums text-text-secondary md:block">
                  {l.chavesAtivas} {l.chavesAtivas === 1 ? "chave ativa" : "chaves ativas"}
                </span>
                <span className="hidden w-24 shrink-0 text-right text-small tabular-nums text-text-tertiary md:block">
                  {new Date(l.createdAt).toLocaleDateString("pt-BR")}
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
                <li key={i} className="border-t border-border-subtle px-4 py-2.5 first:border-t-0">
                  <div className="h-9 animate-pulse rounded-[10px] bg-raised motion-reduce:animate-none" />
                </li>
              ))}
            {!carregando && linhas.length === 0 && (
              <li className="px-4 py-8 text-center text-small text-text-tertiary">
                {busca ? `Nenhum contrato com “${busca}”.` : "Nenhum contrato ainda."}
              </li>
            )}
          </ul>

          <div className="flex min-h-11 items-center justify-between gap-3 border-t border-border-subtle px-4">
            <span className="text-caption tabular-nums text-text-tertiary">{`${linhas.length} de ${total}`}</span>
            {linhas.length < total && (
              <Button variant="ghost" size="sm" loading={carregando} onClick={() => carregar(busca, pagina + 1)}>
                Mostrar mais
              </Button>
            )}
          </div>
        </Card>
      </main>
    </Moldura>
  );
}
