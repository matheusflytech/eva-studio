"use client";

import * as React from "react";
import NextLink from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Copy, Check, Loader2, ShieldCheck, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { ehCaminhoDeSecao } from "@/lib/contrato/rotas";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import type { ContratoDaSessao } from "@/lib/data/types";

// "Olá Fulano, qual contrato deseja acessar?" — depois do login, e pelo
// "Trocar de contrato" do menu. Quem tem um contrato só entra direto (a não ser
// que tenha vindo do menu, ?escolher=1). Superadmin vê todos, paginado.
//
// A lista é só navegação: entrar em /<id>/... confere o vínculo no servidor.

interface Resposta {
  nome: string;
  superadmin: boolean;
  total: number;
  totalSemBusca: number;
  pagina: number;
  porPagina: number;
  contratos: ContratoDaSessao[];
  ultimo: string | null;
}

function IdCurto({ id }: { id: string }) {
  const [copiado, setCopiado] = React.useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(id);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      /* sem permissão de área de transferência: o id completo está no título */
    }
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <code title={id} className="font-mono text-[12.5px] text-text-secondary">
        {id.slice(0, 8)}
      </code>
      <button
        type="button"
        onClick={copiar}
        aria-label={copiado ? "Id copiado" : `Copiar o id completo ${id}`}
        title="Copiar o id completo"
        className="rounded-md p-1 text-text-tertiary transition-colors hover:bg-surface-3 hover:text-text-primary"
      >
        {copiado ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
      </button>
    </span>
  );
}

function Escolher() {
  const router = useRouter();
  const sp = useSearchParams();
  const { session, isLoading, logOut } = useAuth();
  const forcar = sp.get("escolher") === "1";
  const paraBruto = sp.get("para") ?? "";
  const para = ehCaminhoDeSecao(paraBruto) && !paraBruto.startsWith("//") ? paraBruto : "/inicio";

  const [busca, setBusca] = React.useState("");
  const [dados, setDados] = React.useState<Resposta | null>(null);
  const [lista, setLista] = React.useState<ContratoDaSessao[]>([]);
  const [carregando, setCarregando] = React.useState(true);
  const pedido = React.useRef(0);

  const carregar = React.useCallback(async (termo: string, pagina: number) => {
    const meu = ++pedido.current;
    setCarregando(true);
    try {
      const res = await fetch(`/api/contratos?busca=${encodeURIComponent(termo)}&pagina=${pagina}`);
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      const d: Resposta = await res.json();
      if (meu !== pedido.current) return;
      setDados(d);
      setLista((atual) => (pagina === 1 ? d.contratos : [...atual, ...d.contratos]));
    } finally {
      if (meu === pedido.current) setCarregando(false);
    }
  }, [router]);

  React.useEffect(() => {
    if (isLoading) return;
    if (!session) {
      router.replace("/login");
      return;
    }
    const t = setTimeout(() => carregar(busca, 1), busca ? 250 : 0);
    return () => clearTimeout(t);
  }, [busca, carregar, isLoading, session, router]);

  // Um contrato só (e não é superadmin): nem mostra a escolha.
  const unico = dados && !dados.superadmin && dados.totalSemBusca === 1 && !forcar ? dados.contratos[0] : null;
  React.useEffect(() => {
    if (unico) router.replace(`/${unico.id}${para}`);
  }, [unico, router, para]);

  if (isLoading || !session || unico || (!dados && carregando)) {
    return <div className="min-h-screen bg-bg-base" />;
  }

  const temMais = dados ? lista.length < dados.total : false;

  return (
    <div className="app-backdrop min-h-[100dvh] px-4 py-10">
      <div className="mx-auto flex max-w-3xl flex-col gap-5">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/eva-mark.png" alt="" width={22} height={22} />
            <span className="font-display text-[14px] font-bold text-text-primary">Eva</span>
          </span>
          <div className="flex items-center gap-2">
            {dados?.superadmin && (
              <NextLink href="/admin" className={buttonVariants({ variant: "secondary", size: "sm" })}>
                <ShieldCheck size={14} /> Painel da Eva
              </NextLink>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                logOut();
                router.push("/login");
              }}
            >
              <LogOut size={14} /> Sair
            </Button>
          </div>
        </div>

        <div className="glass-card rounded-3xl p-6">
          <h1 className="font-display text-xl font-semibold text-text-primary">
            Olá {dados?.nome || session.name}, qual contrato deseja acessar?
          </h1>
          <p className="mt-1 text-[13px] text-text-secondary">
            {dados?.superadmin
              ? `Você é da equipe da Eva e vê todos os ${dados.totalSemBusca} contratos.`
              : "Cada contrato é um cliente, com os próprios dados, membros e chaves."}
          </p>

          <div className="relative mt-5">
            <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Pesquisar por nome ou id"
              aria-label="Pesquisar por nome ou id"
              className="pl-10"
              autoFocus
            />
          </div>

          {dados && dados.totalSemBusca === 0 ? (
            <p className="mt-6 rounded-2xl bg-surface-2 px-4 py-5 text-center text-[13px] text-text-secondary">
              Você ainda não participa de nenhum contrato. Peça um convite a quem administra o contrato da sua empresa.
            </p>
          ) : (
            <div className="mt-5 overflow-hidden rounded-2xl border border-border-subtle">
              <table className="w-full text-left text-[13px]">
                <thead className="bg-surface-2 text-[11.5px] font-semibold uppercase tracking-wide text-text-tertiary">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Id do contrato</th>
                    <th className="px-4 py-2.5 font-semibold">Nome</th>
                    <th className="px-4 py-2.5" aria-label="Ação" />
                  </tr>
                </thead>
                <tbody>
                  {lista.map((c) => (
                    <tr key={c.id} className="border-t border-border-subtle hover:bg-surface-2/60">
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <IdCurto id={c.id} />
                      </td>
                      <td className="px-4 py-2.5 text-text-primary">
                        <span className="font-medium">{c.name}</span>
                        {c.id === dados?.ultimo && (
                          <span className="ml-2 rounded-full bg-surface-3 px-2 py-0.5 text-[11px] text-text-tertiary">
                            último usado
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <NextLink href={`/${c.id}${para}`} className={buttonVariants({ size: "sm" })}>
                          Acessar
                        </NextLink>
                      </td>
                    </tr>
                  ))}
                  {lista.length === 0 && !carregando && (
                    <tr>
                      <td colSpan={3} className="px-4 py-6 text-center text-text-tertiary">
                        Nenhum contrato com “{busca}”.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 flex items-center justify-between text-[12px] text-text-tertiary">
            <span>{dados ? `${lista.length} de ${dados.total}` : ""}</span>
            {temMais && (
              <Button
                variant="secondary"
                size="sm"
                disabled={carregando}
                onClick={() => dados && carregar(busca, dados.pagina + 1)}
              >
                {carregando && <Loader2 size={14} className="animate-spin" />} Mostrar mais
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ContratosPage() {
  // useSearchParams exige Suspense: sem ele o Next recusa gerar a página.
  return (
    <React.Suspense fallback={<div className="min-h-screen bg-bg-base" />}>
      <Escolher />
    </React.Suspense>
  );
}
