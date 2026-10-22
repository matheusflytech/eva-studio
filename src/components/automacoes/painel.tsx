"use client";

import * as React from "react";
import { AlertCircle, Plus, Trash2, X } from "lucide-react";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/lib/utils";
import { CATEGORY_CLASSES } from "@/lib/design-system/category-classes";
import { acaoDoTipo, configPadrao, EVENTOS_DE_ESPERA, gatilhoDoTipo, gatilhosDoObjeto, NOMES_DOS_OBJETOS, type Nomes } from "@/lib/automacoes/catalogo";
import { paiDe, type Operacao } from "@/lib/automacoes/operacoes";
import { saidasDe, UNIDADES, type Definicao, type No, type Regra } from "@/lib/automacoes/tipos";
import type { Pendencia } from "@/lib/automacoes/validar";
import { camposDeData, FormularioDoCatalogo, variaveisDisponiveis } from "./campos";
import { EditorDeRegra } from "./regra";
import { visualDoPasso, type Opcoes } from "./comum";

// ---------------------------------------------------------------------------
// Painel à direita: configura o passo escolhido no canvas (ou o gatilho, ou as
// configurações da automação). v5: painel limpo, blocos em bg-raised sem
// borda e texto na escala do tema. Cada mudança é uma operação pura (aplicar),
// então desfazer/refazer e a validação valem para tudo.
// ---------------------------------------------------------------------------

const NOME_DA_UNIDADE: Record<string, string> = { minutos: "minutos", horas: "horas", dias: "dias corridos", dias_uteis: "dias úteis" };

/** Passos antes deste no mesmo caminho (para as variáveis "Saída de ..."). */
export function anterioresDe(def: Definicao, id: string): { id: string; nome: string }[] {
  const lista: { id: string; nome: string }[] = [];
  let p = paiDe(def, id);
  const vistos = new Set<string>();
  while (p && p.de !== "gatilho" && !vistos.has(p.de)) {
    vistos.add(p.de);
    const no = def.nos[p.de];
    if (no?.tipo === "acao") lista.unshift({ id: no.id, nome: no.rotulo || acaoDoTipo(no.acao)?.nome || no.acao });
    p = paiDe(def, p.de);
  }
  return lista;
}

export interface ConfigDaAutomacao {
  nome: string;
  descricao: string;
  reinscricao: string;
  reinscricaoHoras: number | null;
  objetivo: Regra | null;
}

function Cabecalho({ tipo, acao, titulo, descricao, fechar }: { tipo: string; acao?: string; titulo: string; descricao?: string; fechar: () => void }) {
  const v = visualDoPasso(tipo, acao);
  const Icone = v.icone;
  return (
    <div className="flex items-start gap-3 border-b border-border-subtle px-4 py-3.5">
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]", CATEGORY_CLASSES[v.cor].subtle, CATEGORY_CLASSES[v.cor].fg)}>
        <Icone size={16} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-mono text-caption text-text-tertiary">{v.categoria}</p>
        <p className="truncate text-body font-semibold tracking-tight text-text-primary">{titulo}</p>
        {descricao && <p className="mt-0.5 text-caption text-text-secondary">{descricao}</p>}
      </div>
      <IconButton aria-label="Fechar painel" size="sm" type="button" onClick={fechar}>
        <X size={14} />
      </IconButton>
    </div>
  );
}

function Pendencias({ lista }: { lista: Pendencia[] }) {
  if (!lista.length) return null;
  return (
    <div className="flex flex-col gap-1 rounded-[14px] bg-danger-subtle px-3 py-2.5">
      {lista.map((p, i) => (
        <p key={i} className={cn("flex gap-1.5 text-caption", p.nivel === "erro" ? "text-danger" : "text-warning")}>
          <AlertCircle size={13} aria-hidden="true" className="mt-0.5 shrink-0" /> {p.mensagem}
        </p>
      ))}
    </div>
  );
}

function Apagar({ no, aplicar }: { no: No; aplicar: (op: Operacao) => void }) {
  const saidas = saidasDe(no);
  const [manter, setManter] = React.useState(saidas[0]?.saida ?? "");
  const variasSaidas = saidas.length > 1;
  return (
    <div className="mt-2 flex flex-col gap-2 border-t border-border-subtle pt-3">
      {variasSaidas && (
        <div>
          <Label htmlFor="manter-ramo">Ao apagar, o que continua</Label>
          <Select id="manter-ramo" value={manter} onChange={(e) => setManter(e.target.value)}>
            {saidas.map((s) => (
              <option key={s.saida} value={s.saida}>O ramo “{s.nome || "seguinte"}” (os outros somem)</option>
            ))}
          </Select>
        </div>
      )}
      <div>
        <Button type="button" variant="ghost" size="sm" className="text-danger" onClick={() => aplicar({ op: "apagar", id: no.id, ...(variasSaidas ? { manter } : {}) })}>
          <Trash2 size={13} /> Apagar passo
        </Button>
      </div>
    </div>
  );
}

