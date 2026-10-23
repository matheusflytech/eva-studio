"use client";

import * as React from "react";
import { Loader2, Plus, Trash2, Upload, Braces, Reply, ExternalLink, Phone } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { focusRing } from "@/components/ui/styles";
import { Modal, ModalContent } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PreviaWhatsApp } from "@/components/whatsapp/previa-whatsapp";
import {
  CATEGORIAS,
  LIMITES,
  formularioVazio,
  normalizarVariaveis,
  previaTemplate,
  validarTemplate,
  type BotaoTemplate,
  type CampoDoTemplate,
  type FormatoHeader,
  type FormularioTemplate,
} from "@/lib/whatsapp/template-meta";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Criar template na Meta, com prévia ao vivo.
//
// As regras de validação são as mesmas que a rota roda antes de chamar a
// Graph (src/lib/whatsapp/template-meta.ts): o que esta tela aceita é o que
// vai pra Meta. A revisão da Meta leva de minutos a 24h; o status aparece na
// lista de Aprovações quando o webhook avisar.
// ---------------------------------------------------------------------------

const IDIOMAS = [
  { valor: "pt_BR", rotulo: "Português (Brasil)" },
  { valor: "en_US", rotulo: "Inglês (EUA)" },
  { valor: "es", rotulo: "Espanhol" },
  { valor: "es_MX", rotulo: "Espanhol (México)" },
];

const FORMATOS: { valor: FormatoHeader; rotulo: string }[] = [
  { valor: "NONE", rotulo: "Sem cabeçalho" },
  { valor: "TEXT", rotulo: "Texto" },
  { valor: "IMAGE", rotulo: "Imagem" },
  { valor: "VIDEO", rotulo: "Vídeo" },
  { valor: "DOCUMENT", rotulo: "Documento" },
];

const ACEITA: Partial<Record<FormatoHeader, string>> = {
  IMAGE: "image/jpeg,image/png",
  VIDEO: "video/mp4",
  DOCUMENT: "application/pdf",
};

const CAMPOS_DO_CONTATO = [
  { valor: "", rotulo: "Escolher campo..." },
  { valor: "nome", rotulo: "Nome do contato" },
  { valor: "email", rotulo: "E-mail" },
  { valor: "telefone", rotulo: "Telefone" },
];

/** "Lembrete de consulta" → "lembrete_de_consulta". */
function snake(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 512);
}

function Contador({ atual, max }: { atual: number; max: number }) {
  return (
    <span className={cn("font-mono text-caption tabular-nums", atual > max ? "text-danger" : "text-text-tertiary")}>
      {atual}/{max}
    </span>
  );
}

function Erros({ erros, campo }: { erros: { campo: CampoDoTemplate; mensagem: string }[]; campo: CampoDoTemplate }) {
  const meus = erros.filter((e) => e.campo === campo);
  if (meus.length === 0) return null;
  return (
    <ul className="mt-1.5 flex flex-col gap-0.5">
      {meus.map((e, i) => (
        <li key={i} className="text-caption text-danger">{e.mensagem}</li>
      ))}
    </ul>
  );
}

