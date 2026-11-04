"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { AnimatePresence, animate, motion, useDragControls, useMotionValue, useReducedMotion, type PanInfo } from "framer-motion";
import { ArrowUp, CircleDollarSign, Funnel, Maximize2, MessagesSquare, Minimize2, Trash2, UserPlus, X } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { MarcaEva } from "@/components/layout/marca-eva";
import { OrbeEva } from "@/components/layout/orbe-eva";
import { BolhaDaPessoa, Pensando, RespostaDaEva } from "@/components/chat/mensagens";
import type { CartaoMostrado } from "@/components/chat/cartao-do-chat";
import { cn } from "@/lib/utils";

// O gráfico (echarts) pesa: só carrega quando a Eva mostra o primeiro cartão.
const CartaoDoChat = dynamic(() => import("@/components/chat/cartao-do-chat"), {
  ssr: false,
  loading: () => <div aria-busy="true" className="h-48 w-full animate-pulse rounded-[20px] bg-raised/60" />,
});

// Chat da Eva: orbe flutuante em todas as telas. Pergunta em português, a Eva
// consulta os dados do contrato (só lê) e responde. O orbe e a janela se
// arrastam pela tela (o orbe gruda na borda mais perto, a janela fica onde
// você largar) e a posição é lembrada neste navegador. Abaixo de 640px a
// janela vira uma folha na base da tela. A conversa vive na tela: recarregar
// começa de novo.

type Mensagem = { role: "user" | "assistant"; content: string; cartoes?: CartaoMostrado[] };
type Falha = { texto: string };

const LANCADOR = 56;
const MARGEM = 16;
const LARGURA_DA_FOLHA = 640;
const CHAVE = "eva-chat-v1";
const LIMITE = 2000;

// No computador o trilho de atalhos ocupa a esquerda e o topo tem as abas: o orbe e a janela ficam fora deles.
const bordas = (largura: number) => ({ esq: largura >= 860 ? 96 : MARGEM, topo: largura >= 860 ? 72 : 60 });

const SUGESTOES = [
  { icone: Funnel, texto: "Como está o funil de vendas?" },
  { icone: UserPlus, texto: "Quantos leads novos tivemos nos últimos 7 dias?" },
  { icone: CircleDollarSign, texto: "Mostre um gráfico das vendas por mês" },
  { icone: MessagesSquare, texto: "Como estão as conversas de hoje?" },
];

type Salvo = { dir?: boolean; y?: number; painel?: { x: number; y: number }; grande?: boolean };

// Só conveniência deste navegador: sem armazenamento, tudo funciona do mesmo jeito.
function ler(): Salvo {
  try {
    return JSON.parse(localStorage.getItem(CHAVE) ?? "{}") ?? {};
  } catch {
    return {};
  }
}
function gravar(parte: Salvo) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify({ ...ler(), ...parte }));
  } catch {
    // Armazenamento bloqueado: a posição não é lembrada.
  }
}

const limitar = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max));

function useViewport() {
  const s = React.useSyncExternalStore(
    (aoMudar) => {
      window.addEventListener("resize", aoMudar);
      return () => window.removeEventListener("resize", aoMudar);
    },
    () => `${window.innerWidth}x${window.innerHeight}`,
    () => ""
  );
  return React.useMemo(() => {
    if (!s) return null;
    const [w, h] = s.split("x").map(Number);
    return { w, h };
  }, [s]);
}

export function ChatDaEva() {
  const vp = useViewport();
  return vp ? <Chat vp={vp} /> : null;
}

