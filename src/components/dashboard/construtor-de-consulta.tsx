"use client";

import * as React from "react";
import { Plus, X } from "lucide-react";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { VisaoDoResultado, useResultadoDeConsulta } from "@/components/dashboard/resultado-de-consulta";
import {
  AGRUPAMENTOS_BASE,
  CAMPOS_BASE_NUMERICOS,
  CONSULTA_PADRAO,
  MEDIDAS,
  OPERADORES,
  STATUS,
  descreverConsulta,
  tiposPermitidos,
  type Consulta,
  type FiltroDeConsulta,
  type OperadorDeFiltro,
  type TipoDeCartao,
} from "@/lib/consulta";
import type { DefinicaoDeCampo } from "@/lib/custom-fields";
import { cn } from "@/lib/utils";

const NOME_DO_TIPO: Record<TipoDeCartao, string> = { numero: "Número", linha: "Linha", pizza: "Pizza", barras: "Barras", tabela: "Tabela" };

interface Funil { id: string; name: string; stages: { id: string; name: string }[] }
interface Membro { id: string; name: string }

export interface ResultadoDoConstrutor {
  consulta: Consulta;
  tipo: TipoDeCartao;
  titulo: string;
}

/**
 * Monta um cartão do zero: o que medir, agrupar por quê, quais negócios, como
 * mostrar. A prévia ao lado calcula de verdade enquanto a pessoa escolhe, então
 * ela vê o número antes de salvar em vez de descobrir depois que o filtro
 * estava errado.
 */
