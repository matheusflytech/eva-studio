"use client";

import * as React from "react";
import { Bold, Braces, Link2, List, MousePointerClick, Plus, Send, Trash2 } from "lucide-react";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { montarEmail } from "@/lib/email/montar";
import { VARIAVEIS_DO_CONTATO } from "@/lib/email/variaveis";
import type { ModoDoCorpo } from "@/lib/email/editor";
import { cn } from "@/lib/utils";

interface Modelo {
  id: string;
  nome: string;
  assunto: string;
  modo: ModoDoCorpo;
  corpo: string;
  updatedAt: string;
}

type Rascunho = Omit<Modelo, "id" | "updatedAt"> & { id: string | null };

const NOVO: Rascunho = {
  id: null,
  nome: "Novo modelo",
  assunto: "Olá, {{contato.primeiro_nome|padrao:\"tudo bem\"}}",
  modo: "simples",
  corpo: "Oi {{contato.primeiro_nome|padrao:\"\"}},\n\nEscreva aqui a mensagem. **Negrito** e [links](https://exemplo.com) funcionam.\n\n[[Falar com a gente|https://exemplo.com]]",
};

// Dados de exemplo da prévia: é o que a pessoa vê antes de mandar o teste.
const EXEMPLO = {
  contato: { nome: "Ana Souza", email: "ana@exemplo.com", telefone: "+55 11 99999-0000", cargo: "Gerente" },
  empresa: { nome: "Clínica Aurora" },
  campos: {},
};

