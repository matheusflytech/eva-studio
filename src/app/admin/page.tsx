"use client";

import * as React from "react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Search, Copy, Check, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { idCurto } from "@/lib/contrato/rotas";

// Painel da equipe Eva (superadmin): todos os contratos, com membros e chaves
// ativas; criar contrato; entrar em qualquer um. A rota de dados responde 404
// para quem não é superadmin, então esta tela só mostra "não encontrado".

interface Linha {
  id: string;
  name: string;
  createdAt: string;
  membros: number;
  chavesAtivas: number;
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
      className="rounded-md p-1 text-text-tertiary hover:bg-surface-3 hover:text-text-primary"
    >
      {ok ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
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
    router.push(`/${d.contrato.id}/configuracoes?aba=membros`);
  }

  if (isLoading || !session) return <div className="min-h-screen bg-bg-base" />;

  if (negado) {
    return (
      <div className="app-backdrop flex min-h-[100dvh] items-center justify-center p-6">
        <div className="glass-card rounded-3xl p-8 text-center">
          <h1 className="font-display text-lg font-semibold text-text-primary">Página não encontrada</h1>
          <NextLink href="/contratos" className={buttonVariants({ size: "md", className: "mt-5" })}>
            Voltar
          </NextLink>
        </div>
      </div>
    );
  }

  return (
    <div className="app-backdrop min-h-[100dvh] px-4 py-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-5">
        <NextLink href="/contratos?escolher=1" className="inline-flex items-center gap-1.5 text-[13px] text-text-secondary hover:text-text-primary">
          <ArrowLeft size={15} /> Escolher contrato
        </NextLink>

        <div>
          <h1 className="font-display text-xl font-semibold text-text-primary">Painel da Eva</h1>
          <p className="mt-1 text-[13px] text-text-secondary">
            Todos os contratos da plataforma. Você entra em qualquer um como dono, sem precisar de convite.
          </p>
        </div>

        <form onSubmit={criar} className="glass-card flex flex-col gap-3 rounded-3xl p-5 sm:flex-row sm:items-center">
          <Input value={novo} onChange={(e) => setNovo(e.target.value)} placeholder="Nome do cliente (ex.: Renato Stefan)" aria-label="Nome do novo contrato" />
          <Button type="submit" disabled={!novo.trim()} className="shrink-0">
            <Plus size={15} /> Criar contrato
          </Button>
        </form>
        {erro && <p className="text-[13px] text-danger">{erro}</p>}

        <div className="glass-card rounded-3xl p-5">
          <div className="relative mb-4">
            <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Pesquisar por nome ou id" aria-label="Pesquisar" className="pl-10" />
          </div>
          <div className="overflow-x-auto rounded-2xl border border-border-subtle">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-surface-2 text-[11.5px] uppercase tracking-wide text-text-tertiary">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Id</th>
                  <th className="px-4 py-2.5 font-semibold">Nome</th>
                  <th className="px-4 py-2.5 font-semibold">Membros</th>
                  <th className="px-4 py-2.5 font-semibold">Chaves ativas</th>
                  <th className="px-4 py-2.5" aria-label="Ação" />
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.id} className="border-t border-border-subtle hover:bg-surface-2/60">
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <code title={l.id} className="font-mono text-[12.5px] text-text-secondary">{l.id.slice(0, 8)}</code>
                      <Copiar texto={l.id} />
                    </td>
                    <td className="px-4 py-2.5 font-medium text-text-primary">{l.name}</td>
                    <td className="px-4 py-2.5 text-text-secondary">{l.membros}</td>
                    <td className="px-4 py-2.5 text-text-secondary">{l.chavesAtivas}</td>
                    <td className="px-4 py-2.5 text-right">
                      <NextLink href={`/${idCurto(l.id)}/inicio`} className={buttonVariants({ size: "sm" })}>
                        Entrar no contrato
                      </NextLink>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-between text-[12px] text-text-tertiary">
            <span>{`${linhas.length} de ${total}`}</span>
            {linhas.length < total && (
              <Button variant="secondary" size="sm" disabled={carregando} onClick={() => carregar(busca, pagina + 1)}>
                {carregando && <Loader2 size={14} className="animate-spin" />} Mostrar mais
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
