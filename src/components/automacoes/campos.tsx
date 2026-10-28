"use client";

import * as React from "react";
import { Braces, Plus, Trash2 } from "lucide-react";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { CAMPOS_DO_CONTEXTO, camposVisiveis, type CampoDeConfig, type CampoDoContexto } from "@/lib/automacoes/catalogo";
import type { Objeto } from "@/lib/automacoes/tipos";
import type { Opcoes } from "./comum";

// ---------------------------------------------------------------------------
// Formulário de um gatilho ou ação, montado do catálogo (CampoDeConfig). Os
// seletores vêm das opções do contrato. Texto aceita variável: o botão {}
// insere {{caminho}} dos campos do registro e dos passos anteriores.
// ---------------------------------------------------------------------------

export interface VariavelDisponivel {
  caminho: string;
  rotulo: string;
  grupo: string;
}

/** Variáveis do contexto + campos personalizados + saídas dos passos anteriores. */
export function variaveisDisponiveis(objeto: Objeto, opcoes: Opcoes, anteriores: { id: string; nome: string }[]): VariavelDisponivel[] {
  const base: VariavelDisponivel[] = CAMPOS_DO_CONTEXTO[objeto].map((c) => ({ caminho: c.caminho, rotulo: c.rotulo, grupo: c.grupo }));
  const entidade = objeto === "deal" ? "deal" : objeto === "contact" ? "contact" : null;
  const personalizados = entidade
    ? opcoes.camposPersonalizados.filter((c) => c.objeto === entidade).map((c) => ({ caminho: `registro.custom_fields.${c.chave}`, rotulo: c.nome, grupo: "Campos personalizados" }))
    : [];
  const passos = anteriores.map((p) => ({ caminho: `passos.${p.id}`, rotulo: `Saída de “${p.nome}”`, grupo: "Passos anteriores" }));
  return [...base, ...personalizados, ...passos];
}

/** Campos de data do registro (para "Data de um campo" e espera relativa). */
export function camposDeData(objeto: Objeto, opcoes: Opcoes): CampoDoContexto[] {
  const entidade = objeto === "deal" ? "deal" : objeto === "contact" ? "contact" : null;
  return [
    ...CAMPOS_DO_CONTEXTO[objeto].filter((c) => c.tipo === "data" && c.caminho.startsWith("registro.")),
    ...(entidade
      ? opcoes.camposPersonalizados.filter((c) => c.objeto === entidade && (c.tipo === "date" || c.tipo === "datetime")).map((c) => ({ caminho: `registro.custom_fields.${c.chave}`, rotulo: c.nome, tipo: "data" as const, grupo: "Campos personalizados" }))
      : []),
  ];
}

