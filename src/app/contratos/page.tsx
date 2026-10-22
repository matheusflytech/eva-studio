"use client";

import * as React from "react";
import NextLink from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, Copy, Check, ShieldCheck, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { ehCaminhoDeSecao, idCurto } from "@/lib/contrato/rotas";
import { Button, buttonVariants } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { FundoVivo } from "@/components/layout/fundo-vivo";
import { MarcaEva } from "@/components/layout/marca-eva";
import { pulsar } from "@/lib/fundo/eventos";
import type { ContratoDaSessao } from "@/lib/data/types";

// "Olá Fulano, qual contrato deseja acessar?" — depois do login, e pelo
// "Trocar de contrato" do menu. Quem tem um contrato só entra direto (a não ser
// que tenha vindo do menu, ?escolher=1). Superadmin vê todos, paginado.
//
// A lista é só navegação: entrar em /<id>/... confere o vínculo no servidor.
//
// Visual: continuação do login. Mesmo palco escuro (preto, feixe de luz,
// fundo vivo) e o mesmo cartão de vidro, agora com a lista dos contratos.

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

/** O palco do login fica montado o tempo todo: carregando, redirecionando ou com a lista. */
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
    // relative z-10: fica acima do link esticado da linha, para o clique copiar e não entrar.
    <span className="relative z-10 inline-flex shrink-0 items-center gap-0.5">
      <code title={id} className="font-mono text-caption text-text-tertiary">
        {id.slice(0, 8)}
      </code>
      <button
        type="button"
        onClick={copiar}
        aria-label={copiado ? "Id copiado" : `Copiar o id completo ${id}`}
        title="Copiar o id completo"
        className="grid h-7 w-7 place-items-center rounded-full text-text-tertiary transition-colors hover:bg-hover hover:text-text-primary"
      >
        {copiado ? <Check size={13} className="text-success" /> : <Copy size={13} />}
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

  // Carregando ou indo direto para o contrato: só o palco, sem piscar outra cor.
  if (isLoading || !session || unico || (!dados && carregando)) return null;

  const temMais = dados ? lista.length < dados.total : false;
  const semContrato = dados && dados.totalSemBusca === 0;

  return (
    <>
      <header className="relative z-10 flex items-center justify-between gap-3 px-4 pt-5 sm:px-8 sm:pt-7">
        <span className="text-small font-semibold text-text-secondary">Eva Holding</span>
        <div className="flex items-center gap-1.5">
          {dados?.superadmin && (
            <NextLink href="/admin" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              <ShieldCheck size={14} aria-hidden="true" /> Painel da Eva
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
            <LogOut size={14} aria-hidden="true" /> Sair
          </Button>
        </div>
      </header>

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 py-8">
        <div className="cartao-vidro w-full max-w-[460px]">
          <span className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-[13px] bg-page ring-1 ring-border-default">
            <MarcaEva size={22} className="text-text-primary" />
          </span>
          <h1 className="text-center text-title font-semibold tracking-tight text-text-primary">
            Olá {dados?.nome || session.name}, qual contrato deseja acessar?
          </h1>
          <p className="mt-1 text-center text-small text-text-secondary">
            {dados?.superadmin
              ? `Você é da equipe da Eva e vê todos os ${dados.totalSemBusca} contratos.`
              : "Cada contrato é um cliente, com os próprios dados, membros e chaves."}
          </p>

          {semContrato ? (
            <p className="mt-6 text-center text-small text-text-tertiary">
              Você ainda não participa de nenhum contrato. Peça um convite a quem administra o contrato da sua empresa.
            </p>
          ) : (
            <>
              <SearchInput
                value={busca}
                onValueChange={setBusca}
                placeholder="Pesquisar por nome ou id"
                aria-label="Pesquisar por nome ou id"
                className="mt-6"
                autoFocus
              />

              {/* Lista colada com linhas finas; rola dentro do cartão para a busca não sumir. */}
              <ul className="mt-4 max-h-[min(52dvh,440px)] overflow-y-auto border-y border-border-default" aria-busy={carregando || undefined}>
                {lista.map((c) => (
                  <li
                    key={c.id}
                    className="group relative flex min-h-12 items-center gap-3 border-t border-border-default px-2 transition-colors first:border-t-0 hover:bg-hover"
                  >
                    {/* Link esticado: a linha inteira entra no contrato; o botão de copiar fica por cima. */}
                    <NextLink
                      href={`/${idCurto(c.id)}${para}`}
                      onClick={(e) => pulsar(e.currentTarget, 1.6)}
                      className="min-w-0 flex-1 truncate py-3 text-body font-medium text-text-primary outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:rounded-[10px] focus-visible:after:ring-2 focus-visible:after:ring-focus"
                    >
                      {c.name}
                      {c.id === dados?.ultimo && (
                        <span className="ml-2 font-mono text-caption font-normal text-text-tertiary">último usado</span>
                      )}
                    </NextLink>
                    <IdCurto id={c.id} />
                    <ChevronRight
                      size={15}
                      aria-hidden="true"
                      className="shrink-0 text-text-tertiary transition-transform group-hover:translate-x-0.5 group-hover:text-text-primary"
                    />
                  </li>
                ))}
                {lista.length === 0 && !carregando && (
                  <li className="px-2 py-6 text-center text-small text-text-tertiary">Nenhum contrato com “{busca}”.</li>
                )}
              </ul>

              <div className="mt-3 flex min-h-7 items-center justify-between gap-3">
                <span className="font-mono text-caption tabular-nums text-text-tertiary">
                  {dados ? `${lista.length} de ${dados.total}` : ""}
                </span>
                {temMais && (
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={carregando}
                    onClick={() => dados && carregar(busca, dados.pagina + 1)}
                  >
                    Mostrar mais
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </main>

      <span className="relative z-10 pb-6 text-center font-mono text-caption text-text-disabled">evapp.vercel.app</span>
    </>
  );
}

export default function ContratosPage() {
  // useSearchParams exige Suspense: sem ele o Next recusa gerar a página. O
  // palco fica fora dele para o fundo não reiniciar quando a lista chega.
  return (
    <Palco>
      <React.Suspense fallback={null}>
        <Escolher />
      </React.Suspense>
    </Palco>
  );
}
