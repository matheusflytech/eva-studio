"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "@/lib/contrato/navegacao";
import { MessagesSquare, X } from "lucide-react";
import { ListaDeConversas } from "@/components/inbox/lista-de-conversas";
import { ConversaAberta } from "@/components/inbox/conversa-aberta";
import { PainelDoCliente } from "@/components/inbox/painel-do-cliente";
import { useSondagem } from "@/components/inbox/use-sondagem";
import type { Conversa, IdDoFiltro, Membro, Resumo } from "@/components/inbox/tipos";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAgentsStore } from "@/lib/stores/agents-store";

// ---------------------------------------------------------------------------
// Atendimento.
//
// Três colunas, no formato que todo mundo já conhece de WhatsApp Web e
// Intercom: quem escreveu, a conversa, e quem é essa pessoa. A terceira é a que
// importa pro produto: o CRM não fica noutra tela. O atendente muda a etapa do
// negócio, cria a tarefa e etiqueta o cliente sem sair da conversa.
//
// As colunas são coladas, separadas só por uma linha fina: uma superfície só,
// com o fundo vivo aparecendo por trás (sem cartões flutuando).
//
// A tela se mantém atualizada sozinha, mas só com a aba à vista (ver
// use-sondagem.ts), e escolhe o que pedir: a lista inteira a cada poucos
// segundos, as últimas mensagens só da conversa aberta.
// ---------------------------------------------------------------------------

const TAMANHO_DA_PAGINA = 40;
const CHAVE_DO_SOM = "eva-inbox-som";

function tocarAviso() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const ganho = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.18);
    ganho.gain.setValueAtTime(0.0001, ctx.currentTime);
    ganho.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
    ganho.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
    osc.connect(ganho).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.32);
    osc.onended = () => void ctx.close();
  } catch {
    // Navegador sem áudio ou bloqueado até o primeiro clique: sem som, só isso.
  }
}