function InserirVariavel({ variaveis, inserir }: { variaveis: VariavelDisponivel[]; inserir: (v: string) => void }) {
  const [aberto, setAberto] = React.useState(false);
  const grupos = [...new Set(variaveis.map((v) => v.grupo))];
  return (
    <div className="relative">
      <IconButton aria-label="Inserir variável" tooltip size="sm" type="button" onClick={() => setAberto((x) => !x)}>
        <Braces size={13} />
      </IconButton>
      {aberto && (
        <div className="absolute right-0 top-8 z-30 max-h-72 w-64 overflow-y-auto rounded-[14px] border border-border-default bg-overlay p-1 shadow-overlay">
          {grupos.map((g) => (
            <div key={g}>
              <p className="px-2 pb-0.5 pt-2 font-mono text-caption text-text-tertiary">{g}</p>
              {variaveis
                .filter((v) => v.grupo === g)
                .map((v) => (
                  <button
                    key={v.caminho}
                    type="button"
                    className="block w-full rounded-[8px] px-2 py-1 text-left text-small text-text-secondary hover:bg-hover hover:text-text-primary"
                    onClick={() => {
                      inserir(`{{${v.caminho}}}`);
                      setAberto(false);
                    }}
                  >
                    {v.rotulo}
                  </button>
                ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function opcoesDoTipo(campo: CampoDeConfig, objeto: Objeto, opcoes: Opcoes, config: Record<string, unknown>): { valor: string; rotulo: string }[] | null {
  switch (campo.tipo) {
    case "lista":
      return campo.opcoes ?? [];
    case "etapa":
      return opcoes.funis.flatMap((f) => f.etapas.map((e) => ({ valor: e.id, rotulo: opcoes.funis.length > 1 ? `${f.nome} › ${e.nome}` : e.nome })));
    case "funil":
      return opcoes.funis.map((f) => ({ valor: f.id, rotulo: f.nome }));
    case "tag":
      return opcoes.tags.map((t) => ({ valor: t.id, rotulo: t.nome }));
    case "usuario":
      return opcoes.usuarios.map((u) => ({ valor: u.id, rotulo: u.nome }));
    case "agente":
      return opcoes.agentes.map((a) => ({ valor: a.id, rotulo: a.nome }));
    case "canal":
      return [
        { valor: "whatsapp_meta", rotulo: "WhatsApp oficial" },
        { valor: "whatsapp_qr", rotulo: "WhatsApp (QR)" },
        { valor: "instagram", rotulo: "Instagram" },
        { valor: "messenger", rotulo: "Messenger" },
        { valor: "telegram", rotulo: "Telegram" },
        { valor: "tiktok", rotulo: "TikTok" },
        { valor: "website", rotulo: "Site" },
      ];
    case "modelo_whatsapp":
      return opcoes.modelosWhatsapp.filter((m) => !config.agente || m.agentId === config.agente).map((m) => ({ valor: m.id, rotulo: m.nome }));
    case "modelo_email":
      return opcoes.modelosEmail.map((m) => ({ valor: m.id, rotulo: m.nome }));
    case "regua":
      return opcoes.reguas.map((r) => ({ valor: r.id, rotulo: `${r.nome}${r.ativa ? "" : " (desligada)"}` }));
    case "segmento":
      return opcoes.segmentos.map((s) => ({ valor: s.id, rotulo: s.nome }));
    case "campo":
      return [
        ...CAMPOS_DO_CONTEXTO[objeto].filter((c) => c.caminho.startsWith("registro.")).map((c) => ({ valor: c.caminho, rotulo: c.rotulo })),
        ...opcoes.camposPersonalizados.filter((c) => c.objeto === (objeto === "deal" ? "deal" : "contact")).map((c) => ({ valor: `registro.custom_fields.${c.chave}`, rotulo: c.nome })),
      ];
    case "campo_data":
      return camposDeData(objeto, opcoes).map((c) => ({ valor: c.caminho, rotulo: c.rotulo }));
    default:
      return null;
  }
}

/** "Atualizar campos": lista de { campo, valor }. */
function CamposValores({ valor, mudar, objeto, opcoes, variaveis }: { valor: unknown; mudar: (v: unknown) => void; objeto: Objeto; opcoes: Opcoes; variaveis: VariavelDisponivel[] }) {
  const lista = Array.isArray(valor) ? (valor as { campo?: string; valor?: string }[]) : [];
  const campos = opcoesDoTipo({ chave: "", rotulo: "", tipo: "campo" }, objeto, opcoes, {}) ?? [];
  return (
    <div className="flex flex-col gap-2">
      {lista.map((item, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <Select className="w-40 shrink-0" value={item.campo ?? ""} onChange={(e) => mudar(lista.map((x, j) => (j === i ? { ...x, campo: e.target.value } : x)))}>
            <option value="">Campo...</option>
            {campos.map((c) => (
              <option key={c.valor} value={c.valor}>{c.rotulo}</option>
            ))}
          </Select>
          <Input value={item.valor ?? ""} placeholder="Novo valor (vazio limpa)" onChange={(e) => mudar(lista.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))} />
          <InserirVariavel variaveis={variaveis} inserir={(v) => mudar(lista.map((x, j) => (j === i ? { ...x, valor: `${x.valor ?? ""}${v}` } : x)))} />
          <IconButton aria-label="Remover campo" size="sm" type="button" onClick={() => mudar(lista.filter((_, j) => j !== i))}>
            <Trash2 size={13} />
          </IconButton>
        </div>
      ))}
      <div>
        <Button type="button" size="sm" variant="ghost" onClick={() => mudar([...lista, { campo: "", valor: "" }])}>
          <Plus size={13} /> Campo
        </Button>
      </div>
    </div>
  );
}

export function FormularioDoCatalogo({
  campos,
  config,
  mudar,
  objeto,
  opcoes,
  variaveis,
}: {
  campos: CampoDeConfig[];
  config: Record<string, unknown>;
  mudar: (config: Record<string, unknown>) => void;
  objeto: Objeto;
  opcoes: Opcoes;
  variaveis: VariavelDisponivel[];
}) {
  const por = (chave: string, v: unknown) => mudar({ ...config, [chave]: v });
  const visiveis = camposVisiveis(campos, config);
  if (!visiveis.length) return <p className="text-small text-text-tertiary">Nada para configurar aqui.</p>;
  return (
    <div className="flex flex-col gap-3.5">
      {visiveis.map((c) => {
        const id = `campo-${c.chave}`;
        const valor = config[c.chave] ?? c.padrao ?? "";
        const rotulo = (
          <Label htmlFor={id} className="flex items-center gap-1">
            {c.rotulo}
            {c.obrigatorio && <span className="text-danger">*</span>}
          </Label>
        );
        const ajuda = c.ajuda ? <p className="mt-1 text-caption text-text-tertiary">{c.ajuda}</p> : null;

        if (c.tipo === "booleano") {
          return (
            <div key={c.chave} className="flex items-center justify-between gap-3">
              <div>
                <Label htmlFor={id}>{c.rotulo}</Label>
                {ajuda}
              </div>
              <Switch id={id} checked={valor === true} onCheckedChange={(v) => por(c.chave, v)} />
            </div>
          );
        }
        if (c.tipo === "campos_valores") {
          return (
            <div key={c.chave}>
              {rotulo}
              <CamposValores valor={config[c.chave]} mudar={(v) => por(c.chave, v)} objeto={objeto} opcoes={opcoes} variaveis={variaveis} />
            </div>
          );
        }
        if (c.tipo === "usuarios") {
          const sel = Array.isArray(config[c.chave]) ? (config[c.chave] as string[]) : [];
          return (
            <div key={c.chave}>
              {rotulo}
              <div className="flex flex-col gap-1 rounded-[14px] bg-raised p-2.5">
                {opcoes.usuarios.length === 0 && <p className="text-caption text-text-tertiary">Carregando pessoas...</p>}
                {opcoes.usuarios.map((u) => (
                  <label key={u.id} className="flex items-center gap-2 text-small text-text-secondary">
                    <input type="checkbox" checked={sel.includes(u.id)} onChange={(e) => por(c.chave, e.target.checked ? [...sel, u.id] : sel.filter((x) => x !== u.id))} />
                    {u.nome}
                  </label>
                ))}
              </div>
              {ajuda}
            </div>
          );
        }
        const lista = opcoesDoTipo(c, objeto, opcoes, config);
        if (lista) {
          return (
            <div key={c.chave}>
              {rotulo}
              <Select id={id} value={String(valor ?? "")} onChange={(e) => por(c.chave, e.target.value)}>
                {c.tipo !== "lista" && <option value="">{c.obrigatorio ? "Escolha..." : "Qualquer / nenhum"}</option>}
                {lista.map((o) => (
                  <option key={o.valor} value={o.valor}>{o.rotulo}</option>
                ))}
              </Select>
              {ajuda}
            </div>
          );
        }
        const texto = c.tipo === "texto_longo" || c.tipo === "json";
        return (
          <div key={c.chave}>
            <div className="flex items-end justify-between">
              {rotulo}
              {c.tipo !== "numero" && <InserirVariavel variaveis={variaveis} inserir={(v) => por(c.chave, `${String(config[c.chave] ?? "")}${v}`)} />}
            </div>
            {texto ? (
              <Textarea id={id} rows={c.tipo === "json" ? 3 : 4} className={c.tipo === "json" ? "font-mono text-caption" : undefined} value={String(valor ?? "")} onChange={(e) => por(c.chave, e.target.value)} />
            ) : (
              <Input
                id={id}
                type={c.tipo === "numero" ? "number" : "text"}
                value={String(valor ?? "")}
                placeholder={c.tipo === "url" ? "https://..." : undefined}
                onChange={(e) => por(c.chave, c.tipo === "numero" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)}
              />
            )}
            {ajuda}
          </div>
        );
      })}
    </div>
  );
}