export function PainelDoPasso({
  def,
  selecionado,
  aplicar,
  opcoes,
  pendencias,
  fechar,
}: {
  def: Definicao;
  selecionado: string;
  aplicar: (op: Operacao) => void;
  opcoes: Opcoes;
  nomes: Nomes;
  pendencias: Pendencia[];
  fechar: () => void;
}) {
  const doNo = pendencias.filter((p) => p.no === selecionado);

  if (selecionado === "gatilho") {
    const item = def.gatilho ? gatilhoDoTipo(def.gatilho.tipo) : undefined;
    const opcoesDeGatilho = gatilhosDoObjeto(def.objeto);
    return (
      <div className="flex h-full flex-col">
        <Cabecalho tipo="gatilho" titulo={item?.nome ?? "Escolha o gatilho"} descricao={item?.descricao ?? `O que faz a automação começar para um ${NOMES_DOS_OBJETOS[def.objeto].singular}.`} fechar={fechar} />
        <div className="flex flex-col gap-4 overflow-y-auto p-4">
          <Pendencias lista={doNo} />
          <div>
            <Label htmlFor="tipo-gatilho">Quando</Label>
            <Select
              id="tipo-gatilho"
              value={def.gatilho?.tipo ?? ""}
              onChange={(e) => {
                const novo = gatilhoDoTipo(e.target.value);
                if (novo) aplicar({ op: "definir_gatilho", gatilho: { tipo: novo.tipo, config: configPadrao(novo.campos) } });
              }}
            >
              <option value="">Escolha...</option>
              {opcoesDeGatilho.map((g) => (
                <option key={g.tipo} value={g.tipo}>{g.nome}</option>
              ))}
            </Select>
          </div>
          {item && def.gatilho && (
            <FormularioDoCatalogo
              campos={item.campos}
              config={def.gatilho.config ?? {}}
              mudar={(config) => aplicar({ op: "definir_gatilho", gatilho: { tipo: item.tipo, config } })}
              objeto={def.objeto}
              opcoes={opcoes}
              variaveis={variaveisDisponiveis(def.objeto, opcoes, [])}
            />
          )}
        </div>
      </div>
    );
  }

  const no = def.nos[selecionado];
  if (!no) return null;
  const variaveis = variaveisDisponiveis(def.objeto, opcoes, anterioresDe(def, no.id));
  const atualizar = (patch: Record<string, unknown>) => aplicar({ op: "atualizar", id: no.id, patch });
  const rotulo = (
    <div>
      <Label htmlFor="rotulo-passo">Nome do passo (opcional)</Label>
      <Input id="rotulo-passo" value={no.rotulo ?? ""} placeholder="Aparece no canvas e no histórico" onChange={(e) => atualizar({ rotulo: e.target.value })} />
    </div>
  );

  if (no.tipo === "acao") {
    const item = acaoDoTipo(no.acao);
    return (
      <div className="flex h-full flex-col">
        <Cabecalho tipo="acao" acao={no.acao} titulo={no.rotulo || item?.nome || no.acao} descricao={item?.descricao} fechar={fechar} />
        <div className="flex flex-col gap-4 overflow-y-auto p-4">
          <Pendencias lista={doNo} />
          {item && <FormularioDoCatalogo campos={item.campos} config={no.config ?? {}} mudar={(config) => atualizar({ config })} objeto={def.objeto} opcoes={opcoes} variaveis={variaveis} />}
          {rotulo}
          <div className="flex items-center justify-between gap-3 rounded-[14px] bg-raised px-3 py-2.5">
            <div>
              <p className="text-small font-medium text-text-primary">Caminho de erro</p>
              <p className="text-caption text-text-tertiary">Se a ação falhar de vez, segue por outro ramo em vez de parar.</p>
            </div>
            <Switch checked={no.erro !== undefined} onCheckedChange={(v) => atualizar({ comErro: v })} />
          </div>
          {item?.falaComCliente && <p className="text-caption text-text-tertiary">Fala com o cliente: respeita quem não aceita mensagens e só sai em horário comercial (seg–sáb, 8h–20h).</p>}
          <Apagar no={no} aplicar={aplicar} />
        </div>
      </div>
    );
  }

  if (no.tipo === "condicao") {
    return (
      <div className="flex h-full flex-col">
        <Cabecalho tipo="condicao" titulo={no.rotulo || "Condição"} descricao="Se a regra bater, segue por Sim; senão, por Não." fechar={fechar} />
        <div className="flex flex-col gap-4 overflow-y-auto p-4">
          <Pendencias lista={doNo} />
          <EditorDeRegra regra={no.regra} mudar={(regra) => atualizar({ regra })} objeto={def.objeto} opcoes={opcoes} />
          {rotulo}
          <Apagar no={no} aplicar={aplicar} />
        </div>
      </div>
    );
  }

  if (no.tipo === "caminhos") {
    return (
      <div className="flex h-full flex-col">
        <Cabecalho tipo="caminhos" titulo={no.rotulo || "Caminhos"} descricao="Vale o primeiro caminho cuja regra bater; nenhum bateu, vai para Caso contrário." fechar={fechar} />
        <div className="flex flex-col gap-4 overflow-y-auto p-4">
          <Pendencias lista={doNo} />
          {no.caminhos.map((c, i) => (
            <div key={c.id} className="flex flex-col gap-2 rounded-[14px] bg-raised p-3">
              <div className="flex items-center gap-1.5">
                <Input
                  value={c.nome}
                  aria-label={`Nome do caminho ${i + 1}`}
                  onChange={(e) => atualizar({ caminhos: no.caminhos.map((x) => (x.id === c.id ? { ...x, nome: e.target.value } : x)) })}
                />
                <IconButton aria-label="Remover caminho" size="sm" type="button" disabled={no.caminhos.length <= 1} onClick={() => aplicar({ op: "remover_caminho", id: no.id, caminhoId: c.id })}>
                  <Trash2 size={13} />
                </IconButton>
              </div>
              <EditorDeRegra regra={c.regra} mudar={(regra) => atualizar({ caminhos: no.caminhos.map((x) => (x.id === c.id ? { ...x, regra } : x)) })} objeto={def.objeto} opcoes={opcoes} />
            </div>
          ))}
          <div>
            <Button type="button" size="sm" variant="secondary" disabled={no.caminhos.length >= 10} onClick={() => aplicar({ op: "adicionar_caminho", id: no.id })}>
              <Plus size={13} /> Caminho
            </Button>
          </div>
          {rotulo}
          <Apagar no={no} aplicar={aplicar} />
        </div>
      </div>
    );
  }

  if (no.tipo === "espera") {
    const c = no.config;
    const datas = camposDeData(def.objeto, opcoes);
    return (
      <div className="flex h-full flex-col">
        <Cabecalho tipo="espera" titulo={no.rotulo || "Espera"} descricao="Para aqui e volta sozinha na hora certa (no fuso de São Paulo)." fechar={fechar} />
        <div className="flex flex-col gap-4 overflow-y-auto p-4">
          <Pendencias lista={doNo} />
          <div>
            <Label htmlFor="modo-espera">Esperar</Label>
            <Select
              id="modo-espera"
              value={c.modo}
              onChange={(e) => {
                const modo = e.target.value;
                atualizar({
                  config:
                    modo === "duracao"
                      ? { modo, quantidade: 1, unidade: "dias_uteis" }
                      : modo === "ate_data"
                        ? { modo, data: "" }
                        : { modo: "relativa_campo", campo: datas[0]?.caminho ?? "", dias: 0, hora: "09:00" },
                });
              }}
            >
              <option value="duracao">Um tempo</option>
              <option value="ate_data">Até uma data</option>
              <option value="relativa_campo">Até uma data do registro</option>
            </Select>
          </div>
          {c.modo === "duracao" && (
            <div className="flex gap-2">
              <Input type="number" min={1} aria-label="Quanto" value={c.quantidade} onChange={(e) => atualizar({ config: { ...c, quantidade: Number(e.target.value) } })} />
              <Select aria-label="Unidade" value={c.unidade} onChange={(e) => atualizar({ config: { ...c, unidade: e.target.value } })}>
                {UNIDADES.map((u) => (
                  <option key={u} value={u}>{NOME_DA_UNIDADE[u]}</option>
                ))}
              </Select>
            </div>
          )}
          {c.modo === "ate_data" && <Input type="date" aria-label="Data" value={c.data} onChange={(e) => atualizar({ config: { ...c, data: e.target.value } })} />}
          {c.modo === "relativa_campo" && (
            <>
              <Select aria-label="Campo de data" value={c.campo} onChange={(e) => atualizar({ config: { ...c, campo: e.target.value } })}>
                <option value="">Escolha o campo...</option>
                {datas.map((d) => (
                  <option key={d.caminho} value={d.caminho}>{d.rotulo}</option>
                ))}
              </Select>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Label htmlFor="dias-espera">Dias (negativo = antes)</Label>
                  <Input id="dias-espera" type="number" value={c.dias} onChange={(e) => atualizar({ config: { ...c, dias: Number(e.target.value) } })} />
                </div>
                <div className="flex-1">
                  <Label htmlFor="hora-espera">Hora</Label>
                  <Input id="hora-espera" type="time" value={c.hora ?? "09:00"} onChange={(e) => atualizar({ config: { ...c, hora: e.target.value } })} />
                </div>
              </div>
            </>
          )}
          {rotulo}
          <Apagar no={no} aplicar={aplicar} />
        </div>
      </div>
    );
  }

  if (no.tipo === "esperar_evento") {
    const eventos = EVENTOS_DE_ESPERA.filter((e) => e.objetos.includes(def.objeto));
    return (
      <div className="flex h-full flex-col">
        <Cabecalho tipo="esperar_evento" titulo={no.rotulo || "Esperar evento"} descricao="Segue por Aconteceu assim que o evento chegar, ou por Tempo esgotado no fim do prazo." fechar={fechar} />
        <div className="flex flex-col gap-4 overflow-y-auto p-4">
          <Pendencias lista={doNo} />
          <div>
            <Label htmlFor="evento-espera">Esperar</Label>
            <Select id="evento-espera" value={no.evento} onChange={(e) => atualizar({ evento: e.target.value })}>
              <option value="">Escolha...</option>
              {eventos.map((e) => (
                <option key={e.tipo} value={e.tipo}>{e.nome}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Por até</Label>
            <div className="flex gap-2">
              <Input type="number" min={1} aria-label="Prazo" value={no.prazo.quantidade} onChange={(e) => atualizar({ prazo: { ...no.prazo, quantidade: Number(e.target.value) } })} />
              <Select aria-label="Unidade do prazo" value={no.prazo.unidade} onChange={(e) => atualizar({ prazo: { ...no.prazo, unidade: e.target.value } })}>
                {UNIDADES.map((u) => (
                  <option key={u} value={u}>{NOME_DA_UNIDADE[u]}</option>
                ))}
              </Select>
            </div>
          </div>
          {rotulo}
          <Apagar no={no} aplicar={aplicar} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <Cabecalho tipo="fim" titulo="Fim" descricao="A execução termina aqui." fechar={fechar} />
      <div className="p-4">
        <Apagar no={no} aplicar={aplicar} />
      </div>
    </div>
  );
}

export function PainelDeConfiguracoes({
  def,
  config,
  mudar,
  opcoes,
  fechar,
}: {
  def: Definicao;
  config: ConfigDaAutomacao;
  mudar: (c: Partial<ConfigDaAutomacao>) => void;
  opcoes: Opcoes;
  fechar: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3.5">
        <p className="text-body font-semibold tracking-tight text-text-primary">Configurações</p>
        <IconButton aria-label="Fechar painel" size="sm" type="button" onClick={fechar}>
          <X size={14} />
        </IconButton>
      </div>
      <div className="flex flex-col gap-4 overflow-y-auto p-4">
        <div>
          <Label htmlFor="desc-automacao">Descrição</Label>
          <Input id="desc-automacao" value={config.descricao} onChange={(e) => mudar({ descricao: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="reinscricao">Um registro pode entrar de novo?</Label>
          <Select id="reinscricao" value={config.reinscricao} onChange={(e) => mudar({ reinscricao: e.target.value })}>
            <option value="uma_vez">Não: só uma vez</option>
            <option value="sempre">Sim, sempre (uma execução de cada vez)</option>
            <option value="intervalo">Sim, depois de um intervalo</option>
          </Select>
          {config.reinscricao === "intervalo" && (
            <div className="mt-2 flex items-center gap-2">
              <Input type="number" min={1} aria-label="Horas" className="w-24" value={config.reinscricaoHoras ?? 24} onChange={(e) => mudar({ reinscricaoHoras: Number(e.target.value) || 24 })} />
              <span className="text-small text-text-secondary">horas depois da última vez</span>
            </div>
          )}
          {config.reinscricao === "uma_vez" && def.gatilho && ["varredura"].includes(gatilhoDoTipo(def.gatilho.tipo)?.modo ?? "") && (
            <p className="mt-1 text-caption text-warning">Este gatilho é do relógio (parado, data, agendado): com “só uma vez”, cada registro entra uma única vez na vida.</p>
          )}
        </div>
        <div>
          <Label>Objetivo (sai da automação quando...)</Label>
          <p className="mb-2 text-caption text-text-tertiary">Quem passar a atender sai na hora, mesmo no meio de uma espera. Ex.: o negócio foi ganho, o cliente respondeu.</p>
          <EditorDeRegra regra={config.objetivo ?? { grupos: [] }} mudar={(r) => mudar({ objetivo: r.grupos.length ? r : null })} objeto={def.objeto} opcoes={opcoes} vazio="Sem objetivo: todo mundo vai até o fim." />
        </div>
      </div>
    </div>
  );
}
