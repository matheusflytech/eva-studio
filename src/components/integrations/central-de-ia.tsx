"use client";

import * as React from "react";
import { KeyRound, Mail, Trash2 } from "lucide-react";
import { LogoOficial, marcaDoProvedorDeIa } from "@/components/ui/logo-oficial";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { EsqueletoDeLista, ItemDeConfig, ListaDeConfig, RotuloDeGrupo, VazioDeConfig } from "@/components/configuracoes/secao";
import { LLM_PROVIDERS } from "@/lib/llm-providers";
import { pulsar } from "@/lib/fundo/eventos";
import { cn } from "@/lib/utils";
import { ConexaoIaPanel } from "./conexao-ia-panel";
import { AvisoDoOpenRouter, NovaCredencial, TYPE_LABEL, formatAge, useCredenciais, type CredentialRow } from "./credentials-panel";
import { BarraDoLimite, LimiteDaChave, UsoPorAgente, compacto, reais, useUsoDaIa, type UsoDaChave } from "./uso-ia-panel";

// ---------------------------------------------------------------------------
// Integrações → IA (v5). Na frente: o uso do mês em três números e as chaves
// na ordem em que respondem, cada uma só com a posição (1º, reserva, fora da
// fila). A fila (ordem, modelo, tempo limite e "Salvar conexão") abre em
// "Fila de resposta"; chamadas, limite, custo e apagar aparecem ao abrir a
// chave; uso por agente fica no "…" da barra. As leituras e gravações são as
// mesmas de antes (credentials, ia/conexao, ia/uso, ia/limites).
// ---------------------------------------------------------------------------

interface Passo {
  credentialId: string;
  model: string;
}

const TIPOS_DE_IA = new Set(LLM_PROVIDERS.map((p) => p.credentialType));

/** Posição de cada chave na fila, lida de /api/ia/conexao. */
function useFila(versao: number) {
  const [passos, setPassos] = React.useState<Passo[] | null>(null);
  React.useEffect(() => {
    let vivo = true;
    void fetch("/api/ia/conexao")
      .then((r) => r.json())
      .catch(() => ({ passos: [] }))
      .then((d) => {
        if (vivo) setPassos(Array.isArray(d?.passos) ? d.passos : []);
      });
    return () => {
      vivo = false;
    };
  }, [versao]);
  return passos;
}

function Kpi({ rotulo, valor, apoio }: { rotulo: string; valor: string; apoio?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-[18px] border border-border-subtle bg-panel px-4 py-3.5">
      <span className="truncate text-small text-text-secondary">{rotulo}</span>
      <span className="truncate text-display tabular-nums text-text-primary">{valor}</span>
      {apoio && <span className="truncate font-mono text-caption text-text-tertiary">{apoio}</span>}
    </div>
  );
}

