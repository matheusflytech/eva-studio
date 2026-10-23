"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { useRouter } from "@/lib/contrato/navegacao";
import {
  Sun, Building2, HeartPulse, ShoppingBag, Briefcase, GraduationCap, Sparkles,
  ArrowRight, ArrowLeft, Check, ChevronRight, Handshake, PlayCircle,
} from "lucide-react";
import { LogoOficial } from "@/components/ui/logo-oficial";
import { Input, Field } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { focusRing } from "@/components/ui/styles";
import { PACOTES, type PacoteDeNicho } from "@/lib/niche-packs";
import { TIPO_POR_ID } from "@/lib/custom-fields";
import { CATEGORY_CLASSES } from "@/lib/design-system/category-classes";
import type { CategoryColor } from "@/lib/design-system/tokens";
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

// Cor guardada na etapa do pacote → cor de dado do tema (a mesma do quadro de
// Negócios). Ganho é verde e perda é vermelha, como antes, venha a cor que vier.
const COR_DE_DADO: Record<string, CategoryColor> = {
  slate: "slate", blue: "blue", violet: "violet", amber: "amber", emerald: "green", rose: "rose", cyan: "cyan",
};
function corDaEtapaDoPacote(cor: string | undefined, tipo: string): CategoryColor {
  if (tipo === "won") return "green";
  if (tipo === "lost") return "rose";
  return COR_DE_DADO[cor ?? "slate"] ?? "slate";
}

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

  const NOMES_DOS_PASSOS = ["Seu tipo de negócio", "Confirme", "Pronto"] as const;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-6 pt-1 lg:px-6">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        {/* Progresso em três traços e o nome do passo em mono: diz onde está
            sem virar enfeite. */}
        <div className="flex items-center gap-3 pt-3">
          <ol aria-label="Passos" className="flex items-center gap-1.5">
            {[1, 2, 3].map((n) => (
              <li
                key={n}
                aria-current={passo === n ? "step" : undefined}
                className={cn("h-1 w-8 rounded-full transition-colors duration-200", passo >= n ? "bg-inverse" : "bg-hover")}
              >
                <span className="sr-only">
                  Passo {n}: {NOMES_DOS_PASSOS[n - 1]}
                  {passo > n ? " (feito)" : ""}
                </span>
              </li>
            ))}
          </ol>
          <span className="font-mono text-caption text-text-tertiary">
            {passo} de 3 · {NOMES_DOS_PASSOS[passo - 1]}
          </span>
        </div>

        {passo === 1 && (
          <>
            <div className="flex flex-col gap-1.5">
              <h1 className="text-heading font-semibold tracking-tight text-text-primary">Que tipo de negócio é o seu?</h1>
              <p className="max-w-xl text-body text-text-secondary">
                Cada negócio guarda dados diferentes. Escolha o mais parecido e o app monta o funil, os campos e um atendimento de WhatsApp. Você muda o que quiser depois.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {PACOTES.map((p) => {
                const Icone = ICONES[p.icone];
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => { setEscolhido(p); setPasso(2); }}
                    className={cn(
                      "group flex flex-col rounded-[18px] border border-border-subtle bg-panel p-4 text-left transition-colors duration-120 hover:border-border-default hover:bg-raised",
                      focusRing
                    )}
                  >
                    <span className="flex size-10 items-center justify-center rounded-[14px] bg-raised text-text-secondary transition-colors group-hover:bg-hover group-hover:text-text-primary">
                      <Icone size={18} aria-hidden />
                    </span>
                    <span className="mt-3 text-body-lg font-semibold text-text-primary">{p.nome}</span>
                    <span className="mt-1 text-small leading-relaxed text-text-secondary">{p.descricao}</span>
                  </button>
                );
              })}
            </div>

            <Button variant="ghost" className="self-start" onClick={pular}>
              Prefiro configurar tudo sozinho
            </Button>
          </>
        )}

        {passo === 2 && escolhido && (
          <>
            <div className="flex flex-col gap-1.5">
              <Button variant="ghost" size="sm" className="-ml-2 self-start" onClick={() => setPasso(1)}>
                <ArrowLeft size={14} aria-hidden /> Escolher outro
              </Button>
              <h1 className="text-heading font-semibold tracking-tight text-text-primary">{escolhido.nome}</h1>
              <p className="text-body text-text-secondary">É isto que vai ser criado para você:</p>
            </div>

            <Field label="Nome da sua empresa" hint="Aparece na mensagem de abertura do atendimento." className="max-w-sm">
              <Input id="empresa" value={empresa} onChange={(e) => setEmpresa(e.target.value)} placeholder="Ex.: Solar Campinas" />
            </Field>

            <div className="grid gap-3 lg:grid-cols-3">
              <section aria-labelledby="resumo-funil" className="rounded-[18px] border border-border-subtle bg-panel p-4">
                <h2 id="resumo-funil" className="font-mono text-caption uppercase tracking-wider text-text-tertiary">Funil</h2>
                <p className="mt-1 text-body font-semibold text-text-primary">{escolhido.funil.nome}</p>
                <ol className="mt-3 flex flex-col gap-1.5">
                  {escolhido.funil.etapas.map((e) => (
                    <li key={e.name} className="flex items-center gap-2 text-small text-text-secondary">
                      <span aria-hidden className={cn("size-2 shrink-0 rounded-full", CATEGORY_CLASSES[corDaEtapaDoPacote(e.color, e.type)].solid)} /> {e.name}
                    </li>
                  ))}
                </ol>
              </section>

              <section aria-labelledby="resumo-campos" className="rounded-[18px] border border-border-subtle bg-panel p-4">
                <h2 id="resumo-campos" className="font-mono text-caption uppercase tracking-wider text-text-tertiary">Campos</h2>
                {escolhido.campos.length === 0 ? (
                  <p className="mt-3 text-small text-text-tertiary">Nenhum por enquanto. Você cria os seus em Negócios {">"} Personalizar.</p>
                ) : (
                  <ul className="mt-3 flex flex-col gap-1.5">
                    {escolhido.campos.map((c) => (
                      <li key={c.label} className="flex items-baseline justify-between gap-2 text-small">
                        <span className="text-text-secondary">{c.label}</span>
                        <span className="shrink-0 font-mono text-caption text-text-tertiary">{TIPO_POR_ID.get(c.type)?.rotulo}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section aria-labelledby="resumo-atendimento" className="rounded-[18px] border border-border-subtle bg-panel p-4">
                <h2 id="resumo-atendimento" className="font-mono text-caption uppercase tracking-wider text-text-tertiary">Atendimento no WhatsApp</h2>
                <p className="mt-3 text-small leading-relaxed text-text-secondary">Um agente que recebe o cliente, pergunta:</p>
                <ul className="mt-2 flex list-disc flex-col gap-1 pl-4 text-small text-text-secondary marker:text-text-tertiary">
                  <li>o nome</li>
                  {escolhido.campos.filter((c) => c.pergunta).map((c) => (
                    <li key={c.label}>{c.label.toLowerCase()}</li>
                  ))}
                </ul>
                <p className="mt-2 text-small leading-relaxed text-text-secondary">
                  Abre o negócio no funil já preenchido e chama uma pessoa da equipe. Não precisa de chave de IA.
                </p>
              </section>
            </div>

            {erro && <Notice tone="danger">{erro}</Notice>}

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" onClick={aplicar} loading={busy}>
                {!busy && <Check size={14} aria-hidden />} Montar o meu CRM
              </Button>
              <Button variant="ghost" onClick={() => setPasso(1)}>
                Voltar
              </Button>
            </div>
          </>
        )}

        {passo === 3 && resumo && escolhido && (
          <>
            <div className="flex flex-col gap-1.5">
              <span className="flex size-10 items-center justify-center rounded-full bg-success-subtle text-success">
                <Check size={20} aria-hidden />
              </span>
              <h1 className="mt-2 text-heading font-semibold tracking-tight text-text-primary">Tudo pronto</h1>
              <p className="max-w-xl text-body text-text-secondary">
                Criei o funil &quot;{resumo.funilNome}&quot;, {resumo.campos.length} {resumo.campos.length === 1 ? "campo" : "campos"} e o seu atendimento. Falta só uma coisa: ligar o WhatsApp.
              </p>
            </div>

            {/* O primeiro passo é o que faz o atendimento valer: vai na frente,
                como a única ação principal; os outros são caminhos de volta. */}
            <Passo
              href={`/agent-studio/${resumo.agenteId}?aba=canais`}
              icone={<LogoOficial marca="whatsapp" tamanho={18} />}
              titulo="Conectar o WhatsApp"
              texto="Leia o QR code com o número da empresa. É o que faz o atendimento começar a valer."
              destaque
            />
            <ul className="flex flex-col rounded-[18px] border border-border-subtle bg-panel px-2">
              <Passo href={`/playground?agent=${resumo.agenteId}`} icone={<PlayCircle size={16} aria-hidden />} titulo="Testar o atendimento" texto="Converse com ele como se fosse um cliente e veja o negócio nascer no funil." />
              <Passo href="/negocios" icone={<Handshake size={16} aria-hidden />} titulo="Ver o funil" texto="As etapas e os campos que foram criados. Dá para editar tudo em Personalizar." />
              <Passo href={`/agent-studio/${resumo.agenteId}/builder`} icone={<Sparkles size={16} aria-hidden />} titulo="Ajustar as perguntas" texto="Mude o texto, acrescente perguntas ou troque por um agente de IA." />
            </ul>

            <Link href="/inicio" className={cn(buttonVariants({ variant: "ghost" }), "self-start")}>
              Ir para o início <ArrowRight size={13} aria-hidden />
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Próximo passo depois de montar. O destacado é um bloco próprio com a seta
 * na ação principal; os demais são linhas finas de uma lista.
 */
function Passo({ href, icone, titulo, texto, destaque }: { href: string; icone: React.ReactNode; titulo: string; texto: string; destaque?: boolean }) {
  if (destaque) {
    return (
      <Link
        href={href}
        className={cn(
          "group flex flex-wrap items-center gap-3.5 rounded-[18px] border border-border-subtle bg-panel p-4 transition-colors duration-120 hover:bg-raised",
          focusRing
        )}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[14px] bg-raised text-text-primary">{icone}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-body font-semibold text-text-primary">{titulo}</span>
          <span className="mt-0.5 block text-small leading-relaxed text-text-secondary">{texto}</span>
        </span>
        <span className={buttonVariants({ variant: "primary" })}>
          Conectar <ArrowRight size={14} aria-hidden />
        </span>
      </Link>
    );
  }
  return (
    <li className="border-b border-border-subtle last:border-b-0">
      <Link href={href} className={cn("group flex min-h-14.5 items-center gap-3 rounded-xl px-2 py-2.5 transition-colors duration-120 hover:bg-raised", focusRing)}>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-raised text-text-secondary group-hover:text-text-primary">{icone}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-body font-medium text-text-primary">{titulo}</span>
          <span className="block text-caption leading-relaxed text-text-tertiary">{texto}</span>
        </span>
        <ChevronRight size={15} aria-hidden className="shrink-0 text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100" />
      </Link>
    </li>
  );
}