function Conversas() {
  const router = useRouter();
  const params = useSearchParams();
  const selecionada = params.get("c");

  const [filtro, setFiltro] = React.useState<IdDoFiltro>("todas");
  const [busca, setBusca] = React.useState("");
  const [buscaAplicada, setBuscaAplicada] = React.useState("");
  const [canal, setCanal] = React.useState("");
  const [agente, setAgente] = React.useState("");
  const { agents, isLoaded: agentesCarregados, load: carregarAgentes } = useAgentsStore();
  const [testes, setTestes] = React.useState(false);

  const [itens, setItens] = React.useState<Conversa[]>([]);
  const [extras, setExtras] = React.useState<Conversa[]>([]);
  const [temMais, setTemMais] = React.useState(false);
  const [carregando, setCarregando] = React.useState(true);
  const [carregandoMais, setCarregandoMais] = React.useState(false);
  const [avulsa, setAvulsa] = React.useState<Conversa | null>(null);
  const [resumo, setResumo] = React.useState<Resumo | null>(null);
  const [membros, setMembros] = React.useState<Membro[]>([]);
  const [meuId, setMeuId] = React.useState("");
  const [painelAberto, setPainelAberto] = React.useState(false);
  const [som, setSom] = React.useState(false);

  const naoLidasAnterior = React.useRef<number | null>(null);
  const somRef = React.useRef(som);
  somRef.current = som;
  const filtrosRef = React.useRef({ filtro, buscaAplicada, canal, agente, testes });
  filtrosRef.current = { filtro, buscaAplicada, canal, agente, testes };
  const geracao = React.useRef(0);

  React.useEffect(() => {
    try {
      setSom(localStorage.getItem(CHAVE_DO_SOM) === "1");
    } catch {
      // armazenamento bloqueado: segue sem som
    }
  }, []);

  function mudarSom(v: boolean) {
    setSom(v);
    try {
      localStorage.setItem(CHAVE_DO_SOM, v ? "1" : "0");
    } catch {
      // idem
    }
    if (v) tocarAviso(); // confirma que funciona, e libera o áudio do navegador
  }

  // A busca espera a pessoa parar de digitar. Uma consulta por tecla, numa
  // tabela com pool de conexão pequeno, é jeito de derrubar o banco.
  React.useEffect(() => {
    const t = setTimeout(() => setBuscaAplicada(busca.trim()), 300);
    return () => clearTimeout(t);
  }, [busca]);

  const montarUrl = React.useCallback((extra: Record<string, string> = {}) => {
    const f = filtrosRef.current;
    const p = new URLSearchParams({ filtro: f.filtro, limite: String(TAMANHO_DA_PAGINA), ...extra });
    if (f.buscaAplicada) p.set("q", f.buscaAplicada);
    if (f.canal) p.set("canal", f.canal);
    if (f.agente) p.set("agente", f.agente);
    if (f.testes) p.set("testes", "1");
    return `/api/conversations?${p}`;
  }, []);

  const carregarResumo = React.useCallback(async () => {
    const res = await fetch("/api/inbox/summary");
    if (!res.ok) return;
    const dados = (await res.json()) as Resumo;
    setResumo(dados);

    // Chegou conversa nova desde a última olhada: avisa. Só soa se a pessoa
    // pediu, e só quando ela não está olhando a tela agora.
    const antes = naoLidasAnterior.current;
    if (antes !== null && dados.naoLidas > antes && somRef.current) tocarAviso();
    naoLidasAnterior.current = dados.naoLidas;
  }, []);

  const carregarLista = React.useCallback(async () => {
    const g = geracao.current;
    const res = await fetch(montarUrl());
    if (!res.ok || g !== geracao.current) return;
    const dados = await res.json();
    if (g !== geracao.current) return;
    setItens(dados.conversations as Conversa[]);
    setExtras((e) => {
      if (e.length === 0) setTemMais(!!dados.temMais);
      return e;
    });
    setCarregando(false);
  }, [montarUrl]);

  // Trocou o filtro ou a busca: recomeça do zero e não aceita resposta de um
  // pedido antigo que chegue atrasado.
  React.useEffect(() => {
    geracao.current += 1;
    setItens([]);
    setExtras([]);
    setTemMais(false);
    setCarregando(true);
    void carregarLista();
  }, [filtro, buscaAplicada, canal, agente, testes, carregarLista]);

  React.useEffect(() => {
    if (!agentesCarregados) void carregarAgentes();
  }, [agentesCarregados, carregarAgentes]);

  const lista = React.useMemo(
    () => [...itens, ...extras.filter((e) => !itens.some((i) => i.id === e.id))],
    [itens, extras]
  );

  const atual = React.useMemo(
    () => lista.find((c) => c.id === selecionada) ?? (avulsa?.id === selecionada ? avulsa : null),
    [lista, selecionada, avulsa]
  );

  // Conversa aberta por link, ou que sumiu da lista por causa do filtro: busca
  // ela à parte pra a tela não ficar vazia com um id na URL.
  const carregarAvulsa = React.useCallback(async () => {
    if (!selecionada || lista.some((c) => c.id === selecionada)) return;
    const res = await fetch(`/api/conversations/${selecionada}`);
    if (res.ok) setAvulsa((await res.json()).conversation as Conversa);
  }, [selecionada, lista]);

  useSondagem(async () => {
    await Promise.all([carregarLista(), carregarResumo(), carregarAvulsa()]);
  }, 5000);

  React.useEffect(() => {
    fetch("/api/members")
      .then((r) => r.json())
      .then((d) => {
        setMeuId(d.me?.userId ?? "");
        setMembros(d.members ?? []);
      })
      .catch(() => {});
  }, []);

  // Contador no título da aba: o jeito mais barato de saber que chegou algo
  // sem estar olhando a tela.
  React.useEffect(() => {
    const n = resumo?.naoLidas ?? 0;
    const base = "Eva";
    document.title = n > 0 ? `(${n}) ${base}` : base;
    return () => {
      document.title = base;
    };
  }, [resumo?.naoLidas]);

  function selecionar(id: string) {
    router.replace(`/conversations?c=${id}`, { scroll: false });
  }

  function voltar() {
    router.replace("/conversations", { scroll: false });
  }

  const atualizarTudo = React.useCallback(() => {
    void carregarLista();
    void carregarResumo();
    void carregarAvulsa();
  }, [carregarLista, carregarResumo, carregarAvulsa]);

  async function carregarMais() {
    const ultima = lista[lista.length - 1];
    if (!ultima) return;
    setCarregandoMais(true);
    const res = await fetch(montarUrl({ antes: ultima.lastMessageAt }));
    if (res.ok) {
      const dados = await res.json();
      setExtras((e) => [...e, ...(dados.conversations as Conversa[])]);
      setTemMais(!!dados.temMais);
    }
    setCarregandoMais(false);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)] border-t border-border-subtle lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_240px]">
        <ListaDeConversas
          className={cn("lg:border-r lg:border-border-subtle", selecionada ? "hidden lg:flex" : "flex")}
          itens={lista}
          selecionada={selecionada}
          onSelecionar={selecionar}
          filtro={filtro}
          onFiltro={setFiltro}
          busca={busca}
          onBusca={setBusca}
          canal={canal}
          onCanal={setCanal}
          agente={agente}
          onAgente={setAgente}
          agentes={agents}
          testes={testes}
          onTestes={setTestes}
          resumo={resumo}
          carregando={carregando}
          temMais={temMais}
          carregandoMais={carregandoMais}
          onMais={carregarMais}
          som={som}
          onSom={mudarSom}
        />

        {atual ? (
          <ConversaAberta
            key={atual.id}
            className={cn(selecionada ? "flex" : "hidden lg:flex")}
            conversa={atual}
            meuId={meuId}
            membros={membros}
            onMudou={atualizarTudo}
            onVoltar={voltar}
            onAbrirCliente={() => setPainelAberto(true)}
          />
        ) : (
          <section className={cn("min-h-0 flex-col items-center justify-center p-10 text-center", selecionada ? "flex" : "hidden lg:flex")}>
            <MessagesSquare size={24} className="mb-3 text-text-tertiary" aria-hidden="true" />
            <h2 className="text-title-sm font-semibold tracking-tight text-text-primary">
              {selecionada ? "Carregando a conversa..." : "Escolha uma conversa"}
            </h2>
            {!selecionada && (
              <p className="mt-1.5 max-w-sm text-small text-text-secondary">
                Você vê o histórico, responde, deixa notas para a equipe e mexe no negócio do cliente sem sair daqui.
              </p>
            )}
          </section>
        )}

        {atual && (
          <PainelDoCliente
            key={`painel-${atual.id}`}
            className="hidden border-l border-border-subtle xl:flex"
            conversa={atual}
            onMudou={atualizarTudo}
          />
        )}
      </div>

      {/* Abaixo de 1280px o painel do cliente não cabe como coluna: abre por cima. */}
      {painelAberto && atual && (
        <div className="fixed inset-0 z-40 flex justify-end xl:hidden" role="dialog" aria-label="Dados do cliente">
          <div className="absolute inset-0 bg-backdrop backdrop-blur-sm" onClick={() => setPainelAberto(false)} />
          <div className="relative z-10 flex h-full w-full max-w-[360px] flex-col border-l border-border-subtle bg-panel">
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-border-subtle px-3.5">
              <h2 className="text-body font-semibold text-text-primary">Cliente</h2>
              <Button variant="ghost" size="icon" onClick={() => setPainelAberto(false)} aria-label="Fechar">
                <X aria-hidden="true" />
              </Button>
            </div>
            <PainelDoCliente conversa={atual} onMudou={atualizarTudo} className="min-h-0 flex-1" />
          </div>
        </div>
      )}
    </div>
  );
}

export default function ConversasPage() {
  // useSearchParams exige Suspense: sem ele o Next recusa gerar a página.
  return (
    <React.Suspense fallback={<div className="flex-1" />}>
      <Conversas />
    </React.Suspense>
  );
}
