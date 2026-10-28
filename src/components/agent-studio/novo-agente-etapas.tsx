"use client";

import * as React from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "@/components/contrato/link";
import { useRouter } from "@/lib/contrato/navegacao";
import { Card } from "@/components/ui/card";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { ModeloSelect } from "./builder/modelo-select";
import { montarFluxoInicial, type IaDoAgente } from "./builder/fluxo-inicial";
import { FLOW_TEMPLATES, MODELOS_COM_IA, MODELOS_COM_N8N } from "./builder/flow-templates";
import { useAgentsStore } from "@/lib/stores/agents-store";
import { saveFlow } from "@/lib/data/flows";
import { generateId, cn } from "@/lib/utils";
import { AGENT_LANGUAGES, type AgentLanguage } from "@/lib/data/types";
import { CHANNELS } from "@/lib/data/channels";
import { LLM_PROVIDERS } from "@/lib/llm-providers";

// ---------------------------------------------------------------------------
// Criação de agente em etapas: quem é → como fala → qual IA → como começa.
// No fim cria o agente e já grava o fluxo inicial (com o bloco "Responder
// com IA" usando a IA escolhida), e abre o builder. A tela de edição do
// agente continua sendo o formulário completo (agent-form.tsx).
// ---------------------------------------------------------------------------

const ETAPAS = ["Quem é", "Como fala", "IA", "Como começa"] as const;
const TONS = ["Simpático e direto", "Formal e cuidadoso", "Descontraído, com emoji"];

interface Credencial {
  id: string;
  name: string;
  type: string;
}

function Opcao({
  ativa,
  onClick,
  titulo,
  texto,
  selo,
}: {
  ativa: boolean;
  onClick: () => void;
  titulo: string;
  texto: string;
  selo?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={ativa}
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-3 rounded-[14px] border p-3.5 text-left transition-colors",
        ativa ? "border-accent-solid bg-accent-subtle" : "border-border-subtle bg-raised hover:bg-hover"
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border",
          ativa ? "border-accent-solid bg-accent-solid text-text-on-accent" : "border-border-strong"
        )}
        aria-hidden
      >
        {ativa && <Check size={11} />}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-small font-medium text-text-primary">
          {titulo}
          {selo && <span className="font-mono text-caption text-text-tertiary">{selo}</span>}
        </span>
        <span className="mt-0.5 block text-caption text-text-tertiary">{texto}</span>
      </span>
    </button>
  );
}