// ---------------------------------------------------------------------------
// Biblioteca → Modelos de e-mail. Editor simples (negrito, link, lista,
// botão, variáveis por clique) ou HTML avançado, com prévia do e-mail como
// ele sai (mesma montagem do envio) e "Enviar teste para mim".
// ---------------------------------------------------------------------------
export function ModelosDeEmail() {
  const [modelos, setModelos] = React.useState<Modelo[] | null>(null);
  const [disponivel, setDisponivel] = React.useState(true);
  const [atual, setAtual] = React.useState<Rascunho>(NOVO);
  const [sujo, setSujo] = React.useState(false);
  const [ocupado, setOcupado] = React.useState(false);
  const [msg, setMsg] = React.useState<{ tom: "info" | "danger"; texto: string } | null>(null);
  const corpoRef = React.useRef<HTMLTextAreaElement>(null);
  const [versao, setVersao] = React.useState(0);

  React.useEffect(() => {
    let vivo = true;
    void fetch("/api/email/modelos")
      .then((r) => r.json())
      .catch(() => ({ disponivel: false, modelos: [] }))
      .then((d) => {
        if (!vivo) return;
        setDisponivel(d.disponivel !== false);
        setModelos(d.modelos ?? []);
      });
    return () => {
      vivo = false;
    };
  }, [versao]);

  const previa = React.useMemo(
    () => montarEmail(atual, EXEMPLO, { remetente: "Sua empresa", linkDeDescadastro: "https://exemplo.com/descadastro" }),
    [atual]
  );

  function mudar(p: Partial<Rascunho>) {
    setAtual((a) => ({ ...a, ...p }));
    setSujo(true);
    setMsg(null);
  }

  function abrir(m: Modelo | null) {
    if (sujo && !confirm("Descartar as mudanças que não foram salvas?")) return;
    setAtual(m ? { id: m.id, nome: m.nome, assunto: m.assunto, modo: m.modo === "html" ? "html" : "simples", corpo: m.corpo } : NOVO);
    setSujo(false);
    setMsg(null);
  }

  /** Insere no cursor do corpo (ou envolve a seleção). */
  function inserir(antes: string, depois = "", exemplo = "") {
    const el = corpoRef.current;
    if (!el) return;
    const { selectionStart: i, selectionEnd: f, value } = el;
    const meio = value.slice(i, f) || exemplo;
    mudar({ corpo: value.slice(0, i) + antes + meio + depois + value.slice(f) });
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(i + antes.length, i + antes.length + meio.length);
    });
  }

  async function salvar() {
    setOcupado(true);
    setMsg(null);
    const res = await fetch(atual.id ? `/api/email/modelos/${atual.id}` : "/api/email/modelos", {
      method: atual.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(atual),
    });
    const data = await res.json().catch(() => ({}));
    setOcupado(false);
    if (!res.ok) return setMsg({ tom: "danger", texto: data.error ?? "Não deu para salvar." });
    setAtual((a) => ({ ...a, id: data.modelo?.id ?? a.id }));
    setSujo(false);
    setMsg({ tom: "info", texto: "Modelo salvo." });
    setVersao((v) => v + 1);
  }

  async function excluir() {
    if (!atual.id || !confirm(`Excluir o modelo "${atual.nome}"?`)) return;
    await fetch(`/api/email/modelos/${atual.id}`, { method: "DELETE" });
    setAtual(NOVO);
    setSujo(false);
    setVersao((v) => v + 1);
  }

  async function testar() {
    setOcupado(true);
    setMsg(null);
    const res = await fetch("/api/email/teste", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assunto: atual.assunto, corpo: atual.corpo, modo: atual.modo }),
    });
    const data = await res.json().catch(() => ({}));
    setOcupado(false);
    setMsg(res.ok ? { tom: "info", texto: `Teste enviado para ${data.para}.` } : { tom: "danger", texto: data.error ?? "Não deu para enviar o teste." });
  }

  if (!disponivel) {
    return <Notice tone="warning">O e-mail ainda não foi ativado no banco deste ambiente: os modelos aparecem aqui depois disso.</Notice>;
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="glass-card flex flex-col gap-1 rounded-2xl p-2">
        <Button type="button" variant="secondary" size="sm" className="mb-1 justify-start" onClick={() => abrir(null)}>
          <Plus size={14} /> Novo modelo
        </Button>
        {modelos === null ? (
          <p className="px-2 py-1 text-[12.5px] text-text-tertiary">Carregando...</p>
        ) : modelos.length === 0 ? (
          <p className="px-2 py-1 text-[12.5px] text-text-tertiary">Nenhum modelo ainda.</p>
        ) : (
          modelos.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => abrir(m)}
              className={cn("rounded-lg px-2.5 py-2 text-left hover:bg-hover", atual.id === m.id && "bg-accent-subtle")}
            >
              <span className="block truncate text-[13px] font-medium text-text-primary">{m.nome}</span>
              <span className="block truncate text-[11.5px] text-text-tertiary">{m.assunto || "Sem assunto"}</span>
            </button>
          ))
        )}
      </aside>

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <section className="glass-card flex flex-col gap-3 rounded-2xl p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="em-nome">Nome do modelo</Label>
              <Input id="em-nome" value={atual.nome} onChange={(e) => mudar({ nome: e.target.value })} />
            </div>
            <div>
              <Label>Como escrever</Label>
              <SegmentedControl<ModoDoCorpo>
                label="Modo do corpo"
                value={atual.modo}
                onChange={(modo) => mudar({ modo })}
                options={[
                  { value: "simples", label: "Editor simples" },
                  { value: "html", label: "HTML" },
                ]}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="em-assunto">Assunto</Label>
            <Input id="em-assunto" value={atual.assunto} onChange={(e) => mudar({ assunto: e.target.value })} />
          </div>
          <div>
            <div className="mb-1 flex flex-wrap items-center gap-1">
              <Label htmlFor="em-corpo" className="mb-0 mr-auto">Corpo</Label>
              {atual.modo === "simples" && (
                <>
                  <Button type="button" variant="ghost" size="sm" onClick={() => inserir("**", "**", "texto")} aria-label="Negrito"><Bold size={14} /></Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => inserir("[", "](https://)", "texto do link")} aria-label="Link"><Link2 size={14} /></Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => inserir("\n- ", "", "item")} aria-label="Lista"><List size={14} /></Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => inserir("\n\n[[", "|https://]]\n\n", "Texto do botão")} aria-label="Botão"><MousePointerClick size={14} /></Button>
                </>
              )}
              <span className="inline-flex items-center gap-1">
                <Braces size={14} className="text-text-tertiary" aria-hidden />
                <Select aria-label="Inserir variável" value="" onChange={(e) => e.target.value && inserir(`{{${e.target.value}}}`)} className="h-7 w-auto text-[12px]">
                  <option value="">Variável…</option>
                  {VARIAVEIS_DO_CONTATO.map((v) => (
                    <option key={v.chave} value={v.chave}>{v.rotulo}</option>
                  ))}
                </Select>
              </span>
            </div>
            <Textarea
              id="em-corpo"
              ref={corpoRef}
              rows={14}
              value={atual.corpo}
              onChange={(e) => mudar({ corpo: e.target.value })}
              className={atual.modo === "html" ? "font-mono text-[12px]" : undefined}
            />
            <p className="mt-1 text-[11px] text-text-tertiary">
              Variável vazia sem padrão bloqueia o envio. Para ter padrão: {"{{contato.primeiro_nome|padrao:\"cliente\"}}"}. Campo
              personalizado: {"{{campo.chave}}"}. O rodapé com &quot;Não quero mais receber&quot; entra sempre.
            </p>
          </div>
          {msg && <Notice tone={msg.tom}>{msg.texto}</Notice>}
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={ocupado || !sujo} onClick={() => void salvar()}>Salvar</Button>
            <Button type="button" variant="secondary" disabled={ocupado} onClick={() => void testar()}>
              <Send size={14} /> Enviar teste para mim
            </Button>
            {atual.id && (
              <Button type="button" variant="ghost" className="ml-auto text-danger hover:text-danger" onClick={() => void excluir()}>
                <Trash2 size={14} /> Excluir
              </Button>
            )}
          </div>
        </section>

        <section className="glass-card flex flex-col gap-2 rounded-2xl p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">Prévia com dados de exemplo</p>
          <p className="text-[13px] text-text-primary"><span className="text-text-tertiary">Assunto:</span> {previa.assunto || "—"}</p>
          {previa.faltando.length > 0 && (
            <Notice tone="warning">Sem padrão e vazio no exemplo: {previa.faltando.join(", ")}. Num contato sem esse dado, o envio é bloqueado.</Notice>
          )}
          {/* sandbox vazio: HTML do cliente nunca roda script dentro do app. */}
          <iframe title="Prévia do e-mail" sandbox="" srcDoc={previa.html} className="h-[520px] w-full rounded-xl border border-border-subtle bg-white" />
        </section>
      </div>
    </div>
  );
}
