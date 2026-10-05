"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Sun, Building2, HeartPulse, ShoppingBag, Briefcase, GraduationCap, Sparkles,
  ArrowRight, ArrowLeft, Check, Loader2, MessageSquare, Handshake, PlayCircle, SlidersHorizontal,
} from "lucide-react";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PACOTES, type PacoteDeNicho } from "@/lib/niche-packs";
import { COR_DA_ETAPA, TIPO_POR_ID } from "@/lib/custom-fields";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Configuração inicial: escolha o seu tipo de negócio e o app monta o resto.
//
// Três passos curtos. Tudo que é criado aqui continua editável depois; o
// objetivo é a pessoa chegar no primeiro atendimento com o funil certo, os
// campos certos e um fluxo que já pergunta o que importa.
// ---------------------------------------------------------------------------

const ICONES: Record<PacoteDeNicho["icone"], React.ComponentType<{ size?: number; className?: string }>> = {
  sun: Sun, building: Building2, heart: HeartPulse, shopping: ShoppingBag,
  briefcase: Briefcase, graduation: GraduationCap, blank: Sparkles,
};

interface Resumo {
  funilId: string;
  funilNome: string;
  agenteId: string;
  campos: { entity: string; label: string }[];
}

export default function ComecarPage() {
  const router = useRouter();
  const [passo, setPasso] = React.useState<1 | 2 | 3>(1);
  const [escolhido, setEscolhido] = React.useState<PacoteDeNicho | null>(null);
  const [empresa, setEmpresa] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [resumo, setResumo] = React.useState<Resumo | null>(null);

  React.useEffect(() => {
    fetch("/api/onboarding")
      .then((r) => r.json())
      .then((d) => d.empresa && setEmpresa((e) => e || d.empresa))
      .catch(() => {});
  }, []);

  async function aplicar() {
    if (!escolhido) return;
    setBusy(true);
    setErro(null);
    const res = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pacote: escolhido.id, empresa }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setErro(d.error ?? "Não foi possível montar agora.");
      return;
    }
    setResumo(d.resumo);
    setPasso(3);
  }

  async function pular() {
    await fetch("/api/onboarding", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pular: true }) });
    router.push("/inicio");
  }

  return (
    <div className="flex-1 p-4 sm:p-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center gap-2 text-[12px] text-text-tertiary">
          {[1, 2, 3].map((n) => (
            <React.Fragment key={n}>
              <span
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full text-[11.5px] font-semibold",
                  passo >= n ? "bg-accent-500 text-white" : "bg-surface-3 text-text-tertiary"
                )}
              >
                {passo > n ? <Check size={13} /> : n}
              </span>
              {n < 3 && <span className={cn("h-px w-8", passo > n ? "bg-accent-500" : "bg-border-default")} />}
            </React.Fragment>
          ))}
          <span className="ml-2">{passo === 1 ? "Seu tipo de negócio" : passo === 2 ? "Confirme" : "Pronto"}</span>
        </div>

        {passo === 1 && (
          <>
            <h1 className="font-display text-2xl font-semibold text-text-primary">Que tipo de negócio é o seu?</h1>
            <p className="mt-1.5 max-w-xl text-[14.5px] text-text-secondary">
              Cada negócio guarda dados diferentes. Escolha o mais parecido e o app monta o funil, os campos e um atendimento de WhatsApp. Você muda o que quiser depois.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {PACOTES.map((p) => {
                const Icone = ICONES[p.icone];
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => { setEscolhido(p); setPasso(2); }}
                    className="glass-card group flex flex-col rounded-3xl p-5 text-left transition-colors hover:border-accent-500/50"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-surface-3 text-text-secondary group-hover:text-accent-300">
                      <Icone size={19} />
                    </span>
                    <span className="mt-3 text-[15px] font-semibold text-text-primary">{p.nome}</span>
                    <span className="mt-1 text-[12.5px] leading-relaxed text-text-secondary">{p.descricao}</span>
                  </button>
                );
              })}
            </div>

            <button type="button" onClick={pular} className="mt-6 text-[13px] text-text-tertiary hover:text-text-primary">
              Prefiro configurar tudo sozinho
            </button>
          </>
        )}

        {passo === 2 && escolhido && (
          <>
            <button type="button" onClick={() => setPasso(1)} className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-text-tertiary hover:text-text-primary">
              <ArrowLeft size={14} /> Escolher outro
            </button>
            <h1 className="font-display text-2xl font-semibold text-text-primary">{escolhido.nome}</h1>
            <p className="mt-1.5 text-[14.5px] text-text-secondary">É isto que vai ser criado para você:</p>

            <div className="mt-5 max-w-sm">
              <Label htmlFor="empresa">Nome da sua empresa</Label>
              <Input id="empresa" value={empresa} onChange={(e) => setEmpresa(e.target.value)} placeholder="Ex.: Solar Campinas" />
              <p className="mt-1.5 text-[12px] text-text-tertiary">Aparece na mensagem de abertura do atendimento.</p>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-3">
              <section className="glass-card rounded-3xl p-5">
                <h2 className="flex items-center gap-2 text-[13.5px] font-semibold text-text-primary"><Handshake size={15} /> Funil: {escolhido.funil.nome}</h2>
                <ol className="mt-3 flex flex-col gap-1.5">
                  {escolhido.funil.etapas.map((e) => {
                    const cor = e.type === "won" ? COR_DA_ETAPA.emerald : e.type === "lost" ? COR_DA_ETAPA.rose : COR_DA_ETAPA[e.color ?? "slate"] ?? COR_DA_ETAPA.slate;
                    return (
                      <li key={e.name} className="flex items-center gap-2 text-[13px] text-text-secondary">
                        <span className={cn("h-2 w-2 rounded-full", cor.ponto)} /> {e.name}
                      </li>
                    );
                  })}
                </ol>
              </section>

              <section className="glass-card rounded-3xl p-5">
                <h2 className="flex items-center gap-2 text-[13.5px] font-semibold text-text-primary"><SlidersHorizontal size={15} /> Campos</h2>
                {escolhido.campos.length === 0 ? (
                  <p className="mt-3 text-[13px] text-text-tertiary">Nenhum por enquanto. Você cria os seus em Negócios {">"} Personalizar.</p>
                ) : (
                  <ul className="mt-3 flex flex-col gap-1.5">
                    {escolhido.campos.map((c) => (
                      <li key={c.label} className="flex items-baseline justify-between gap-2 text-[13px]">
                        <span className="text-text-secondary">{c.label}</span>
                        <span className="shrink-0 text-[11.5px] text-text-tertiary">{TIPO_POR_ID.get(c.type)?.rotulo}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="glass-card rounded-3xl p-5">
                <h2 className="flex items-center gap-2 text-[13.5px] font-semibold text-text-primary"><MessageSquare size={15} /> Atendimento no WhatsApp</h2>
                <p className="mt-3 text-[13px] leading-relaxed text-text-secondary">
                  Um agente que recebe o cliente, pergunta:
                </p>
                <ul className="mt-2 flex flex-col gap-1 text-[12.5px] text-text-secondary">
                  <li>• o nome</li>
                  {escolhido.campos.filter((c) => c.pergunta).map((c) => (
                    <li key={c.label}>• {c.label.toLowerCase()}</li>
                  ))}
                </ul>
                <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">
                  Abre o negócio no funil já preenchido e chama uma pessoa da equipe. Não precisa de chave de IA.
                </p>
              </section>
            </div>

            {erro && <p className="mt-4 text-[13px] text-danger">{erro}</p>}

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button onClick={aplicar} disabled={busy}>
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Montar o meu CRM
              </Button>
              <button type="button" onClick={() => setPasso(1)} className="text-[13px] text-text-tertiary hover:text-text-primary">Voltar</button>
            </div>
          </>
        )}

        {passo === 3 && resumo && escolhido && (
          <>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/12 text-emerald-300">
              <Check size={24} />
            </div>
            <h1 className="mt-4 font-display text-2xl font-semibold text-text-primary">Tudo pronto</h1>
            <p className="mt-1.5 max-w-xl text-[14.5px] text-text-secondary">
              Criei o funil &quot;{resumo.funilNome}&quot;, {resumo.campos.length} campo(s) e o seu atendimento. Falta só uma coisa: ligar o WhatsApp.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <Passo href={`/agent-studio/${resumo.agenteId}?aba=canais`} icone={<MessageSquare size={17} />} titulo="Conectar o WhatsApp" texto="Leia o QR code com o número da empresa. É o que faz o atendimento começar a valer." destaque />
              <Passo href={`/playground?agent=${resumo.agenteId}`} icone={<PlayCircle size={17} />} titulo="Testar o atendimento" texto="Converse com ele como se fosse um cliente e veja o negócio nascer no funil." />
              <Passo href="/negocios" icone={<Handshake size={17} />} titulo="Ver o funil" texto="As etapas e os campos que foram criados. Dá para editar tudo em Personalizar." />
              <Passo href={`/agent-studio/${resumo.agenteId}/builder`} icone={<Sparkles size={17} />} titulo="Ajustar as perguntas" texto="Mude o texto, acrescente perguntas ou troque por um agente de IA." />
            </div>

            <Link href="/inicio" className="mt-6 inline-flex items-center gap-1.5 text-[13px] text-text-tertiary hover:text-text-primary">
              Ir para o início <ArrowRight size={13} />
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

function Passo({ href, icone, titulo, texto, destaque }: { href: string; icone: React.ReactNode; titulo: string; texto: string; destaque?: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        "glass-card group flex gap-3.5 rounded-2xl p-4 transition-colors hover:border-accent-500/50",
        destaque && "ring-1 ring-accent-500/40"
      )}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-3 text-text-secondary group-hover:text-accent-300">{icone}</span>
      <span className="min-w-0">
        <span className="block text-[14px] font-medium text-text-primary">{titulo}</span>
        <span className="mt-0.5 block text-[12.5px] leading-relaxed text-text-secondary">{texto}</span>
      </span>
    </Link>
  );
}
