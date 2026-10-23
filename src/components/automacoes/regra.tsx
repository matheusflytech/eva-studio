"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { CAMPOS_DO_CONTEXTO, type CampoDoContexto } from "@/lib/automacoes/catalogo";
import { NOME_DO_OPERADOR, OPERADORES_POR_TIPO, SEM_VALOR } from "@/lib/automacoes/condicoes";
import type { Condicao, Objeto, Operador, Regra } from "@/lib/automacoes/tipos";
import type { Opcoes } from "./comum";

// ---------------------------------------------------------------------------
// Regra em cartões: cada grupo é um E (todas as condições), e os grupos se
// somam com OU. Operador filtrado pelo tipo do campo; etapa, funil, pessoa e
// etiqueta escolhem da lista do contrato.
// ---------------------------------------------------------------------------

export function camposDaRegra(objeto: Objeto, opcoes: Opcoes): CampoDoContexto[] {
  const entidade = objeto === "deal" ? "deal" : objeto === "contact" ? "contact" : null;
  const personalizados: CampoDoContexto[] = entidade
    ? opcoes.camposPersonalizados
        .filter((c) => c.objeto === entidade)
        .map((c) => ({
          caminho: `registro.custom_fields.${c.chave}`,
          rotulo: c.nome,
          tipo: c.tipo === "number" || c.tipo === "currency" ? "numero" : c.tipo === "date" ? "data" : c.tipo === "boolean" ? "booleano" : "texto",
          grupo: "Campos personalizados",
        }))
    : [];
  return [...CAMPOS_DO_CONTEXTO[objeto], ...personalizados];
}

function ValorDaCondicao({ c, campo, opcoes, mudar }: { c: Condicao; campo?: CampoDoContexto; opcoes: Opcoes; mudar: (v: unknown) => void }) {
  if (SEM_VALOR.has(c.operador)) return null;
  if (c.operador === "entre") {
    const [a, b] = Array.isArray(c.valor) ? c.valor : ["", ""];
    const tipo = campo?.tipo === "data" ? "date" : "text";
    return (
      <div className="flex items-center gap-1">
        <Input type={tipo} value={String(a ?? "")} onChange={(e) => mudar([e.target.value, b])} />
        <span className="text-caption text-text-tertiary">e</span>
        <Input type={tipo} value={String(b ?? "")} onChange={(e) => mudar([a, e.target.value])} />
      </div>
    );
  }
  const lista =
    campo?.tipo === "etapa"
      ? opcoes.funis.flatMap((f) => f.etapas.map((e) => ({ id: e.id, nome: opcoes.funis.length > 1 ? `${f.nome} › ${e.nome}` : e.nome })))
      : campo?.tipo === "funil"
        ? opcoes.funis
        : campo?.tipo === "usuario"
          ? opcoes.usuarios
          : campo?.tipo === "tag"
            ? opcoes.tags
            : null;
  if (lista && (c.operador === "igual" || c.operador === "diferente" || c.operador === "contem" || c.operador === "nao_contem")) {
    return (
      <Select value={String(c.valor ?? "")} onChange={(e) => mudar(e.target.value)}>
        <option value="">Escolha...</option>
        {lista.map((o) => (
          <option key={o.id} value={o.id}>{o.nome}</option>
        ))}
      </Select>
    );
  }
  return (
    <Input
      type={campo?.tipo === "data" && c.operador !== "ultimos_dias" ? "date" : campo?.tipo === "numero" || c.operador === "ultimos_dias" ? "number" : "text"}
      value={Array.isArray(c.valor) ? c.valor.join(",") : String(c.valor ?? "")}
      placeholder={c.operador === "em" || c.operador === "nao_em" ? "valores separados por vírgula" : "valor"}
      onChange={(e) => mudar(e.target.value)}
    />
  );
}

export function EditorDeRegra({ regra, mudar, objeto, opcoes, vazio = "Sem condição: vale sempre." }: { regra: Regra; mudar: (r: Regra) => void; objeto: Objeto; opcoes: Opcoes; vazio?: string }) {
  const campos = camposDaRegra(objeto, opcoes);
  const grupos = regra?.grupos ?? [];
  const novaCondicao = (): Condicao => ({ campo: campos[0]?.caminho ?? "", operador: "igual", valor: "" });
  const setGrupo = (i: number, condicoes: Condicao[]) => mudar({ grupos: grupos.map((g, j) => (j === i ? { condicoes } : g)).filter((g) => g.condicoes.length) });

  return (
    <div className="flex flex-col gap-2">
      {grupos.length === 0 && <p className="text-caption text-text-tertiary">{vazio}</p>}
      {grupos.map((g, i) => (
        <React.Fragment key={i}>
          {i > 0 && <p className="text-center font-mono text-caption text-text-tertiary">ou</p>}
          <div className="flex flex-col gap-2 rounded-[14px] border border-border-subtle bg-panel p-2.5">
            {g.condicoes.map((c, k) => {
              const campo = campos.find((x) => x.caminho === c.campo);
              const ops = OPERADORES_POR_TIPO[campo?.tipo ?? "texto"] ?? OPERADORES_POR_TIPO.texto;
              const setC = (patch: Partial<Condicao>) => setGrupo(i, g.condicoes.map((x, j) => (j === k ? { ...x, ...patch } : x)));
              return (
                <div key={k} className="flex flex-col gap-1.5">
                  {k > 0 && <p className="font-mono text-caption text-text-tertiary">e</p>}
                  <div className="flex items-center gap-1.5">
                    <Select
                      value={c.campo}
                      onChange={(e) => {
                        const novo = campos.find((x) => x.caminho === e.target.value);
                        const opsNovo = OPERADORES_POR_TIPO[novo?.tipo ?? "texto"] ?? [];
                        setC({ campo: e.target.value, operador: opsNovo.includes(c.operador) ? c.operador : (opsNovo[0] as Operador), valor: "" });
                      }}
                    >
                      {[...new Set(campos.map((x) => x.grupo))].map((gr) => (
                        <optgroup key={gr} label={gr}>
                          {campos.filter((x) => x.grupo === gr).map((x) => (
                            <option key={x.caminho} value={x.caminho}>{x.rotulo}</option>
                          ))}
                        </optgroup>
                      ))}
                    </Select>
                    <IconButton aria-label="Tirar condição" size="sm" type="button" onClick={() => setGrupo(i, g.condicoes.filter((_, j) => j !== k))}>
                      <Trash2 size={13} />
                    </IconButton>
                  </div>
                  <Select value={c.operador} onChange={(e) => setC({ operador: e.target.value as Operador, valor: e.target.value === "entre" ? ["", ""] : c.valor })}>
                    {ops.map((o) => (
                      <option key={o} value={o}>{NOME_DO_OPERADOR[o]}</option>
                    ))}
                  </Select>
                  <ValorDaCondicao c={c} campo={campo} opcoes={opcoes} mudar={(valor) => setC({ valor })} />
                </div>
              );
            })}
            <div>
              <Button type="button" size="sm" variant="ghost" onClick={() => setGrupo(i, [...g.condicoes, novaCondicao()])}>
                <Plus size={13} /> E também
              </Button>
            </div>
          </div>
        </React.Fragment>
      ))}
      <div>
        <Button type="button" size="sm" variant="secondary" onClick={() => mudar({ grupos: [...grupos, { condicoes: [novaCondicao()] }] })}>
          <Plus size={13} /> {grupos.length ? "Ou outro grupo" : "Condição"}
        </Button>
      </div>
    </div>
  );
}