export function NovoAgenteEtapas() {
  const router = useRouter();
  const { create } = useAgentsStore();
  const agentId = React.useMemo(() => generateId(), []);

  const [etapa, setEtapa] = React.useState(0);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [tone, setTone] = React.useState("");
  const [language, setLanguage] = React.useState<AgentLanguage>(AGENT_LANGUAGES[0]);
  const [instructions, setInstructions] = React.useState("");
  const [guidelines, setGuidelines] = React.useState("");

  // "nenhuma" = bot só de blocos: sem "Atendente com IA" nem modelo com bloco de IA.
  const [fonte, setFonte] = React.useState<"conexao" | "bloco" | "nenhuma">("conexao");
  const [credenciais, setCredenciais] = React.useState<Credencial[] | null>(null);
  const [credentialId, setCredentialId] = React.useState("");
  const [model, setModel] = React.useState("");
  const [conexao, setConexao] = React.useState<{ passos: number; disponivel: boolean } | null>(null);

  const [inicio, setInicio] = React.useState<string>("ia");
  const [boasVindas, setBoasVindas] = React.useState("Olá! Como posso te ajudar?");
  const [objetivo, setObjetivo] = React.useState("");
  const [urlDoN8n, setUrlDoN8n] = React.useState("");

  const [erro, setErro] = React.useState<string | null>(null);
  const [criando, setCriando] = React.useState(false);

  React.useEffect(() => {
    let vivo = true;
    const tipos = new Set(LLM_PROVIDERS.map((p) => p.credentialType));
    void fetch("/api/credentials")
      .then((r) => r.json())
      .catch(() => ({ credentials: [] }))
      .then((d) => {
        if (vivo) setCredenciais(((d.credentials ?? []) as Credencial[]).filter((c) => tipos.has(c.type)));
      });
    // Quem cria agente pode não ter acesso a Integrações: sem resposta, a
    // tela só não mostra o resumo da Central.
    void fetch("/api/ia/conexao")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((d) => {
        if (vivo && d) setConexao({ passos: Array.isArray(d.passos) ? d.passos.length : 0, disponivel: d.disponivel !== false });
      });
    return () => {
      vivo = false;
    };
  }, []);

  const credencial = credenciais?.find((c) => c.id === credentialId);
  const provider = LLM_PROVIDERS.find((p) => p.credentialType === credencial?.type)?.id;

  function validarEtapa(i: number): string | null {
    if (i === 0 && !name.trim()) return "Dê um nome para o agente.";
    if (i === 2 && fonte === "bloco" && (!credentialId || !model)) return "Escolha a chave e o modelo, ou use a Central de IA.";
    if (i === 3 && fonte === "nenhuma" && (inicio === "ia" || MODELOS_COM_IA.has(inicio))) return "Este início usa IA. Escolha outro ou volte e escolha uma IA.";
    if (i === 3 && MODELOS_COM_N8N.has(inicio) && !/^https:\/\//.test(urlDoN8n.trim())) {
      return "Cole a URL do webhook do n8n (começa com https://).";
    }
    return null;
  }

  function avancar() {
    const motivo = validarEtapa(etapa);
    setErro(motivo);
    if (!motivo) setEtapa((e) => Math.min(ETAPAS.length - 1, e + 1));
  }

  async function criar() {
    for (let i = 0; i < ETAPAS.length; i += 1) {
      const motivo = validarEtapa(i);
      if (motivo) {
        setEtapa(i);
        setErro(motivo);
        return;
      }
    }
    setErro(null);
    setCriando(true);
    const ia: IaDoAgente =
      fonte !== "bloco" || !provider ? { fonte: "conexao" } : { fonte: "bloco", provider, credentialId, model };
    try {
      await create(agentId, {
        name: name.trim(),
        description: description.trim(),
        // Tom, instruções e "nunca fazer" vão para o bloco de IA (ver jeito abaixo).
        tone: "",
        language,
        primaryChannel: CHANNELS[0].name,
        instructions: "",
        guidelines: "",
        knowledgeBase: [],
        skills: [],
        tools: [],
        variables: [],
        outboundUrl: MODELOS_COM_N8N.has(inicio) ? urlDoN8n.trim() : "",
      });
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não deu para criar o agente.");
      setCriando(false);
      return;
    }
    try {
      await saveFlow(agentId, montarFluxoInicial({ inicio, ia, boasVindas, objetivo, jeito: { tone, language, instructions, guidelines } }));
      router.push(`/agent-studio/${agentId}/builder`);
    } catch {
      // O agente já existe: leva para ele em vez de deixar a pessoa criar outro igual.
      setErro("O agente foi criado, mas o fluxo inicial não foi salvo. Abra o builder e monte o fluxo por lá.");
      setCriando(false);
    }
  }

  const ultima = etapa === ETAPAS.length - 1;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 pb-10">
      <ol className="flex items-center gap-2" aria-label="Etapas">
        {ETAPAS.map((t, i) => (
          <li key={t} className="flex flex-1 items-center gap-2">
            <button
              type="button"
              onClick={() => (i < etapa ? setEtapa(i) : undefined)}
              disabled={i > etapa}
              aria-current={i === etapa ? "step" : undefined}
              className={cn(
                "flex items-center gap-2 text-small font-medium",
                i === etapa ? "text-text-primary" : i < etapa ? "text-accent-fg hover:underline" : "text-text-tertiary"
              )}
            >
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full text-caption tabular-nums",
                  i < etapa ? "bg-accent-solid text-text-on-accent" : i === etapa ? "border border-accent-solid text-accent-fg" : "border border-border-strong"
                )}
              >
                {i < etapa ? <Check size={12} /> : i + 1}
              </span>
              {t}
            </button>
            {i < ETAPAS.length - 1 && <span className="h-px flex-1 bg-border-subtle" aria-hidden />}
          </li>
        ))}
      </ol>

      <Card className="flex flex-col gap-4 p-5">
        {etapa === 0 && (
          <>
            <div>
              <Label htmlFor="na-nome">Nome do agente</Label>
              <Input id="na-nome" autoFocus placeholder="Ex.: Eva, Vendedor da Loja" value={name} onChange={(e) => setName(e.target.value)} />
              <p className="mt-1 text-caption text-text-tertiary">É como ele se apresenta para o cliente.</p>
            </div>
            <div>
              <Label htmlFor="na-desc">O que ele faz, em uma frase</Label>
              <Input id="na-desc" placeholder="Ex.: Atende quem chega pelo WhatsApp e ajuda a escolher o sofá." value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </>
        )}

        {etapa === 1 && (
          <>
            <div>
              <Label htmlFor="na-tom">Tom de voz</Label>
              <div className="mb-2 flex flex-wrap gap-2">
                {TONS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTone(t)}
                    aria-pressed={tone === t}
                    className={cn(
                      "h-7 rounded-full border px-3 text-small transition-colors",
                      tone === t ? "border-transparent bg-inverse font-medium text-inverse-fg" : "border-border-subtle bg-raised text-text-secondary hover:text-text-primary"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <Input id="na-tom" placeholder="Ou escreva do seu jeito" value={tone} onChange={(e) => setTone(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="na-idioma">Idioma</Label>
              <Select id="na-idioma" value={language} onChange={(e) => setLanguage(e.target.value as AgentLanguage)}>
                {AGENT_LANGUAGES.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="na-instr">Instruções</Label>
              <Textarea
                id="na-instr"
                rows={4}
                placeholder="O que ele precisa saber e fazer: produtos, horário, como responder preço, quando passar para a equipe…"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="na-nunca">O que ele nunca deve fazer</Label>
              <Textarea
                id="na-nunca"
                rows={3}
                placeholder="Ex.: Não prometer prazo de entrega. Não dar desconto sem falar com a equipe."
                value={guidelines}
                onChange={(e) => setGuidelines(e.target.value)}
              />
            </div>
          </>
        )}

        {etapa === 2 && (
          <div role="radiogroup" aria-label="Qual IA o agente usa" className="flex flex-col gap-3">
            <Opcao
              ativa={fonte === "conexao"}
              onClick={() => setFonte("conexao")}
              titulo="Central de IA do contrato"
              selo="Recomendado"
              texto={
                conexao && conexao.disponivel && conexao.passos > 0
                  ? `Usa as ${conexao.passos} chaves em ordem de Integrações → Central de IA, com reserva automática se uma falhar.`
                  : "Usa a chave de IA do contrato escolhida automaticamente; dá para definir a ordem e as reservas em Integrações → Central de IA."
              }
            />
            <Opcao
              ativa={fonte === "bloco"}
              onClick={() => setFonte("bloco")}
              titulo="Uma chave e um modelo só para este agente"
              texto="Para quando este agente precisa de um modelo específico. Sem reserva automática."
            />
            <Opcao
              ativa={fonte === "nenhuma"}
              onClick={() => {
                setFonte("nenhuma");
                if (inicio === "ia" || MODELOS_COM_IA.has(inicio)) setInicio("branco");
              }}
              titulo="Bot sem IA"
              texto="Só blocos: mensagens, botões, perguntas e ações que você monta no builder. Dá para pôr IA depois."
            />
            {fonte === "bloco" &&
              (credenciais && credenciais.length === 0 ? (
                <Notice tone="warning">
                  Nenhuma chave de IA cadastrada. Cadastre uma em{" "}
                  <Link href="/integrations" className="underline">Integrações</Link> ou use a Central de IA.
                </Notice>
              ) : (
                <div className="grid grid-cols-1 gap-3 rounded-[14px] bg-raised p-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="na-cred">Chave</Label>
                    <Select
                      id="na-cred"
                      value={credentialId}
                      onChange={(e) => {
                        setCredentialId(e.target.value);
                        const tipo = credenciais?.find((c) => c.id === e.target.value)?.type;
                        setModel(LLM_PROVIDERS.find((p) => p.credentialType === tipo)?.models[0]?.id ?? "");
                      }}
                    >
                      <option value="">Escolha a chave…</option>
                      {(credenciais ?? []).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} · {LLM_PROVIDERS.find((p) => p.credentialType === c.type)?.label ?? c.type}
                        </option>
                      ))}
                    </Select>
                  </div>
                  {credentialId && (
                    <ModeloSelect id="na-modelo" provider={provider} credentialId={credentialId} value={model} onChange={setModel} trocarSeAusente />
                  )}
                </div>
              ))}
          </div>
        )}

        {etapa === 3 && (
          <div role="radiogroup" aria-label="Como o agente começa" className="flex flex-col gap-3">
            {fonte !== "nenhuma" && (
              <Opcao
                ativa={inicio === "ia"}
                onClick={() => setInicio("ia")}
                titulo="Atendente com IA"
                selo="Recomendado"
                texto="Dá boas-vindas e a IA conversa usando o que você escreveu. Se a IA falhar, passa para um atendente."
              />
            )}
            {inicio === "ia" && fonte !== "nenhuma" && (
              <div className="flex flex-col gap-3 rounded-[14px] bg-raised p-3">
                <div>
                  <Label htmlFor="na-oi">Mensagem de boas-vindas (opcional)</Label>
                  <Input id="na-oi" value={boasVindas} onChange={(e) => setBoasVindas(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="na-obj">O que a IA deve conseguir na conversa (opcional)</Label>
                  <Textarea
                    id="na-obj"
                    rows={2}
                    placeholder="Ex.: Descobrir o que a pessoa procura e o orçamento, e oferecer uma visita à loja."
                    value={objetivo}
                    onChange={(e) => setObjetivo(e.target.value)}
                  />
                </div>
              </div>
            )}
            <Opcao ativa={inicio === "branco"} onClick={() => setInicio("branco")} titulo="Em branco" texto="Só o Início. Você monta tudo no builder." />
            {FLOW_TEMPLATES.filter((t) => fonte !== "nenhuma" || !MODELOS_COM_IA.has(t.id)).map((t) => (
              <React.Fragment key={t.id}>
                <Opcao ativa={inicio === t.id} onClick={() => setInicio(t.id)} titulo={t.name} texto={t.description} />
                {inicio === t.id && MODELOS_COM_N8N.has(t.id) && (
                  <div className="rounded-[14px] bg-raised p-3">
                    <Label htmlFor="na-n8n">URL do webhook do n8n</Label>
                    <Input
                      id="na-n8n"
                      placeholder="https://seu-n8n.com/webhook/…"
                      value={urlDoN8n}
                      onChange={(e) => setUrlDoN8n(e.target.value)}
                    />
                    <p className="mt-1 text-caption text-text-tertiary">
                      O nó Webhook do seu workflow. A Eva manda a mensagem e espera {"{ \"reply\": \"...\" }"} de volta;
                      com {"\"done\": true"} o atendimento segue para o Encerramento.
                    </p>
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        )}

        {erro && <Notice tone="danger">{erro}</Notice>}

        <div className="flex items-center justify-between border-t border-border-subtle pt-4">
          {etapa > 0 ? (
            <Button type="button" variant="ghost" onClick={() => { setErro(null); setEtapa((e) => e - 1); }}>
              <ChevronLeft size={15} /> Voltar
            </Button>
          ) : (
            <span />
          )}
          {ultima ? (
            <Button type="button" onClick={criar} disabled={criando}>
              {criando ? "Criando…" : "Criar agente e abrir o builder"}
            </Button>
          ) : (
            <Button type="button" onClick={avancar}>
              Continuar <ChevronRight size={15} />
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