export function CentralDeIa({
  novaAberta,
  setNovaAberta,
  filaAberta,
  setFilaAberta,
  porAgenteAberto,
  setPorAgenteAberto,
}: {
  novaAberta: boolean;
  setNovaAberta: (v: boolean) => void;
  filaAberta: boolean;
  setFilaAberta: (v: boolean) => void;
  porAgenteAberto: boolean;
  setPorAgenteAberto: (v: boolean) => void;
}) {
  const { credentials, adicionar, apagar } = useCredenciais();
  const { resumo, recarregar } = useUsoDaIa();
  const [versaoDaFila, setVersaoDaFila] = React.useState(0);
  const [versaoDasCredenciais, setVersaoDasCredenciais] = React.useState(0);
  const passos = useFila(versaoDaFila);
  const [aberta, setAberta] = React.useState<string | null>(null);
  const listaRef = React.useRef<HTMLDivElement>(null);

  const usoDe = (id: string): UsoDaChave | undefined => resumo?.chaves.find((c) => c.credentialId === id);
  const posicao = (id: string) => (passos ?? []).findIndex((p) => p.credentialId === id);

  // Na ordem em que respondem: fila primeiro, depois o resto (IA), e-mail no fim.
  const ordenadas = React.useMemo(() => {
    const lista = credentials ?? [];
    const peso = (c: CredentialRow) => {
      const i = (passos ?? []).findIndex((p) => p.credentialId === c.id);
      if (i >= 0) return i;
      return TIPOS_DE_IA.has(c.type) ? 100 : 200;
    };
    return [...lista].sort((a, b) => peso(a) - peso(b));
  }, [credentials, passos]);

  const mes = new Date().toLocaleString("pt-BR", { month: "long" });
  const totalTokens = resumo ? resumo.chaves.reduce((s, c) => s + c.tokens, 0) + resumo.plataforma.tokens : 0;
  const comCusto = resumo?.chaves.filter((c) => c.custoBrl != null) ?? [];
  const custo = comCusto.reduce((s, c) => s + (c.custoBrl ?? 0), 0);
  const comFalha = resumo?.chaves.filter((c) => c.falhas > 0) ?? [];
  const falhas = comFalha.reduce((s, c) => s + c.falhas, 0);
  const semFila = passos !== null && passos.length === 0;

  const credencialAberta = (credentials ?? []).find((c) => c.id === aberta) ?? null;
  const usoAberto = credencialAberta ? usoDe(credencialAberta.id) : undefined;

  return (
    <div className="flex flex-col gap-8">
      <AvisoDoOpenRouter />

      {resumo && !resumo.disponivel && (
        <Notice tone="warning">O controle de uso ainda não foi ativado no banco deste ambiente: nada está sendo contado e nenhum limite vale.</Notice>
      )}
      {resumo && resumo.disponivel && resumo.chaves.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Kpi rotulo={`Tokens em ${mes}`} valor={compacto.format(totalTokens)} />
          <Kpi
            rotulo="Custo estimado"
            valor={comCusto.length ? reais.format(custo) : "—"}
            apoio={comCusto.length ? undefined : "informe o preço ao abrir a chave"}
          />
          <Kpi rotulo="Falhas" valor={falhas.toLocaleString("pt-BR")} apoio={comFalha.length ? comFalha.map((c) => c.nome).join(", ") : undefined} />
        </div>
      )}

      <div ref={listaRef}>
        <RotuloDeGrupo contagem={credentials ? credentials.length : undefined}>Chaves, na ordem em que respondem</RotuloDeGrupo>
        {semFila && (credentials?.some((c) => TIPOS_DE_IA.has(c.type)) ?? false) && (
          <p className="px-1 pb-3 text-small text-text-tertiary">
            Nenhuma ordem definida: os agentes usam a chave de IA mais adequada do contrato. Monte a ordem em “Fila de resposta”.
          </p>
        )}
        {credentials === null ? (
          <EsqueletoDeLista />
        ) : credentials.length === 0 ? (
          <VazioDeConfig
            acao={
              <Button variant="secondary" size="sm" onClick={() => setNovaAberta(true)}>
                Nova credencial
              </Button>
            }
          >
            Nenhuma credencial ainda. Cadastre a chave de um provedor de IA (OpenAI, Google, Anthropic, Groq...) para os agentes
            responderem, ou uma Resend para o bloco “Enviar e-mail”.
          </VazioDeConfig>
        ) : (
          <ListaDeConfig>
            {ordenadas.map((c) => {
              const ia = TIPOS_DE_IA.has(c.type);
              const i = posicao(c.id);
              const uso = usoDe(c.id);
              const modelo = i >= 0 ? passos?.[i]?.model : undefined;
              const preocupa = uso && (uso.nivel === "alerta" || uso.nivel === "estourado");
              return (
                <ItemDeConfig
                  key={c.id}
                  icone={ia ? <IconeDaChave tipo={c.type} /> : <Mail />}
                  titulo={c.name}
                  detalhe={[TYPE_LABEL[c.type] ?? c.type, modelo].filter(Boolean).join(" · ")}
                  onClick={() => setAberta(c.id)}
                  rotuloDoClique={`Abrir a chave ${c.name}`}
                  direita={
                    <>
                      {ia && uso && (
                        <span
                          className={cn(
                            "flex w-[150px] flex-col items-end gap-1 text-caption tabular-nums",
                            preocupa ? (uso.nivel === "estourado" ? "text-danger" : "text-warning") : "text-text-secondary"
                          )}
                        >
                          {preocupa ? (
                            <>
                              <span className="h-1.5 w-full overflow-hidden rounded-full bg-hover" aria-hidden="true">
                                <span
                                  className={cn("block h-full rounded-full", uso.nivel === "estourado" ? "bg-danger" : "bg-warning")}
                                  style={{ width: `${Math.min(100, Math.round((uso.pct ?? 0) * 100))}%` }}
                                />
                              </span>
                              {Math.round((uso.pct ?? 0) * 100)}% do limite
                            </>
                          ) : uso.tokens > 0 ? (
                            `${compacto.format(uso.tokens)} tokens`
                          ) : (
                            <span className="text-text-tertiary">sem uso</span>
                          )}
                        </span>
                      )}
                      {!ia ? (
                        <Badge className="min-w-[74px] justify-center bg-transparent ring-1 ring-inset ring-border-subtle">só e-mail</Badge>
                      ) : i === 0 ? (
                        <Badge className="min-w-[74px] justify-center">1º</Badge>
                      ) : i > 0 ? (
                        <Badge className="min-w-[74px] justify-center">{i + 1}º reserva</Badge>
                      ) : semFila ? null : (
                        <Badge className="min-w-[74px] justify-center bg-transparent ring-1 ring-inset ring-border-subtle">fora da fila</Badge>
                      )}
                    </>
                  }
                />
              );
            })}
          </ListaDeConfig>
        )}
      </div>

      <NovaCredencial
        aberta={novaAberta}
        aoFechar={() => setNovaAberta(false)}
        aoCriar={(c) => {
          adicionar(c);
          setVersaoDasCredenciais((v) => v + 1);
          pulsar(listaRef.current, 1.2);
        }}
      />

      {/* Fila de resposta: ordem, modelo, tempo limite e "Salvar conexão". */}
      <Drawer open={filaAberta} onOpenChange={setFilaAberta}>
        <DrawerContent size="lg" title="Fila de resposta" description="A conexão que os agentes usam para responder, em ordem de preferência.">
          <ConexaoIaPanel credenciaisVersao={versaoDasCredenciais} aoSalvar={() => setVersaoDaFila((v) => v + 1)} />
        </DrawerContent>
      </Drawer>

      <Drawer open={porAgenteAberto} onOpenChange={setPorAgenteAberto}>
        <DrawerContent title="Uso por agente" description="Tokens que cada agente gastou desde o dia 1º.">
          {resumo ? <UsoPorAgente resumo={resumo} /> : <EsqueletoDeLista />}
        </DrawerContent>
      </Drawer>

      {/* Detalhe da chave: uso do mês, limite, preço e apagar. */}
      <Drawer open={!!credencialAberta} onOpenChange={(v) => !v && setAberta(null)}>
        {credencialAberta && (
          <DrawerContent
            title={credencialAberta.name}
            description={`${TYPE_LABEL[credencialAberta.type] ?? credencialAberta.type} · criada ${formatAge(credencialAberta.createdAt)}`}
            footer={
              <Button
                variant="ghost"
                className="mr-auto text-danger hover:text-danger"
                onClick={() => {
                  void apagar(credencialAberta.id);
                  setAberta(null);
                }}
              >
                <Trash2 size={14} aria-hidden="true" /> Apagar credencial
              </Button>
            }
          >
            <div className="flex flex-col gap-5">
              {usoAberto ? (
                <>
                  <dl className="grid grid-cols-2 gap-3">
                    {[
                      ["Tokens no mês", compacto.format(usoAberto.tokens)],
                      ["Chamadas", usoAberto.chamadas.toLocaleString("pt-BR")],
                      ["Com falha", usoAberto.falhas.toLocaleString("pt-BR")],
                      ["Custo estimado", usoAberto.custoBrl != null ? `~${reais.format(usoAberto.custoBrl)}` : "—"],
                    ].map(([r, v]) => (
                      <div key={r} className="rounded-[14px] bg-raised px-3.5 py-3">
                        <dt className="font-mono text-caption text-text-tertiary">{r}</dt>
                        <dd className="mt-0.5 text-title-sm tabular-nums text-text-primary">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  <BarraDoLimite c={usoAberto} />
                  {resumo?.disponivel && (
                    <div className="border-t border-border-subtle pt-4">
                      <LimiteDaChave key={usoAberto.credentialId} c={usoAberto} aoSalvar={recarregar} />
                    </div>
                  )}
                </>
              ) : (
                <p className="text-small text-text-tertiary">
                  {TIPOS_DE_IA.has(credencialAberta.type) ? "Sem uso contado neste mês." : "Usada pelo bloco “Enviar e-mail” do Builder."}
                </p>
              )}
            </div>
          </DrawerContent>
        )}
      </Drawer>
    </div>
  );
}

/**
 * Ícone da chave de IA: o logo oficial do provedor quando houver (OpenAI,
 * Groq, Google), senão a chave genérica. O Groq é um logotipo comprido: fica
 * mais largo que o quadrado de 16px que a linha impõe aos ícones.
 */
function IconeDaChave({ tipo }: { tipo: string }) {
  const marca = marcaDoProvedorDeIa(tipo);
  if (!marca) return <KeyRound />;
  return <LogoOficial marca={marca} tamanho={marca === "groq" ? 26 : 16} className={marca === "groq" ? "!h-auto !w-[26px]" : undefined} />;
}
