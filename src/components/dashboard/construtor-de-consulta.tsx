"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { VisaoDoResultado, useResultadoDeConsulta } from "@/components/dashboard/resultado-de-consulta";
import { EditorDeFiltros } from "@/components/dashboard/editor-de-filtros";
import { SeletorMultiplo } from "@/components/dashboard/seletor-multiplo";
import { PergunteAEva, type RespostaIaCartao, type SugestaoDaIa } from "@/components/dashboard/ia-pergunte-a-eva";
import { rotulosDasOpcoes, type OpcoesDoDashboard } from "@/components/dashboard/opcoes";
import {
  AGRUPAMENTOS_BASE,
  CAMPOS_BASE_NUMERICOS,
  CONSULTA_PADRAO,
  DATAS_BASE,
  MEDIDAS,
  STATUS,
  dataBaseEfetiva,
  descreverConsulta,
  descreverSelecao,
  diaLocal,
  medidaPrecisaCampo,
  somarDias,
  tiposPermitidos,
  type Consulta,
  type DataBase,
  type FiltrosGlobais,
  type TipoDeCartao,
} from "@/lib/consulta";
import { cn } from "@/lib/utils";

const NOME_DO_TIPO: Record<TipoDeCartao, string> = { numero: "Número", linha: "Linha", pizza: "Pizza", barras: "Barras", tabela: "Tabela" };

export interface ResultadoDoConstrutor {
  consulta: Consulta;
  tipo: TipoDeCartao;
  titulo: string;
}

/**
 * Monta um cartão do zero: o que medir, separar por quê, quais negócios, como
 * mostrar. A prévia ao lado calcula de verdade enquanto a pessoa escolhe (com
 * os filtros do painel aplicados), então ela vê o número antes de salvar em
 * vez de descobrir depois que o filtro estava errado. Embaixo da prévia, a
 * frase em português do que entrou — é o jeito de leigo conferir um filtro.
 */