export function CriarTemplate({
  agentId,
  aberto,
  onFechar,
  onCriado,
}: {
  agentId: string;
  aberto: boolean;
  onFechar: () => void;
  onCriado: (nome: string) => void;
}) {
  const [titulo, setTitulo] = React.useState("");
  const [f, setF] = React.useState<FormularioTemplate>(formularioVazio);
  const [nomeEditado, setNomeEditado] = React.useState(false);
  const [mostrarErros, setMostrarErros] = React.useState(false);
  const [subindo, setSubindo] = React.useState(false);
  const [enviando, setEnviando] = React.useState(false);
  const [erroGeral, setErroGeral] = React.useState<string | null>(null);
  const corpoRef = React.useRef<HTMLTextAreaElement>(null);

  const mudar = (patch: Partial<FormularioTemplate>) => setF((x) => ({ ...x, ...patch }));
  const auth = f.categoria === "AUTHENTICATION";

  const erros = validarTemplate(f);
  const errosVisiveis = mostrarErros ? erros : erros.filter((e) => e.campo !== "nome" && e.campo !== "corpo" && e.campo !== "exemplos");
  const previa = previaTemplate(f);
  const variaveis = normalizarVariaveis(f.corpo).chaves;
  const tamanhoCorpo = normalizarVariaveis(f.corpo).texto.length;
  const tamanhoHeader = normalizarVariaveis(f.header.texto ?? "").texto.length;

  function limpar() {
    setTitulo("");
    setF(formularioVazio());
    setNomeEditado(false);
    setMostrarErros(false);
    setErroGeral(null);
  }

  function inserirVariavel() {
    const n = variaveis.filter((c) => /^\d+$/.test(c)).length + 1;
    let livre = n;
    while (variaveis.includes(String(livre))) livre++;
    const marca = `{{${livre}}}`;
    const el = corpoRef.current;
    const ini = el?.selectionStart ?? f.corpo.length;
    const fim = el?.selectionEnd ?? f.corpo.length;
    mudar({ corpo: f.corpo.slice(0, ini) + marca + f.corpo.slice(fim) });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(ini + marca.length, ini + marca.length);
    });
  }

  function mudarBotao(i: number, patch: Partial<BotaoTemplate>) {
    mudar({ botoes: f.botoes.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
  }

  async function subirExemplo(file: File) {
    setSubindo(true);
    setErroGeral(null);
    try {
      const form = new FormData();
      form.append("arquivo", file);
      const res = await fetch(`/api/agents/${agentId}/meta-templates/midia`, { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Não foi possível enviar o arquivo.");
      mudar({ header: { ...f.header, handle: data.handle, nomeArquivo: data.nome } });
    } catch (e) {
      setErroGeral(e instanceof Error ? e.message : "Não foi possível enviar o arquivo.");
    } finally {
      setSubindo(false);
    }
  }

  async function enviar() {
    setMostrarErros(true);
    setErroGeral(null);
    if (erros.length > 0) return;
    setEnviando(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/meta-templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, titulo }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "A Meta não aceitou o template.");
      onCriado(f.nome);
      limpar();
    } catch (e) {
      setErroGeral(e instanceof Error ? e.message : "A Meta não aceitou o template.");
    } finally {
      setEnviando(false);
    }
  }

  const conta = (t: BotaoTemplate["tipo"]) => f.botoes.filter((b) => b.tipo === t).length;
  const podeAdicionar = (t: BotaoTemplate["tipo"]) =>
    f.botoes.length < LIMITES.botoes &&
    (t === "QUICK_REPLY" ? conta(t) < LIMITES.respostasRapidas : t === "URL" ? conta(t) < LIMITES.urls : conta(t) < LIMITES.telefones);

  return (
    <Modal open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <ModalContent
        title="Novo template na Meta"
        description="A Meta revisa em minutos ou até 24h. O status aparece aqui em Aprovações quando ela responder."
        className="max-h-[92vh] max-w-5xl overflow-y-auto"
      >
        <div className="grid gap-6 md:grid-cols-[1fr_340px]">
          <div className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="tpl-titulo">Nome para a equipe</Label>
                <Input
                  id="tpl-titulo"
                  value={titulo}
                  placeholder="Lembrete de consulta"
                  onChange={(e) => {
                    setTitulo(e.target.value);
                    if (!nomeEditado) mudar({ nome: snake(e.target.value) });
                  }}
                />
              </div>
              <div>
                <Label htmlFor="tpl-nome">Nome na Meta</Label>
                <Input
                  id="tpl-nome"
                  className="font-mono text-small"
                  value={f.nome}
                  placeholder="lembrete_consulta"
                  onChange={(e) => {
                    setNomeEditado(true);
                    mudar({ nome: e.target.value });
                  }}
                />
                <Erros erros={errosVisiveis} campo="nome" />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="tpl-categoria">Categoria</Label>
                <Select
                  id="tpl-categoria"
                  value={f.categoria}
                  onChange={(e) => mudar({ categoria: e.target.value as FormularioTemplate["categoria"] })}
                >
                  {CATEGORIAS.map((c) => <option key={c.valor} value={c.valor}>{c.rotulo}</option>)}
                </Select>
                <p className="mt-1 text-caption text-text-tertiary">
                  {CATEGORIAS.find((c) => c.valor === f.categoria)?.dica} A Meta pode reclassificar.
                </p>
              </div>
              <div>
                <Label htmlFor="tpl-idioma">Idioma</Label>
                <Select id="tpl-idioma" value={f.idioma} onChange={(e) => mudar({ idioma: e.target.value })}>
                  {IDIOMAS.map((i) => <option key={i.valor} value={i.valor}>{i.rotulo}</option>)}
                </Select>
                <Erros erros={errosVisiveis} campo="idioma" />
              </div>
            </div>

            {auth ? (
              <div className="rounded-[14px] bg-raised p-4">
                <p className="text-small text-text-secondary">
                  Template de autenticação tem texto fixo da Meta (código + aviso de segurança + botão de copiar).
                  Você só escolhe a validade do código.
                </p>
                <div className="mt-3 max-w-[200px]">
                  <Label htmlFor="tpl-validade">Validade do código (minutos)</Label>
                  <Input
                    id="tpl-validade"
                    type="number"
                    min={1}
                    max={90}
                    value={f.validadeCodigoMin ?? ""}
                    onChange={(e) => mudar({ validadeCodigoMin: e.target.value ? Number(e.target.value) : undefined })}
                  />
                  <Erros erros={errosVisiveis} campo="validadeCodigoMin" />
                </div>
              </div>
            ) : (
              <>
                {/* Cabeçalho */}
                <div>
                  <Label>Cabeçalho</Label>
                  {/* Escolha única em cápsulas: a ativa fica invertida, como no resto do app. */}
                  <div role="group" aria-label="Formato do cabeçalho" className="flex flex-wrap gap-1.5">
                    {FORMATOS.map((o) => (
                      <button
                        key={o.valor}
                        type="button"
                        aria-pressed={f.header.formato === o.valor}
                        onClick={() => mudar({ header: { formato: o.valor } })}
                        className={cn(
                          "h-7 rounded-full px-3 text-small transition-colors duration-120",
                          f.header.formato === o.valor
                            ? "bg-inverse font-medium text-inverse-fg"
                            : "bg-raised text-text-secondary ring-1 ring-border-subtle hover:bg-hover hover:text-text-primary",
                          focusRing
                        )}
                      >
                        {o.rotulo}
                      </button>
                    ))}
                  </div>
                  {f.header.formato === "TEXT" && (
                    <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_180px]">
                      <div>
                        <Input
                          value={f.header.texto ?? ""}
                          placeholder="Seu pedido chegou, {{1}}"
                          onChange={(e) => mudar({ header: { ...f.header, texto: e.target.value } })}
                        />
                        <div className="mt-1 flex justify-end"><Contador atual={tamanhoHeader} max={LIMITES.header} /></div>
                      </div>
                      {normalizarVariaveis(f.header.texto ?? "").chaves.length > 0 && (
                        <Input
                          value={f.header.exemplo ?? ""}
                          placeholder="Exemplo da variável"
                          onChange={(e) => mudar({ header: { ...f.header, exemplo: e.target.value } })}
                        />
                      )}
                    </div>
                  )}
                  {f.header.formato !== "NONE" && f.header.formato !== "TEXT" && (
                    <label className="mt-2 inline-flex cursor-pointer items-center gap-2 rounded-[14px] bg-raised px-3.5 py-2.5 text-small text-text-secondary ring-1 ring-border-subtle transition-colors hover:bg-hover focus-within:ring-border-strong">
                      {subindo ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                      {f.header.handle ? `Exemplo enviado: ${f.header.nomeArquivo ?? "arquivo"}` : "Enviar arquivo de exemplo (até 4 MB)"}
                      <input
                        type="file"
                        className="hidden"
                        accept={ACEITA[f.header.formato]}
                        disabled={subindo}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = "";
                          if (file) void subirExemplo(file);
                        }}
                      />
                    </label>
                  )}
                  <Erros erros={errosVisiveis} campo="header" />
                </div>

                {/* Corpo */}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <Label htmlFor="tpl-corpo" className="mb-0">Mensagem</Label>
                    <div className="flex items-center gap-3">
                      <Button type="button" variant="secondary" size="sm" onClick={inserirVariavel}>
                        <Braces size={12} aria-hidden /> Variável
                      </Button>
                      <Contador atual={tamanhoCorpo} max={LIMITES.corpo} />
                    </div>
                  </div>
                  <Textarea
                    id="tpl-corpo"
                    ref={corpoRef}
                    rows={6}
                    value={f.corpo}
                    placeholder={"Oi {nome}, sua consulta está marcada para {{2}}.\nResponda 1 para confirmar."}
                    onChange={(e) => mudar({ corpo: e.target.value })}
                  />
                  <p className="mt-1 text-caption text-text-tertiary">
                    Variáveis: {"{{1}}"}, {"{{2}}"}... ou pelo nome, como {"{nome}"}. *negrito*, _itálico_, ~riscado~.
                  </p>
                  <Erros erros={errosVisiveis} campo="corpo" />
                </div>

                {variaveis.length > 0 && (
                  <div className="rounded-[14px] bg-raised p-4">
                    <p className="mb-2 text-small font-medium text-text-secondary">
                      Exemplos das variáveis <span className="font-normal text-text-tertiary">(a Meta exige para revisar)</span>
                    </p>
                    <div className="flex flex-col gap-2">
                      {variaveis.map((chave, i) => {
                        const numerica = /^\d+$/.test(chave);
                        return (
                          <div key={chave} className="grid items-center gap-2 sm:grid-cols-[90px_1fr_170px]">
                            <span className="font-mono text-caption text-text-tertiary">
                              {`{{${i + 1}}}`}{numerica ? "" : ` ${chave}`}
                            </span>
                            <Input
                              value={f.exemplos[chave] ?? ""}
                              placeholder="Exemplo"
                              onChange={(e) => mudar({ exemplos: { ...f.exemplos, [chave]: e.target.value } })}
                            />
                            {numerica ? (
                              <Select
                                value={f.mapa?.[chave] ?? ""}
                                onChange={(e) => mudar({ mapa: { ...f.mapa, [chave]: e.target.value } })}
                                title="De onde vem o valor no envio"
                              >
                                {CAMPOS_DO_CONTATO.map((c) => <option key={c.valor} value={c.valor}>{c.rotulo}</option>)}
                              </Select>
                            ) : (
                              <span className="text-caption text-text-tertiary">preenche com {`{${chave}}`}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <Erros erros={errosVisiveis} campo="exemplos" />
                  </div>
                )}

                {/* Rodapé */}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <Label htmlFor="tpl-rodape" className="mb-0">Rodapé <span className="font-normal text-text-tertiary">(opcional)</span></Label>
                    <Contador atual={(f.rodape ?? "").length} max={LIMITES.rodape} />
                  </div>
                  <Input
                    id="tpl-rodape"
                    value={f.rodape ?? ""}
                    placeholder="Responda SAIR para não receber mais"
                    onChange={(e) => mudar({ rodape: e.target.value })}
                  />
                  <Erros erros={errosVisiveis} campo="rodape" />
                </div>

                {/* Botões */}
                <div>
                  <Label>Botões <span className="font-normal text-text-tertiary">(até 10: respostas rápidas, 2 links, 1 telefone)</span></Label>
                  <div className="flex flex-col gap-2">
                    {f.botoes.map((b, i) => (
                      <div key={i} className="flex flex-col gap-2 rounded-[14px] bg-raised p-3">
                        <div className="flex items-center gap-2">
                          <span className="w-[110px] shrink-0 text-caption text-text-tertiary">
                            {b.tipo === "QUICK_REPLY" ? "Resposta rápida" : b.tipo === "URL" ? "Link" : "Ligar"}
                          </span>
                          <Input value={b.texto} placeholder="Texto do botão" onChange={(e) => mudarBotao(i, { texto: e.target.value })} />
                          <Contador atual={b.texto.length} max={LIMITES.textoBotao} />
                          <IconButton
                            aria-label="Remover botão"
                            size="sm"
                            onClick={() => mudar({ botoes: f.botoes.filter((_, j) => j !== i) })}
                            className="shrink-0 hover:bg-danger-subtle hover:text-danger"
                          >
                            <Trash2 aria-hidden />
                          </IconButton>
                        </div>
                        {b.tipo === "URL" && (
                          <div className="grid gap-2 sm:grid-cols-2">
                            <Input value={b.url ?? ""} placeholder="https://loja.com/pedido/{{1}}" onChange={(e) => mudarBotao(i, { url: e.target.value })} />
                            {normalizarVariaveis(b.url ?? "").chaves.length > 0 && (
                              <Input value={b.exemploUrl ?? ""} placeholder="https://loja.com/pedido/123" onChange={(e) => mudarBotao(i, { exemploUrl: e.target.value })} />
                            )}
                          </div>
                        )}
                        {b.tipo === "PHONE_NUMBER" && (
                          <Input value={b.telefone ?? ""} placeholder="+55 11 99999-8888" onChange={(e) => mudarBotao(i, { telefone: e.target.value })} />
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {([
                      { tipo: "QUICK_REPLY", rotulo: "Resposta rápida", icone: Reply },
                      { tipo: "URL", rotulo: "Link", icone: ExternalLink },
                      { tipo: "PHONE_NUMBER", rotulo: "Ligar", icone: Phone },
                    ] as const).map((o) => (
                      <Button
                        key={o.tipo}
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={!podeAdicionar(o.tipo)}
                        onClick={() => mudar({ botoes: [...f.botoes, { tipo: o.tipo, texto: "" }] })}
                      >
                        <Plus size={12} aria-hidden /> <o.icone size={12} aria-hidden /> {o.rotulo}
                      </Button>
                    ))}
                  </div>
                  <Erros erros={errosVisiveis} campo="botoes" />
                </div>
              </>
            )}
          </div>

          <div className="flex flex-col gap-3 md:sticky md:top-0 md:self-start">
            <p className="font-mono text-caption uppercase tracking-wider text-text-tertiary">Prévia</p>
            <PreviaWhatsApp previa={previa} />
            {erroGeral && <p className="text-small text-danger">{erroGeral}</p>}
            {mostrarErros && erros.length > 0 && (
              <p className="text-caption text-danger">
                {erros.length === 1 ? "Falta corrigir 1 ponto." : `Faltam corrigir ${erros.length} pontos.`}
              </p>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={onFechar}>Cancelar</Button>
              <Button type="button" variant="primary" className="flex-1" loading={enviando} disabled={subindo} onClick={enviar}>
                Enviar para aprovação
              </Button>
            </div>
          </div>
        </div>
      </ModalContent>
    </Modal>
  );
}