export function ConstrutorDeConsulta({
  inicial,
  dias,
  aoSalvar,
  aoFechar,
}: {
  inicial?: { consulta: Consulta; tipo: TipoDeCartao; titulo: string };
  dias: number;
  aoSalvar: (r: ResultadoDoConstrutor) => void;
  aoFechar: () => void;
}) {
  const [consulta, setConsulta] = React.useState<Consulta>(inicial?.consulta ?? CONSULTA_PADRAO);
  const [tipoEscolhido, setTipoEscolhido] = React.useState<TipoDeCartao>(inicial?.tipo ?? "barras");
  const [titulo, setTitulo] = React.useState(inicial?.titulo ?? "");
  const [tituloMexido, setTituloMexido] = React.useState(!!inicial?.titulo);
  const [campos, setCampos] = React.useState<DefinicaoDeCampo[]>([]);
  const [funis, setFunis] = React.useState<Funil[]>([]);
  const [membros, setMembros] = React.useState<Membro[]>([]);

  React.useEffect(() => {
    fetch("/api/custom-fields?entity=deal&todos=1").then((r) => r.json()).then((d) => setCampos(d.fields ?? [])).catch(() => {});
    fetch("/api/pipelines").then((r) => r.json()).then((d) => setFunis(d.pipelines ?? [])).catch(() => {});
    fetch("/api/members").then((r) => r.json()).then((d) => setMembros(d.members ?? [])).catch(() => {});
  }, []);

  const permitidos = tiposPermitidos(consulta);
  const tipo = permitidos.includes(tipoEscolhido) ? tipoEscolhido : permitidos[0];

  const camposNumericos = campos.filter((c) => c.type === "number" || c.type === "currency");
  const camposAgrupaveis = campos.filter((c) => ["select", "multiselect", "checkbox", "text"].includes(c.type));

  const sugestao = descreverConsulta(consulta, campos, funis);
  const tituloFinal = tituloMexido && titulo.trim() ? titulo.trim() : sugestao.charAt(0).toUpperCase() + sugestao.slice(1);

  function mudar(p: Partial<Consulta>) {
    setConsulta((c) => ({ ...c, ...p }));
  }

  function mudarMedida(m: Consulta["medida"]) {
    mudar({ medida: m, campo: m === "contagem" ? undefined : consulta.campo ?? "valor" });
  }

  const { resultado, erro, carregando } = useResultadoDeConsulta(consulta, tipo, dias, 350);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6" role="dialog" aria-label="Montar cartão">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={aoFechar} />
      <div className="glass-card glass-card-solid relative z-10 flex max-h-[94dvh] w-full max-w-[920px] flex-col overflow-hidden rounded-3xl">
        <header className="flex items-start justify-between gap-3 border-b border-border-subtle p-5">
          <div>
            <h2 className="font-display text-[17px] font-semibold text-text-primary">Montar um cartão</h2>
            <p className="mt-1 text-[12.5px] text-text-secondary">Escolha o que medir. A prévia calcula com os seus negócios de verdade.</p>
          </div>
          <button type="button" onClick={aoFechar} aria-label="Fechar" className="text-text-tertiary hover:text-text-primary">
            <X size={17} />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 gap-0 overflow-y-auto md:grid-cols-[1fr_340px] md:overflow-hidden">
          <div className="flex flex-col gap-5 p-5 md:overflow-y-auto">
            <section>
              <Label>1. O que medir</Label>
              <div className="grid grid-cols-3 gap-2">
                {MEDIDAS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => mudarMedida(m.id)}
                    className={cn(
                      "rounded-xl px-3 py-2.5 text-left ring-1 transition-colors",
                      consulta.medida === m.id ? "bg-accent-500/12 ring-accent-500/50" : "bg-surface-2 ring-border-subtle hover:ring-border-strong"
                    )}
                  >
                    <div className="text-[13px] font-medium text-text-primary">{m.rotulo}</div>
                    <div className="mt-0.5 text-[11.5px] text-text-tertiary">{m.descricao}</div>
                  </button>
                ))}
              </div>
              {consulta.medida !== "contagem" && (
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
                    <p className="mt-1.5 text-[11.5px] text-text-tertiary">
                      Campos de número ou de valor que você criar em Negócios {">"} Personalizar aparecem aqui.
                    </p>
                  )}
                </div>
              )}
            </section>

            <section>
              <Label htmlFor="q-agrupar">2. Separar por</Label>
              <Select id="q-agrupar" value={consulta.agrupar} onChange={(e) => mudar({ agrupar: e.target.value })}>
                {AGRUPAMENTOS_BASE.map((a) => (
                  <option key={a.id} value={a.id}>{a.rotulo}</option>
                ))}
                {camposAgrupaveis.length > 0 && (
                  <optgroup label="Seus campos">
                    {camposAgrupaveis.map((c) => (
                      <option key={c.id} value={`cf:${c.key}`}>Por {c.label.toLowerCase()}</option>
                    ))}
                  </optgroup>
                )}
              </Select>
            </section>

            <section className="flex flex-col gap-3">
              <Label className="mb-0">3. Quais negócios</Label>
              <div className="flex flex-wrap gap-1.5">
                {STATUS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => mudar({ status: s.id, periodo: s.id === "ganhos" || s.id === "perdidos" ? "painel" : "tudo" })}
                    className={cn(
                      "rounded-xl px-3.5 py-2 text-[12.5px] font-medium transition-colors",
                      consulta.status === s.id ? "bg-accent-soft text-accent-300 ring-1 ring-accent-500/40" : "bg-surface-2 text-text-secondary hover:text-text-primary"
                    )}
                  >
                    {s.rotulo}
                  </button>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {funis.length > 1 && (
                  <div>
                    <Label htmlFor="q-funil">Funil</Label>
                    <Select id="q-funil" value={consulta.funilId ?? ""} onChange={(e) => mudar({ funilId: e.target.value || undefined })}>
                      <option value="">Todos os funis</option>
                      {funis.map((f) => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </Select>
                  </div>
                )}
                <div>
                  <Label htmlFor="q-periodo">Período</Label>
                  <Select id="q-periodo" value={consulta.periodo} onChange={(e) => mudar({ periodo: e.target.value as Consulta["periodo"] })}>
                    <option value="painel">O período escolhido no painel</option>
                    <option value="tudo">Todo o histórico</option>
                  </Select>
                </div>
              </div>

              <FiltrosEditor consulta={consulta} campos={campos} funis={funis} membros={membros} onChange={(filtros) => mudar({ filtros })} />
            </section>

            <section>
              <Label>4. Como mostrar</Label>
              <div className="flex flex-wrap gap-1.5">
                {permitidos.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTipoEscolhido(t)}
                    className={cn(
                      "rounded-xl px-3.5 py-2 text-[12.5px] font-medium transition-colors",
                      tipo === t ? "bg-accent-soft text-accent-300 ring-1 ring-accent-500/40" : "bg-surface-2 text-text-secondary hover:text-text-primary"
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

          <aside className="border-t border-border-subtle bg-surface-1/40 p-5 md:overflow-y-auto md:border-l md:border-t-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">Prévia</p>
            <div className="glass-card mt-2 rounded-2xl p-4">
              <h3 className="text-[12.5px] text-text-tertiary">{tituloFinal}</h3>
              <div className="mt-2">
                <VisaoDoResultado resultado={resultado} erro={erro} carregando={carregando} tipo={tipo} />
              </div>
            </div>
            <p className="mt-3 text-[11.5px] leading-relaxed text-text-tertiary">{sugestao}.</p>
          </aside>
        </div>

        <footer className="flex justify-end gap-2 border-t border-border-subtle p-4">
          <Button variant="ghost" onClick={aoFechar}>Cancelar</Button>
          <Button onClick={() => aoSalvar({ consulta, tipo, titulo: tituloFinal })}>
            {inicial ? "Salvar cartão" : "Adicionar ao painel"}
          </Button>
        </footer>
      </div>
    </div>
  );
}

function FiltrosEditor({
  consulta,
  campos,
  funis,
  membros,
  onChange,
}: {
  consulta: Consulta;
  campos: DefinicaoDeCampo[];
  funis: Funil[];
  membros: Membro[];
  onChange: (f: FiltroDeConsulta[]) => void;
}) {
  const filtros = consulta.filtros;
  const set = (i: number, p: Partial<FiltroDeConsulta>) => onChange(filtros.map((f, j) => (j === i ? { ...f, ...p } : f)));
  const etapas = funis
    .filter((f) => !consulta.funilId || f.id === consulta.funilId)
    .flatMap((f) => f.stages.map((s) => ({ id: s.id, nome: funis.length > 1 ? `${s.name} (${f.name})` : s.name })));

  const defDe = (campo: string) => campos.find((c) => `cf:${c.key}` === campo);

  function operadoresDe(campo: string): { id: OperadorDeFiltro; rotulo: string }[] {
    const def = defDe(campo);
    const ordem = def && ["number", "currency", "date"].includes(def.type) ? ["eq", "gt", "lt", "preenchido", "vazio"] : ["eq", "neq", "preenchido", "vazio"];
    return ordem.map((id) => OPERADORES.find((o) => o.id === id)!);
  }

  return (
    <div>
      <Label>Só os negócios em que</Label>
      <div className="flex flex-col gap-2">
        {filtros.map((f, i) => {
          const def = defDe(f.campo);
          const semValor = f.op === "vazio" || f.op === "preenchido";
          return (
            <div key={i} className="flex flex-wrap items-center gap-1.5 rounded-xl bg-surface-2 p-2">
              <div className="min-w-[130px] flex-1">
                <Select
                  value={f.campo}
                  aria-label="Campo do filtro"
                  className="h-9"
                  onChange={(e) => set(i, { campo: e.target.value, op: "eq", valor: "" })}
                >
                  <option value="etapa">Etapa</option>
                  <option value="responsavel">Responsável</option>
                  {campos.map((c) => (
                    <option key={c.id} value={`cf:${c.key}`}>{c.label}</option>
                  ))}
                </Select>
              </div>
              <div className="w-[130px]">
                <Select value={f.op} aria-label="Operador" className="h-9" onChange={(e) => set(i, { op: e.target.value as OperadorDeFiltro })}>
                  {operadoresDe(f.campo).map((o) => (
                    <option key={o.id} value={o.id}>{o.rotulo}</option>
                  ))}
                </Select>
              </div>
              {!semValor && (
                <div className="min-w-[130px] flex-1">
                  {f.campo === "etapa" ? (
                    <Select value={f.valor ?? ""} aria-label="Valor" className="h-9" onChange={(e) => set(i, { valor: e.target.value })}>
                      <option value="">Escolha...</option>
                      {etapas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
                    </Select>
                  ) : f.campo === "responsavel" ? (
                    <Select value={f.valor ?? ""} aria-label="Valor" className="h-9" onChange={(e) => set(i, { valor: e.target.value })}>
                      <option value="">Escolha...</option>
                      {membros.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </Select>
                  ) : def && (def.type === "select" || def.type === "multiselect") ? (
                    <Select value={f.valor ?? ""} aria-label="Valor" className="h-9" onChange={(e) => set(i, { valor: e.target.value })}>
                      <option value="">Escolha...</option>
                      {def.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </Select>
                  ) : def?.type === "checkbox" ? (
                    <Select value={f.valor ?? ""} aria-label="Valor" className="h-9" onChange={(e) => set(i, { valor: e.target.value })}>
                      <option value="">Escolha...</option>
                      <option value="true">Sim</option>
                      <option value="false">Não</option>
                    </Select>
                  ) : (
                    <Input
                      value={f.valor ?? ""}
                      aria-label="Valor"
                      className="h-9"
                      type={def?.type === "date" ? "date" : "text"}
                      inputMode={def && (def.type === "number" || def.type === "currency") ? "decimal" : undefined}
                      onChange={(e) => set(i, { valor: e.target.value })}
                    />
                  )}
                </div>
              )}
              <button type="button" aria-label="Remover filtro" onClick={() => onChange(filtros.filter((_, j) => j !== i))} className="rounded-lg p-1.5 text-text-tertiary hover:text-danger">
                <X size={14} />
              </button>
            </div>
          );
        })}
        {filtros.length < 6 && (
          <button
            type="button"
            onClick={() => onChange([...filtros, { campo: "etapa", op: "eq", valor: "" }])}
            className="inline-flex w-fit items-center gap-1.5 text-[12px] text-accent-400 hover:underline"
          >
            <Plus size={13} /> Adicionar filtro
          </button>
        )}
      </div>
    </div>
  );
}