export function ConstrutorDeConsulta({
  inicial,
  globais,
  opcoes,
  aoSalvar,
  aoFechar,
  sugestaoDaIa,
}: {
  inicial?: { consulta: Consulta; tipo: TipoDeCartao; titulo: string };
  globais: FiltrosGlobais;
  opcoes: OpcoesDoDashboard;
  aoSalvar: (r: ResultadoDoConstrutor) => void;
  aoFechar: () => void;
  /** Cartão novo já preenchido pela IA (ex.: "Montar um cartão com isso" na barra do painel). */
  sugestaoDaIa?: SugestaoDaIa;
}) {
  const comeco = inicial ?? sugestaoDaIa;
  const [consulta, setConsulta] = React.useState<Consulta>(comeco?.consulta ?? CONSULTA_PADRAO);
  const [tipoEscolhido, setTipoEscolhido] = React.useState<TipoDeCartao>(comeco?.tipo ?? "barras");
  const [titulo, setTitulo] = React.useState(comeco?.titulo ?? "");
  const [tituloMexido, setTituloMexido] = React.useState(!!comeco?.titulo);

  // Pilha do "Desfazer" da IA: cada resposta aplicada guarda o montador de antes.
  const [antesDaIa, setAntesDaIa] = React.useState<{ consulta: Consulta; tipo: TipoDeCartao; titulo: string; tituloMexido: boolean }[]>([]);

  function aplicarDaIa(r: RespostaIaCartao) {
    setAntesDaIa((p) => [...p, { consulta, tipo: tipoEscolhido, titulo, tituloMexido }].slice(-10));
    setConsulta(r.consulta);
    setTipoEscolhido(r.tipo);
    setTitulo(r.titulo);
    setTituloMexido(!!r.titulo);
  }

  function desfazerIa() {
    const anterior = antesDaIa[antesDaIa.length - 1];
    if (!anterior) return;
    setAntesDaIa((p) => p.slice(0, -1));
    setConsulta(anterior.consulta);
    setTipoEscolhido(anterior.tipo);
    setTitulo(anterior.titulo);
    setTituloMexido(anterior.tituloMexido);
  }

  const campos = opcoes.campos;
  const rotulos = rotulosDasOpcoes(opcoes);
  const permitidos = tiposPermitidos(consulta);
  const tipo = permitidos.includes(tipoEscolhido) ? tipoEscolhido : permitidos[0];

  const camposNumericos = campos.filter((c) => c.type === "number" || c.type === "currency");
  const camposAgrupaveis = campos.filter((c) => ["select", "multiselect", "checkbox", "text", "number", "currency", "date", "datetime", "time"].includes(c.type));

  const sugestao = descreverConsulta(consulta, rotulos);
  const tituloFinal = tituloMexido && titulo.trim() ? titulo.trim() : sugestao.charAt(0).toUpperCase() + sugestao.slice(1);
  const selecao = descreverSelecao(consulta, rotulos);

  function mudar(p: Partial<Consulta>) {
    setConsulta((c) => ({ ...c, ...p }));
  }

  function mudarMedida(m: Consulta["medida"]) {
    const p: Partial<Consulta> = { medida: m, campo: medidaPrecisaCampo(m) ? consulta.campo ?? "valor" : undefined };
    // Taxa de ganho só existe entre fechados, contados pela data de fechamento.
    if (m === "taxaGanho") Object.assign(p, { status: "todos", dataBase: "fechamento" });
    mudar(p);
  }

  const intervaloFixo = typeof consulta.periodo === "object" ? consulta.periodo : null;
  const modoPeriodo = intervaloFixo ? "fixo" : (consulta.periodo as "painel" | "tudo");
  const podeComparar = !consulta.agrupar && consulta.periodo !== "tudo";

  const { resultado, erro, carregando } = useResultadoDeConsulta(consulta, tipo, globais, 350);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6" role="dialog" aria-label="Montar cartão">
      <div className="absolute inset-0 bg-backdrop" onClick={aoFechar} />
      <div className="border border-border-default bg-overlay shadow-overlay relative z-10 flex max-h-[94dvh] w-full max-w-[1040px] flex-col overflow-hidden rounded-[18px]">
        <header className="flex items-start justify-between gap-3 border-b border-border-subtle p-5">
          <div>
            <h2 className="text-title-sm font-semibold text-text-primary">Montar um cartão</h2>
            <p className="mt-1 text-small text-text-secondary">Escolha o que medir. A prévia calcula com os seus negócios de verdade.</p>
          </div>
          <button type="button" onClick={aoFechar} aria-label="Fechar" className="text-text-tertiary hover:text-text-primary">
            <X size={17} />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 gap-0 overflow-y-auto md:grid-cols-[1fr_340px] md:overflow-hidden">
          <div className="flex flex-col gap-6 p-5 md:overflow-y-auto">
            <PergunteAEva
              consultaAtual={consulta}
              aoAplicar={aplicarDaIa}
              podeDesfazer={antesDaIa.length > 0}
              aoDesfazer={desfazerIa}
              inicial={sugestaoDaIa ? { explicacao: sugestaoDaIa.explicacao, avisos: sugestaoDaIa.avisos } : undefined}
            />

            <section>
              <Label>1. O que medir</Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {MEDIDAS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => mudarMedida(m.id)}
                    aria-pressed={consulta.medida === m.id}
                    className={cn(
                      "rounded-[14px] px-3 py-2.5 text-left ring-1 transition-colors",
                      consulta.medida === m.id ? "bg-accent-subtle ring-accent-solid/50" : "bg-raised ring-border-subtle hover:ring-border-strong"
                    )}
                  >
                    <div className="text-small font-medium text-text-primary">{m.rotulo}</div>
                    <div className="mt-0.5 text-caption leading-snug text-text-tertiary">{m.descricao}</div>
                  </button>
                ))}
              </div>
              {medidaPrecisaCampo(consulta.medida) && (
                <div className="mt-3">
                  <Label htmlFor="q-campo">De qual valor</Label>
                  <Select id="q-campo" value={consulta.campo ?? "valor"} onChange={(e) => mudar({ campo: e.target.value })}>
                    {CAMPOS_BASE_NUMERICOS.map((c) => (
                      <option key={c.id} value={c.id}>{c.rotulo}</option>
                    ))}
                    {camposNumericos.length > 0 && (
                      <optgroup label="Seus campos">
                        {camposNumericos.map((c) => (
                          <option key={c.id} value={`cf:${c.key}`}>{c.label}</option>
                        ))}
                      </optgroup>
                    )}
                  </Select>
                  {camposNumericos.length === 0 && (
                    <p className="mt-1.5 text-caption text-text-tertiary">
                      Campos de número ou de valor que você criar em Negócios {">"} Personalizar aparecem aqui.
                    </p>
                  )}
                </div>
              )}
            </section>

            <section>
              <Label htmlFor="q-agrupar">2. Separar por</Label>
              <Select id="q-agrupar" value={consulta.agrupar} onChange={(e) => mudar({ agrupar: e.target.value, ...(e.target.value ? { comparar: undefined } : {}) })}>
                {AGRUPAMENTOS_BASE.filter((a) => !a.grupo).map((a) => (
                  <option key={a.id} value={a.id}>{a.rotulo}</option>
                ))}
                {(["Negócio", "Tempo", "Valor"] as const).map((g) => (
                  <optgroup key={g} label={g}>
                    {AGRUPAMENTOS_BASE.filter((a) => a.grupo === g).map((a) => (
                      <option key={a.id} value={a.id}>{a.rotulo}</option>
                    ))}
                  </optgroup>
                ))}
                {camposAgrupaveis.length > 0 && (
                  <optgroup label="Seus campos">
                    {camposAgrupaveis.map((c) => (
                      <option key={c.id} value={`cf:${c.key}`}>
                        Por {c.label.toLowerCase()}
                        {c.type === "number" || c.type === "currency" ? " (em faixas)" : c.type === "date" || c.type === "datetime" ? " (por mês)" : ""}
                      </option>
                    ))}
                  </optgroup>
                )}
              </Select>
            </section>

            <section className="flex flex-col gap-4">
              <Label className="mb-0">3. Quais negócios</Label>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Situação dos negócios">
                {STATUS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    role="radio"
                    aria-checked={consulta.status === s.id}
                    onClick={() => mudar({ status: s.id, ...(consulta.periodo === "tudo" && (s.id === "ganhos" || s.id === "perdidos") ? { periodo: "painel" } : {}) })}
                    className={cn(
                      "rounded-xl px-3.5 py-2 text-small font-medium transition-colors",
                      consulta.status === s.id ? "bg-accent-subtle text-accent-fg ring-1 ring-accent-solid/40" : "bg-raised text-text-secondary hover:text-text-primary"
                    )}
                  >
                    {s.rotulo}
                  </button>
                ))}
              </div>

              {opcoes.funis.length > 1 && (
                <div>
                  <Label>Funis</Label>
                  <SeletorMultiplo
                    rotulo="Funis do cartão"
                    opcoes={opcoes.funis.map((f) => ({ id: f.id, label: f.name }))}
                    valores={consulta.funilIds}
                    aoMudar={(funilIds) => mudar({ funilIds })}
                    placeholder="Todos os funis"
                  />
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="q-periodo">Período</Label>
                  <Select
                    id="q-periodo"
                    value={modoPeriodo}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "fixo") {
                        const hoje = diaLocal(new Date());
                        mudar({ periodo: { de: somarDias(hoje, -29), ate: hoje } });
                      } else mudar({ periodo: v as "painel" | "tudo", ...(v === "tudo" ? { comparar: undefined } : {}) });
                    }}
                  >
                    <option value="painel">O período escolhido no painel</option>
                    <option value="tudo">Todo o histórico</option>
                    <option value="fixo">Um intervalo fixo</option>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="q-database">Contar pela data de</Label>
                  <Select
                    id="q-database"
                    value={dataBaseEfetiva(consulta)}
                    onChange={(e) => mudar({ dataBase: e.target.value as DataBase })}
                  >
                    {DATAS_BASE.map((d) => (
                      <option key={d.id} value={d.id}>{d.rotulo}</option>
                    ))}
                  </Select>
                </div>
              </div>
              {intervaloFixo && (
                <div className="flex flex-wrap items-center gap-2">
                  <Input type="date" aria-label="De" className="h-9 w-[170px] text-small" value={intervaloFixo.de} onChange={(e) => e.target.value && mudar({ periodo: { ...intervaloFixo, de: e.target.value } })} />
                  <span className="text-caption text-text-tertiary">até</span>
                  <Input type="date" aria-label="Até" className="h-9 w-[170px] text-small" value={intervaloFixo.ate} onChange={(e) => e.target.value && mudar({ periodo: { ...intervaloFixo, ate: e.target.value } })} />
                </div>
              )}

              {podeComparar && (
                <label className="flex cursor-pointer items-center justify-between gap-3 rounded-[14px] bg-raised px-3 py-2.5">
                  <span>
                    <span className="block text-small text-text-primary">Comparar com o período anterior</span>
                    <span className="block text-caption text-text-tertiary">Mostra a variação contra o mesmo número de dias logo antes.</span>
                  </span>
                  <Switch checked={!!consulta.comparar} onCheckedChange={(v) => mudar({ comparar: v || undefined })} aria-label="Comparar com o período anterior" />
                </label>
              )}

              <div>
                <Label className="mb-1.5">Só os negócios em que</Label>
                <EditorDeFiltros filtros={consulta.filtros} aoMudar={(filtros) => mudar({ filtros })} opcoes={opcoes} funilIds={consulta.funilIds} />
              </div>
            </section>

            <section>
              <Label>4. Como mostrar</Label>
              <div className="flex flex-wrap gap-1.5">
                {permitidos.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTipoEscolhido(t)}
                    aria-pressed={tipo === t}
                    className={cn(
                      "h-8 rounded-full px-3.5 text-small font-medium transition-colors",
                      tipo === t ? "bg-inverse text-inverse-fg" : "border border-border-subtle bg-raised text-text-secondary hover:text-text-primary"
                    )}
                  >
                    {NOME_DO_TIPO[t]}
                  </button>
                ))}
              </div>
              <div className="mt-3">
                <Label htmlFor="q-titulo">Título do cartão</Label>
                <Input id="q-titulo" value={tituloMexido ? titulo : ""} placeholder={tituloFinal} onChange={(e) => { setTitulo(e.target.value); setTituloMexido(true); }} />
              </div>
            </section>
          </div>

          <aside className="border-t border-border-subtle bg-raised/40 p-5 md:overflow-y-auto md:border-l md:border-t-0">
            <p className="font-mono text-caption text-text-tertiary">Prévia</p>
            <div className="mt-2 rounded-[18px] border border-border-subtle bg-panel p-4">
              <h3 className="text-small text-text-tertiary">{tituloFinal}</h3>
              <div className="mt-2">
                <VisaoDoResultado resultado={resultado} erro={erro} carregando={carregando} tipo={tipo} />
              </div>
            </div>
            <p className="mt-4 font-mono text-caption text-text-tertiary">O que entra</p>
            <p className="mt-1.5 text-small leading-relaxed text-text-secondary">{selecao}.</p>
            {(globais.funis.length > 0 || globais.donos.length > 0) && (
              <p className="mt-2 text-caption leading-relaxed text-text-tertiary">
                Os filtros do painel (funis e responsável) também valem para este cartão.
              </p>
            )}
          </aside>
        </div>

        <footer className="flex justify-end gap-2 border-t border-border-subtle p-4">
          <Button variant="ghost" onClick={aoFechar}>Cancelar</Button>
          <Button variant="primary" onClick={() => aoSalvar({ consulta, tipo, titulo: tituloFinal })}>
            {inicial ? "Salvar cartão" : "Adicionar ao painel"}
          </Button>
        </footer>
      </div>
    </div>
  );
}
