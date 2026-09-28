"use client";

import * as React from "react";
import Link from "next/link";
import { Blocks, Check, Loader2, ArrowRight, AlertTriangle } from "lucide-react";
import { useAgentsStore } from "@/lib/stores/agents-store";
import { Select } from "@/components/ui/select";
import { buttonVariants } from "@/components/ui/button";
import { FLOW_TEMPLATES } from "@/components/agent-studio/builder/flow-templates";
import { ICON_REGISTRY, type IconKey } from "@/components/agent-studio/builder/icon-registry";
import { BLOCK_STYLES } from "@/components/agent-studio/builder/block-styles";
import { saveFlow } from "@/lib/data/flows";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Biblioteca.
//
// Antes esta tela listava cinco modelos inventados ("Recuperação de carrinho",
// "FAQ financeiro"...) com um botão "Usar modelo" que não tinha handler
// nenhum. Clicar não fazia nada, e nenhum daqueles fluxos existia.
//
// Agora ela mostra os modelos DE VERDADE — os mesmos que o builder aplica, lidos
// de FLOW_TEMPLATES — com os blocos que cada um cria à vista, e aplica no
// agente que você escolher.
//
// Aplicar substitui o fluxo do agente. Isso é destrutivo e a tela avisa antes,
// porque "usar modelo" soa como adicionar e não é.
// ---------------------------------------------------------------------------

export default function BibliotecaPage() {
  const { agents, isLoaded, load } = useAgentsStore();
  const [agentId, setAgentId] = React.useState("");
  const [aplicando, setAplicando] = React.useState<string | null>(null);
  const [aplicado, setAplicado] = React.useState<string | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isLoaded) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded]);

  React.useEffect(() => {
    if (!agentId && agents.length > 0) setAgentId(agents[0].id);
  }, [agentId, agents]);

  const agente = agents.find((a) => a.id === agentId);

  async function aplicar(templateId: string, nome: string) {
    if (!agentId) return;
    const template = FLOW_TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;

    if (
      !confirm(
        `Aplicar "${nome}" em ${agente?.name ?? "este agente"}?\n\nO fluxo atual desse agente é substituído. Não dá pra desfazer.`
      )
    ) {
      return;
    }

    setAplicando(templateId);
    setErro(null);
    try {
      await saveFlow(agentId, template.build());
      setAplicado(templateId);
      setTimeout(() => setAplicado(null), 4000);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível aplicar.");
    } finally {
      setAplicando(null);
    }
  }

  return (
    <div className="flex-1 p-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-text-primary">Biblioteca</h1>
          <p className="mt-1 max-w-2xl text-[14px] text-text-secondary">
            Fluxos prontos para começar um agente sem montar do zero. São os mesmos modelos que o builder
            oferece — aqui você aplica direto no agente que quiser.
          </p>
        </div>

        {agents.length > 0 && (
          <div className="min-w-[220px]">
            <p className="mb-1 text-[11.5px] text-text-tertiary">Aplicar em</p>
            <Select value={agentId} onChange={(e) => setAgentId(e.target.value)}>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </div>
        )}
      </header>

      {erro && (
        <p className="mb-4 rounded-2xl bg-danger/10 px-4 py-3 text-sm text-danger">{erro}</p>
      )}

      {isLoaded && agents.length === 0 ? (
        <div className="glass-card rounded-3xl px-6 py-16 text-center">
          <Blocks size={30} className="mx-auto mb-4 text-text-tertiary" />
          <h2 className="font-display text-lg font-semibold text-text-primary">Nenhum agente ainda</h2>
          <p className="mx-auto mt-2 max-w-sm text-[13.5px] text-text-secondary">
            Modelo se aplica num agente. Crie o primeiro e volte aqui.
          </p>
          <Link href="/agent-studio/new" className={cn(buttonVariants({ variant: "solid", size: "md" }), "mt-6")}>
            Criar agente <ArrowRight size={15} />
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {FLOW_TEMPLATES.map((tpl) => {
            const { nodes } = tpl.build();
            // Os blocos que o modelo cria, sem repetir tipo: é o que responde
            // "o que eu vou ganhar" antes de clicar num botão que substitui
            // o trabalho que já existe.
            const tipos = [...new Set(nodes.map((n) => n.data.iconKey))].filter(
              (k) => k !== "start"
            ) as IconKey[];

            return (
              <div key={tpl.id} className="glass-card flex flex-col rounded-3xl p-5">
                <h2 className="font-display text-[15.5px] font-semibold text-text-primary">{tpl.name}</h2>
                <p className="mt-1 text-[13px] leading-relaxed text-text-secondary">{tpl.description}</p>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {tipos.map((k) => {
                    const Icone = ICON_REGISTRY[k];
                    const estilo = BLOCK_STYLES[k];
                    return (
                      <span
                        key={k}
                        className={cn(
                          "flex h-7 w-7 items-center justify-center rounded-lg",
                          estilo?.badgeBg,
                          estilo?.badgeText
                        )}
                      >
                        <Icone size={13} />
                      </span>
                    );
                  })}
                </div>
                <p className="mt-2 text-[11.5px] text-text-tertiary">
                  {nodes.length} blocos
                </p>

                <div className="mt-auto flex items-center gap-3 pt-4">
                  <button
                    type="button"
                    disabled={!agentId || aplicando === tpl.id}
                    onClick={() => aplicar(tpl.id, tpl.name)}
                    className={buttonVariants({ variant: "secondary", size: "sm" })}
                  >
                    {aplicando === tpl.id && <Loader2 size={14} className="animate-spin" />}
                    Aplicar neste agente
                  </button>
                  {aplicado === tpl.id && (
                    <Link
                      href={`/agent-studio/${agentId}/builder`}
                      className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-emerald-300 hover:text-emerald-200"
                    >
                      <Check size={13} /> Aplicado — abrir o builder
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {agents.length > 0 && (
        <p className="mt-5 flex items-start gap-2 text-[12px] text-text-tertiary">
          <AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-300" />
          Aplicar um modelo substitui o fluxo atual do agente escolhido. Se ele já tem um fluxo montado, esse
          trabalho se perde.
        </p>
      )}
    </div>
  );
}
