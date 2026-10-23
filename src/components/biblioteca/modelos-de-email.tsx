"use client";

import * as React from "react";
import { Bold, Braces, Link2, List, MousePointerClick, Plus, Send, Trash2 } from "lucide-react";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
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
export function ModelosDeEmail({ aoContar }: { aoContar?: (n: number) => void } = {}) {
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
        aoContar?.((d.modelos ?? []).length);
      });
    return () => {
      vivo = false;
    };
    // aoContar só informa a aba; recarregar quando ele muda não faz sentido.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    <div className="grid items-start gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      {/* Lista colada em linhas finas: nome e assunto; o escolhido fica em bg-raised. */}
      <aside className="flex flex-col">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="font-mono text-caption text-text-tertiary">{modelos ? `${modelos.length} ${modelos.length === 1 ? "modelo" : "modelos"}` : "—"}</p>
          <Button type="button" variant="secondary" size="sm" onClick={() => abrir(null)}>
            <Plus size={13} aria-hidden="true" /> Novo modelo
          </Button>
        </div>
        {modelos === null ? (
          <div className="flex flex-col gap-1.5" aria-busy="true" aria-label="Carregando modelos">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-[14px] bg-raised motion-reduce:animate-none" />
            ))}
          </div>
        ) : modelos.length === 0 ? (
          <p className="py-2 text-small text-text-tertiary">Nenhum modelo ainda.</p>
        ) : (
          <ul className="flex flex-col">
            {modelos.map((m) => (
              <li key={m.id} className="border-b border-border-subtle last:border-b-0">
                <button
                  type="button"
                  onClick={() => abrir(m)}
                  aria-current={atual.id === m.id ? "true" : undefined}
                  className={cn("flex min-h-[52px] w-full flex-col justify-center rounded-[10px] px-2.5 py-2 text-left hover:bg-raised", atual.id === m.id && "bg-raised")}
                >
                  <span className="block truncate text-body font-medium text-text-primary">{m.nome}</span>
                  <span className="block truncate text-caption text-text-tertiary">{m.assunto || "Sem assunto"}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-2">
        <section className="flex min-w-0 flex-col gap-3 rounded-[18px] border border-border-subtle bg-panel p-4">
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
                  <IconButton size="sm" tooltip onClick={() => inserir("**", "**", "texto")} aria-label="Negrito"><Bold /></IconButton>
                  <IconButton size="sm" tooltip onClick={() => inserir("[", "](https://)", "texto do link")} aria-label="Link"><Link2 /></IconButton>
                  <IconButton size="sm" tooltip onClick={() => inserir("\n- ", "", "item")} aria-label="Lista"><List /></IconButton>
                  <IconButton size="sm" tooltip onClick={() => inserir("\n\n[[", "|https://]]\n\n", "Texto do botão")} aria-label="Botão"><MousePointerClick /></IconButton>
                </>
              )}
              <span className="inline-flex items-center gap-1">
                <Braces size={14} className="text-text-tertiary" aria-hidden />
                <Select aria-label="Inserir variável" value="" onChange={(e) => e.target.value && inserir(`{{${e.target.value}}}`)} className="h-7 w-auto text-caption">
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
              className={atual.modo === "html" ? "font-mono text-caption" : undefined}
            />
            <p className="mt-1 text-caption text-text-tertiary">
              Variável vazia sem padrão bloqueia o envio. Para ter padrão: {"{{contato.primeiro_nome|padrao:\"cliente\"}}"}. Campo
              personalizado: {"{{campo.chave}}"}. O rodapé com &quot;Não quero mais receber&quot; entra sempre.
            </p>
          </div>
          {msg && <Notice tone={msg.tom}>{msg.texto}</Notice>}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="primary" disabled={ocupado || !sujo} onClick={() => void salvar()}>Salvar</Button>
            <Button type="button" variant="secondary" disabled={ocupado} onClick={() => void testar()}>
              <Send size={14} aria-hidden="true" /> Enviar teste para mim
            </Button>
            {atual.id && (
              <Button type="button" variant="ghost" className="ml-auto text-danger hover:text-danger" onClick={() => void excluir()}>
                <Trash2 size={14} aria-hidden="true" /> Excluir
              </Button>
            )}
          </div>
        </section>

        <section className="flex min-w-0 flex-col gap-2 rounded-[18px] border border-border-subtle bg-panel p-4">
          <p className="font-mono text-caption text-text-tertiary">Prévia com dados de exemplo</p>
          <p className="text-small text-text-primary"><span className="text-text-tertiary">Assunto:</span> {previa.assunto || "—"}</p>
          {previa.faltando.length > 0 && (
            <Notice tone="warning">Sem padrão e vazio no exemplo: {previa.faltando.join(", ")}. Num contato sem esse dado, o envio é bloqueado.</Notice>
          )}
          {/* sandbox vazio: HTML do cliente nunca roda script dentro do app. Fundo branco de propósito: é o e-mail como chega. */}
          <iframe title="Prévia do e-mail" sandbox="" srcDoc={previa.html} className="h-[520px] w-full rounded-[14px] border border-border-subtle bg-white" />
        </section>
      </div>
    </div>
  );
}