function Chat({ vp }: { vp: { w: number; h: number } }) {
  const pathname = usePathname();
  const reduz = useReducedMotion();
  const folha = vp.w < LARGURA_DA_FOLHA;

  const [salvo] = React.useState(ler);
  const [dir, setDir] = React.useState(salvo.dir ?? true);
  const [grande, setGrande] = React.useState(salvo.grande ?? false);
  const [aberto, setAberto] = React.useState(false);
  const [arrastando, setArrastando] = React.useState(false);
  const [naoLida, setNaoLida] = React.useState(false);
  const [mensagens, setMensagens] = React.useState<Mensagem[]>([]);
  const [animarIdx, setAnimarIdx] = React.useState(-1);
  const [texto, setTexto] = React.useState("");
  const [carregando, setCarregando] = React.useState(false);
  const [falha, setFalha] = React.useState<Falha | null>(null);

  const { esq, topo } = bordas(vp.w);
  const lx = useMotionValue(dir ? vp.w - LANCADOR - MARGEM : esq);
  const ly = useMotionValue(limitar(salvo.y ?? vp.h - LANCADOR - MARGEM, topo, vp.h - LANCADOR - MARGEM));
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const controles = useDragControls();
  const botao = React.useRef<HTMLButtonElement>(null);
  const campo = React.useRef<HTMLTextAreaElement>(null);
  const corpo = React.useRef<HTMLDivElement>(null);
  const pedido = React.useRef<AbortController | null>(null);
  const abertoRef = React.useRef(aberto);
  React.useEffect(() => {
    abertoRef.current = aberto;
  });
  React.useEffect(() => () => pedido.current?.abort(), []);

  const tam = { w: Math.min(grande ? 640 : 416, vp.w - 2 * MARGEM), h: Math.min(grande ? 760 : 580, vp.h - 2 * MARGEM) };
  const mola = reduz ? { duration: 0.15 } : { type: "spring" as const, bounce: 0.2, visualDuration: 0.5 };
  const movel = !folha;

  // Tela redimensionada: o orbe e a janela voltam para dentro dela.
  React.useLayoutEffect(() => {
    lx.set(dir ? vp.w - LANCADOR - MARGEM : esq);
    ly.set(limitar(ly.get(), topo, vp.h - LANCADOR - MARGEM));
    if (aberto && movel) {
      px.set(limitar(px.get(), esq, vp.w - tam.w - MARGEM));
      py.set(limitar(py.get(), topo, vp.h - tam.h - MARGEM));
    }
  }, [vp.w, vp.h, dir, aberto, movel, tam.w, tam.h, esq, topo, lx, ly, px, py]);

  // A janela abre ao lado do orbe: acima dele, ou abaixo se não houver espaço.
  function encaixar() {
    const x = dir ? vp.w - tam.w - MARGEM : esq;
    const acima = ly.get() - 12 - tam.h;
    const y = acima >= topo ? acima : ly.get() + LANCADOR + 12;
    return { x, y: limitar(y, topo, vp.h - tam.h - MARGEM) };
  }

  function abrir() {
    const guardada = ler().painel;
    const p = movel && guardada ? { x: limitar(guardada.x, esq, vp.w - tam.w - MARGEM), y: limitar(guardada.y, topo, vp.h - tam.h - MARGEM) } : encaixar();
    px.set(p.x);
    py.set(p.y);
    setAberto(true);
    setNaoLida(false);
  }

  function fechar() {
    setAberto(false);
    botao.current?.focus();
  }

  function recentrar() {
    const p = encaixar();
    animate(px, p.x, mola);
    animate(py, p.y, mola);
    gravar({ painel: undefined });
  }

  function alternarTamanho() {
    setGrande((g) => {
      gravar({ grande: !g });
      return !g;
    });
  }

  // Largou o orbe: projeta a inércia, gruda na borda mais perto e lembra onde ficou.
  function soltouOrbe(_: unknown, info: PanInfo) {
    setArrastando(false);
    const x = lx.get() + info.velocity.x * 0.2;
    const noLadoDireito = x + LANCADOR / 2 > vp.w / 2;
    const y = limitar(ly.get() + info.velocity.y * 0.2, topo, vp.h - LANCADOR - MARGEM);
    setDir(noLadoDireito);
    animate(lx, noLadoDireito ? vp.w - LANCADOR - MARGEM : esq, mola);
    animate(ly, y, mola);
    gravar({ dir: noLadoDireito, y });
  }

  const rolar = React.useCallback((suave: boolean) => {
    corpo.current?.scrollTo({ top: corpo.current.scrollHeight, behavior: suave && !reduz ? "smooth" : "auto" });
  }, [reduz]);
  // Resposta com cartões é alta: mostra o começo dela, não o fim.
  React.useEffect(() => {
    const ultima = mensagens.at(-1);
    const inicio = ultima?.cartoes?.length ? corpo.current?.querySelector<HTMLElement>(`[data-msg="${mensagens.length - 1}"]`) : null;
    if (inicio && corpo.current) corpo.current.scrollTo({ top: Math.max(0, inicio.offsetTop - 8), behavior: reduz ? "auto" : "smooth" });
    else rolar(true);
  }, [mensagens, carregando, falha, rolar, reduz]);
  React.useEffect(() => {
    if (aberto) campo.current?.focus();
  }, [aberto]);

  async function enviar(pergunta: string) {
    const p = pergunta.trim();
    if (!p || carregando) return;
    const conversa: Mensagem[] = [...mensagens, { role: "user", content: p }];
    setMensagens(conversa);
    setTexto("");
    if (campo.current) campo.current.style.height = "auto";
    setFalha(null);
    setCarregando(true);
    pedido.current?.abort();
    const ctrl = (pedido.current = new AbortController());
    try {
      const res = await fetch("/api/analytics/ia/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ctrl.signal,
        // Só a tela, sem o id do contrato.
        body: JSON.stringify({ mensagens: conversa.map(({ role, content }) => ({ role, content })), pagina: "/" + pathname.split("/").slice(2).join("/") }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok || typeof d?.resposta !== "string") {
        setFalha({ texto: d?.error ?? "Não deu certo agora. Tenta de novo em instantes." });
        return;
      }
      setAnimarIdx(conversa.length);
      setMensagens([...conversa, { role: "assistant", content: d.resposta, cartoes: Array.isArray(d.cartoes) ? d.cartoes : undefined }]);
      if (!abertoRef.current) setNaoLida(true);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setFalha({ texto: "Sem conexão com o servidor. Confere a internet e tenta de novo." });
    } finally {
      if (pedido.current === ctrl) setCarregando(false);
    }
  }

  function limpar() {
    pedido.current?.abort();
    setMensagens([]);
    setAnimarIdx(-1);
    setFalha(null);
    setCarregando(false);
    campo.current?.focus();
  }

  const temConversa = mensagens.length > 0;

  return (
    <div data-print-ocultar className="pointer-events-none fixed inset-0 z-40">
      <AnimatePresence>
        {aberto && (
          <motion.section
            key="painel"
            role="dialog"
            aria-modal="false"
            aria-label="Conversa com a Eva"
            onKeyDown={(e) => {
              if (e.key === "Escape") fechar();
            }}
            style={movel ? { x: px, y: py, width: tam.w, height: tam.h, originX: dir ? 1 : 0, originY: 1 } : { originY: 1 }}
            drag={movel}
            dragListener={false}
            dragControls={controles}
            dragMomentum={false}
            dragElastic={0.08}
            dragConstraints={{ left: esq, top: topo, right: vp.w - tam.w - MARGEM, bottom: vp.h - tam.h - MARGEM }}
            onDragEnd={() => gravar({ painel: { x: px.get(), y: py.get() } })}
            initial={reduz ? { opacity: 0 } : movel ? { opacity: 0, scale: 0.88 } : { opacity: 0, y: 48 }}
            animate={{ opacity: 1, scale: 1, ...(movel ? {} : { y: 0 }) }}
            exit={reduz ? { opacity: 0 } : movel ? { opacity: 0, scale: 0.92 } : { opacity: 0, y: 48 }}
            transition={mola}
            className={cn(
              "pointer-events-auto absolute flex flex-col overflow-hidden rounded-[26px] border border-border-subtle text-text-primary",
              "bg-[color-mix(in_srgb,var(--surface-overlay)_76%,transparent)] backdrop-blur-2xl backdrop-saturate-[1.6]",
              "shadow-[0_28px_70px_-14px_rgba(0,0,0,0.6),inset_0_1px_0_color-mix(in_srgb,white_24%,transparent)]",
              "[@media(prefers-reduced-transparency:reduce)]:bg-overlay [@media(prefers-reduced-transparency:reduce)]:backdrop-blur-none",
              movel ? "left-0 top-0" : "inset-x-2 bottom-2 h-[min(82dvh,640px)]"
            )}
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-[radial-gradient(90%_100%_at_20%_0%,rgba(110,170,255,0.22),transparent_70%),radial-gradient(80%_100%_at_95%_0%,rgba(195,145,255,0.18),transparent_70%)]"
            />

            <header
              onPointerDown={(e) => {
                if (movel && !(e.target as HTMLElement).closest("button")) controles.start(e);
              }}
              onDoubleClick={movel ? recentrar : undefined}
              className={cn("relative flex shrink-0 select-none items-center gap-2 px-3 pb-2 pt-4", movel && "cursor-grab touch-none active:cursor-grabbing")}
            >
              {movel && <span aria-hidden="true" className="absolute left-1/2 top-1.5 h-1 w-9 -translate-x-1/2 rounded-full bg-text-tertiary/30" />}
              {temConversa ? (
                <OrbeEva falando={carregando} className="-my-2.5 -ml-1.5 size-[60px] shrink-0" />
              ) : (
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#6eaaff]/25 to-[#c391ff]/25 ring-1 ring-border-subtle">
                  <MarcaEva size={18} />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-body font-semibold leading-tight">Eva</h2>
                <p className="flex items-center gap-1.5 truncate text-caption text-text-tertiary">
                  <span className={cn("size-1.5 rounded-full bg-[#4ade80]", carregando ? "animate-ping" : "motion-safe:animate-pulse")} aria-hidden="true" />
                  {carregando ? "Pensando..." : "Pronta · só leio os dados"}
                </p>
              </div>
              {temConversa && (
                <IconButton aria-label="Limpar a conversa" size="sm" onClick={limpar} tooltip>
                  <Trash2 />
                </IconButton>
              )}
              {movel && (
                <IconButton aria-label={grande ? "Diminuir a janela" : "Aumentar a janela"} size="sm" onClick={alternarTamanho}>
                  {grande ? <Minimize2 /> : <Maximize2 />}
                </IconButton>
              )}
              <IconButton aria-label="Fechar a conversa" size="sm" onClick={fechar}>
                <X />
              </IconButton>
            </header>

            <div ref={corpo} role="log" aria-live="polite" className="relative flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-3 pt-1">
              {!temConversa && (
                <div className="flex flex-1 flex-col items-center justify-center gap-1 text-center">
                  <OrbeEva className="-my-5 size-[150px] shrink-0" />
                  <motion.h3
                    initial={reduz ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1, type: "spring", bounce: 0.15, visualDuration: 0.45 }}
                    className="font-display text-title-sm font-semibold"
                  >
                    Oi! O que você quer saber hoje?
                  </motion.h3>
                  <p className="max-w-[28ch] text-small text-text-secondary">Eu leio os dados do contrato e respondo na hora.</p>
                  <div className="mt-3 flex w-full flex-col gap-2">
                    {SUGESTOES.map(({ icone: Icone, texto: t }, i) => (
                      <motion.button
                        key={t}
                        type="button"
                        onClick={() => enviar(t)}
                        initial={reduz ? false : { opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.18 + i * 0.07, type: "spring", bounce: 0.15, visualDuration: 0.45 }}
                        whileHover={reduz ? undefined : { x: 3 }}
                        whileTap={{ scale: 0.98 }}
                        className="flex items-center gap-2.5 rounded-[14px] border border-border-subtle bg-raised/60 px-3 py-2.5 text-left text-small text-text-primary backdrop-blur-md transition-colors hover:bg-hover focus-visible:outline-2 focus-visible:outline-focus"
                      >
                        <Icone size={15} aria-hidden className="shrink-0 text-accent-fg" />
                        {t}
                      </motion.button>
                    ))}
                  </div>
                </div>
              )}
              {mensagens.map((m, i) =>
                m.role === "user" ? (
                  <BolhaDaPessoa key={i} texto={m.content} />
                ) : (
                  <div key={i} data-msg={i} className="flex flex-col gap-3">
                    <RespostaDaEva texto={m.content} animar={i === animarIdx} aoAvancar={() => rolar(false)} />
                    {m.cartoes?.map((c, k) => (
                      <div key={k} className="pl-8">
                        <CartaoDoChat cartao={c} atraso={0.15 + k * 0.1} />
                      </div>
                    ))}
                  </div>
                )
              )}
              {carregando && <Pensando />}
              {falha && (
                <motion.p
                  role="alert"
                  initial={reduz ? false : { opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="self-start rounded-[16px] bg-danger-subtle px-3.5 py-2.5 text-small text-danger"
                >
                  {falha.texto}
                </motion.p>
              )}
            </div>

            <form
              className="relative shrink-0 px-3 pb-3 pt-1"
              onSubmit={(e) => {
                e.preventDefault();
                enviar(texto);
              }}
            >
              <div className="flex items-end gap-2 rounded-[22px] border border-border-subtle bg-raised/70 p-1.5 pl-4 backdrop-blur-md transition-shadow focus-within:border-accent-solid/50 focus-within:shadow-[0_0_0_3px_rgba(80,120,255,0.18)]">
                <textarea
                  ref={campo}
                  value={texto}
                  onChange={(e) => {
                    setTexto(e.target.value.slice(0, LIMITE));
                    e.target.style.height = "auto";
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      enviar(texto);
                    }
                  }}
                  rows={1}
                  maxLength={LIMITE}
                  aria-label="Pergunta para a Eva"
                  placeholder="Pergunte à Eva..."
                  className="max-h-32 min-h-9 flex-1 resize-none bg-transparent py-2 text-small text-text-primary outline-none placeholder:text-text-tertiary"
                />
                <motion.button
                  type="submit"
                  disabled={!texto.trim() || carregando}
                  aria-label="Enviar para a Eva"
                  whileTap={{ scale: 0.88 }}
                  className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#2563eb] to-[#6d4cff] text-white shadow-[0_6px_16px_-6px_rgba(80,90,255,0.8)] transition-opacity disabled:pointer-events-none disabled:opacity-40 disabled:shadow-none"
                >
                  <ArrowUp size={17} aria-hidden />
                </motion.button>
              </div>
              <p className="mt-1.5 px-2 text-center text-caption text-text-tertiary">A Eva só lê os dados do contrato. Confira os números importantes.</p>
            </form>
          </motion.section>
        )}
      </AnimatePresence>

      {!(aberto && folha) && (
        <motion.button
          ref={botao}
          type="button"
          style={{ x: lx, y: ly }}
          drag
          dragMomentum={false}
          dragElastic={0.12}
          dragConstraints={{ left: esq, top: topo, right: vp.w - LANCADOR - MARGEM, bottom: vp.h - LANCADOR - MARGEM }}
          onDragStart={() => setArrastando(true)}
          onDragEnd={soltouOrbe}
          onTap={() => (aberto ? fechar() : abrir())}
          onClick={(e) => {
            // Teclado (Enter e Espaço) chega como clique sem ponteiro; o toque já passou por onTap.
            if (e.detail !== 0) return;
            if (aberto) fechar();
            else abrir();
          }}
          whileHover={reduz ? undefined : { scale: 1.07 }}
          whileTap={{ scale: 0.93 }}
          aria-label={aberto ? "Fechar a conversa com a Eva" : "Perguntar à Eva"}
          aria-expanded={aberto}
          className="group pointer-events-auto absolute left-0 top-0 size-14 cursor-grab touch-none select-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-focus active:cursor-grabbing"
        >
          <span aria-hidden="true" className="absolute -inset-2.5 rounded-full bg-[radial-gradient(closest-side,rgba(110,170,255,0.5),rgba(195,145,255,0.28)_55%,transparent)] blur-md motion-safe:animate-[eva-respira_4.5s_ease-in-out_infinite]" />
          <span
            aria-hidden="true"
            className={cn(
              "absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,#6eaaff,#c391ff,#ff8ad8,#6eaaff)]",
              carregando ? "motion-safe:animate-[eva-gira_1.4s_linear_infinite]" : "motion-safe:animate-[eva-gira_8s_linear_infinite]"
            )}
          />
          <span className="absolute inset-[2.5px] grid place-items-center rounded-full bg-[color-mix(in_srgb,var(--surface-overlay)_90%,transparent)] shadow-[inset_0_1px_0_color-mix(in_srgb,white_28%,transparent)] backdrop-blur-xl">
            <MarcaEva size={24} className="text-text-primary" />
          </span>
          {naoLida && <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 size-3.5 animate-pulse rounded-full bg-[#ff5d8f] ring-2 ring-[var(--surface-page)]" />}
          {!aberto && !arrastando && (
            <span
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute top-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-border-subtle bg-overlay/90 px-3 py-1 text-caption text-text-primary opacity-0 shadow-overlay backdrop-blur transition duration-200 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100",
                dir ? "right-[calc(100%+12px)] translate-x-1" : "left-[calc(100%+12px)] -translate-x-1"
              )}
            >
              Pergunte à Eva
            </span>
          )}
        </motion.button>
      )}
    </div>
  );
}
