"use client";

import * as React from "react";
import { CalendarClock, ChevronDown, ChevronRight, Ellipsis, MessagesSquare, Play, Sunrise, UserPlus, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { pulsar } from "@/lib/fundo/eventos";
import { textoDeMinutos, textoDoPrazo } from "@/lib/tarefas/formato";
import { rotuloDoTipo } from "@/lib/tarefas/tipos";
import type { FonteDoItem } from "@/lib/tarefas/meu-dia";
import type { ItemDoDiaDaTela, MeuDiaDaTela } from "@/lib/tarefas/tela";
import { AcaoRapida, BotaoConcluir, IconeDoTipo, RotuloDaOrigem, TituloDeGrupo, acoesDaLinha, linhaDeLista, type Moldura } from "./pecas";
import { MenuDeAdiar, pedirAdiamento } from "./adiar";
import { useConcluirTarefa } from "./concluir";
import { FilaDeTrabalho } from "./fila";
import { ColunaDoDia } from "./coluna-do-dia";

// "Meu dia" — a home do vendedor (skill crm-tasks-agenda, §6). Em destaque só
// o que fazer agora; depois os compromissos com hora e uma fila curta, e o
// resto do dia (inclusive o que não cabe hoje) abre em "Mais N para hoje".
// A capacidade vira uma frase na sub-barra; filas por tipo e "adiar o que não
// cabe" moram no "…".

const FONTE: Record<Exclude<FonteDoItem, "tarefa">, { rotulo: string; icone: LucideIcon }> = {
  responder: { rotulo: "Responder", icone: MessagesSquare },
  primeiro_contato: { rotulo: "Lead novo", icone: UserPlus },
  proximo_passo: { rotulo: "Sem próximo passo", icone: CalendarClock },
};

/** Quantas linhas de "Em seguida" aparecem antes do "Mais N para hoje". */
const EM_SEGUIDA = 5;

async function buscarDia(): Promise<{ ok: true; dia: MeuDiaDaTela } | { ok: false; erro: string }> {
  try {
    const res = await fetch("/api/tasks/meu-dia");
    const dados = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, dia: dados } : { ok: false, erro: dados.error ?? "Não foi possível montar o seu dia." };
  } catch {
    return { ok: false, erro: "Sem conexão." };
  }
}

type Concluir = (t: NonNullable<ItemDoDiaDaTela["tarefa"]>, el: HTMLElement) => void;

export function MeuDia({ versao, onMudou, moldura }: { versao: number; onMudou: () => void; moldura: Moldura }) {
  const toast = useToast();
  const [dia, setDia] = React.useState<MeuDiaDaTela | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const [fila, setFila] = React.useState<{ titulo: string; itens: ItemDoDiaDaTela[] } | null>(null);
  const [agora, setAgora] = React.useState(() => new Date());
  const [verTudo, setVerTudo] = React.useState(false);

  const aplicar = React.useCallback((r: { ok: true; dia: MeuDiaDaTela } | { ok: false; erro: string }) => {
    if (!r.ok) {
      setErro(r.erro);
      return;
    }
    setErro(null);
    setDia(r.dia);
    setAgora(new Date());
  }, []);

  const carregar = React.useCallback(() => buscarDia().then(aplicar), [aplicar]);

  React.useEffect(() => {
    let vivo = true;
    buscarDia().then((r) => vivo && aplicar(r));
    return () => {
      vivo = false;
    };
  }, [aplicar, versao]);

  const mudou = React.useCallback(() => {
    carregar();
    onMudou();
  }, [carregar, onMudou]);

  // Concluiu: o fundo pulsa a partir do círculo clicado.
  const origemDoPulso = React.useRef<HTMLElement | null>(null);
  const { abrir, dialogo } = useConcluirTarefa(() => {
    pulsar(origemDoPulso.current, 1.2);
    mudou();
  });
  const concluir: Concluir = (t, el) => {
    origemDoPulso.current = el;
    abrir(t);
  };

  const todos = React.useMemo(() => (dia ? [...dia.fixos, ...dia.agora, ...dia.provavelmenteAmanha] : []), [dia]);

  function abrirFila(titulo: string, ids: string[]) {
    const porId = new Map(todos.map((i) => [i.id, i]));
    const itens = ids.map((id) => porId.get(id)).filter((i): i is ItemDoDiaDaTela => !!i);
    if (itens.length) setFila({ titulo, itens });
  }

  async function adiarExcedente() {
    if (!dia) return;
    const tarefas = dia.provavelmenteAmanha.filter((i) => i.tarefa);
    let ok = 0;
    for (const i of tarefas) if ((await pedirAdiamento(i.tarefa!.id, { opcao: "amanha" })).ok) ok++;
    toast({ title: `${ok} ${ok === 1 ? "tarefa foi" : "tarefas foram"} para amanhã 9h`, tone: "success" });
    mudou();
  }

  const contagem = dia ? (
    <>
      {todos.length} hoje
      {dia.resumo.atrasadas > 0 && (
        <span className="text-danger">
          {" "}
          · {dia.resumo.atrasadas} {dia.resumo.atrasadas === 1 ? "atrasada" : "atrasadas"}
        </span>
      )}
    </>
  ) : null;

  if (fila) {
    return moldura({
      contagem,
      conteudo: (
        <FilaDeTrabalho
          titulo={fila.titulo}
          itens={fila.itens}
          onMudou={onMudou}
          onSair={() => {
            setFila(null);
            carregar();
          }}
        />
      ),
    });
  }

  if (erro) return moldura({ conteudo: <p role="alert" className="text-small text-danger">{erro}</p> });
  if (!dia) {
    return moldura({
      conteudo: (
        <div className="flex flex-col gap-2" aria-busy="true">
          <Skeleton className="h-[72px] rounded-[18px]" />
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-11 rounded-[14px]" />
          ))}
        </div>
      ),
    });
  }

  const vazio = todos.length === 0;
  const ordemDeTrabalho = [...dia.agora, ...dia.provavelmenteAmanha].map((i) => i.id);
  const tarefasQueNaoCabem = dia.provavelmenteAmanha.filter((i) => i.tarefa).length;
  const { livres, planejados, excedentes } = dia.capacidade;

  // Depois das 18h (ou num dia já estourado) tudo cai em "provavelmente
  // amanhã": aí a fila de trabalho é essa mesma, para a tela nunca ficar só
  // com o "Mais N".
  const semFolga = dia.agora.length === 0;
  const filaDeHoje = semFolga ? dia.provavelmenteAmanha : dia.agora;
  const amanha = semFolga ? [] : dia.provavelmenteAmanha;
  const [destaque, ...seguintes] = filaDeHoje;
  const visiveis = verTudo ? seguintes : seguintes.slice(0, EM_SEGUIDA);
  const escondidos = seguintes.length - visiveis.length + (verTudo ? 0 : amanha.length);

  const acoes = (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton aria-label="Mais: filas por tipo e adiar o que não cabe hoje" variant="secondary">
            <Ellipsis />
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>Trabalhar em fila</DropdownMenuLabel>
          {dia.filas.length === 0 ? (
            <DropdownMenuItem disabled>Nenhuma fila hoje</DropdownMenuItem>
          ) : (
            dia.filas.map((f) => (
              <DropdownMenuItem key={f.tipo} onSelect={() => abrirFila(f.rotulo, f.ids)}>
                <IconeDoTipo tipo={f.tipo} /> {f.rotulo}
                <span className="ml-auto font-mono text-caption tabular-nums text-text-tertiary">{f.ids.length}</span>
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={adiarExcedente} disabled={tarefasQueNaoCabem === 0}>
            <Sunrise aria-hidden="true" /> Adiar o que não cabe para amanhã 9h
            {tarefasQueNaoCabem > 0 && <span className="ml-auto font-mono text-caption tabular-nums text-text-tertiary">{tarefasQueNaoCabem}</span>}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button variant="primary" onClick={() => abrirFila("Fila do dia", ordemDeTrabalho)} disabled={ordemDeTrabalho.length === 0}>
        <Play size={14} aria-hidden="true" /> Começar pela ordem
      </Button>
    </>
  );

  // Capacidade em uma frase: o que sobra até as 18h, ou quanto passa.
  const lateral = vazio ? null : (
    <span
      // No desktop largo a capacidade mora na coluna da direita.
      className={cn("font-mono text-caption tabular-nums xl:hidden", excedentes > 0 ? "text-warning" : "text-text-tertiary")}
      title={`Cabe hoje ${textoDeMinutos(livres)} (até as 18h, menos compromissos e 15% de folga) · planejado ${textoDeMinutos(planejados)}`}
    >
      {excedentes > 0 ? `passa ${textoDeMinutos(excedentes)} do seu dia` : `sobram ${textoDeMinutos(Math.max(0, livres - planejados))} até 18h`}
    </span>
  );

  if (vazio) {
    return moldura({
      contagem,
      acoes,
      conteudo: (
        <>
          <div className="rounded-[18px] border border-border-subtle bg-panel px-5 py-8 text-center">
            <p className="text-body font-medium text-text-primary">Nada para hoje.</p>
            <p className="mt-1 text-small text-text-secondary">Sem tarefas vencendo, clientes esperando ou negócios sem próximo passo.</p>
          </div>
          {dialogo}
        </>
      ),
    });
  }

  return moldura({
    contagem,
    acoes,
    lateral,
    coluna: <ColunaDoDia dia={dia} agora={agora} onAbrirFila={abrirFila} />,
    conteudo: (
      <div className="flex flex-col gap-6">
        {destaque && <Agora item={destaque} agora={agora} onConcluir={concluir} onMudou={mudou} />}

        {dia.fixos.length > 0 && (
          <section aria-labelledby="grupo-fixos">
            <TituloDeGrupo id="grupo-fixos">Com hora marcada</TituloDeGrupo>
            <ul>
              {dia.fixos.map((i) => (
                <ItemDoDia key={i.id} item={i} agora={agora} fixo onConcluir={concluir} onMudou={mudou} />
              ))}
            </ul>
          </section>
        )}

        {visiveis.length > 0 && (
          <section aria-labelledby="grupo-seguintes">
            <TituloDeGrupo id="grupo-seguintes">Em seguida</TituloDeGrupo>
            <ol>
              {visiveis.map((i) => (
                <ItemDoDia key={i.id} item={i} agora={agora} onConcluir={concluir} onMudou={mudou} />
              ))}
            </ol>
          </section>
        )}

        {!destaque && dia.fixos.length > 0 && <p className="px-2 text-small text-text-secondary">Nada além dos compromissos.</p>}

        {verTudo && amanha.length > 0 && (
          <section aria-labelledby="grupo-amanha">
            <div className="flex items-center gap-2 pr-2">
              <TituloDeGrupo id="grupo-amanha" className="pb-0">
                Provavelmente amanhã
              </TituloDeGrupo>
              <span className="text-caption text-text-tertiary">não cabe no que sobra do seu dia</span>
            </div>
            <ul className="mt-1">
              {amanha.map((i) => (
                <ItemDoDia key={i.id} item={i} agora={agora} onConcluir={concluir} onMudou={mudou} />
              ))}
            </ul>
          </section>
        )}

        {(escondidos > 0 || verTudo) && (seguintes.length > EM_SEGUIDA || amanha.length > 0) && (
          <button
            type="button"
            onClick={() => setVerTudo((v) => !v)}
            aria-expanded={verTudo}
            className="inline-flex w-fit items-center gap-1 rounded-full px-2 text-small font-medium text-accent-fg hover:underline"
          >
            {verTudo ? "Mostrar menos" : semFolga ? `Mais ${escondidos}` : `Mais ${escondidos} para hoje`}
            {verTudo ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
          </button>
        )}
        {dialogo}
      </div>
    ),
  });
}

function contextoDoItem(item: ItemDoDiaDaTela): string | null {
  return item.contexto.negocio?.nome ?? item.contexto.contato?.nome ?? null;
}

function contatoDoItem(item: ItemDoDiaDaTela) {
  return item.contexto.contato
    ? { telefone: item.contexto.contato.telefone, email: item.contexto.contato.email, conversaId: item.contexto.conversaId }
    : null;
}

/** "13/10" atrasada vira "desde 13/10"; compromisso de hoje mostra só a hora. */
function textoDoItem(item: ItemDoDiaDaTela, agora: Date, fixo: boolean): string {
  if (!item.dueAt) return item.fonte === "responder" ? "esperando" : "";
  const texto = textoDoPrazo(item.dueAt, item.diaTodo, agora);
  if (fixo) return texto.replace(/^Hoje /, "");
  if (item.tarefa?.overdue && !texto.startsWith("Hoje")) return `desde ${texto.charAt(0).toLowerCase()}${texto.slice(1)}`;
  return texto;
}

/** Detalhes que saíram da linha (duração, prioridade, origem) ficam no título do item. */
function detalhesDoItem(item: ItemDoDiaDaTela): string {
  const partes = [`Leva ${textoDeMinutos(item.duracaoMin)}`];
  if (item.prioridade === "alta") partes.push("prioridade alta");
  if (item.tarefa?.origem === "automacao") partes.push("criada por automação");
  if (item.tarefa?.origem === "ia") partes.push("criada pela IA");
  return partes.join(" · ");
}

// A tarefa de agora: em destaque, com a ação de um clique.
function Agora({ item, agora, onConcluir, onMudou }: { item: ItemDoDiaDaTela; agora: Date; onConcluir: Concluir; onMudou: () => void }) {
  const t = item.tarefa;
  const fonte = item.fonte !== "tarefa" ? FONTE[item.fonte] : null;
  const contexto = contextoDoItem(item);
  const prazo = textoDoItem(item, agora, false);
  return (
    <section aria-labelledby="grupo-agora">
      <TituloDeGrupo id="grupo-agora">Agora</TituloDeGrupo>
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-3 rounded-[18px] border border-border-subtle bg-panel px-4 py-4 sm:px-5" title={detalhesDoItem(item)}>
        <span className="grid size-9 shrink-0 place-items-center rounded-[11px] border border-border-subtle bg-raised" aria-hidden="true">
          {fonte ? <fonte.icone size={17} strokeWidth={1.5} className="text-text-secondary" /> : <IconeDoTipo tipo={item.tipo} className="size-[17px] text-text-secondary" />}
        </span>
        <span className="flex min-w-0 flex-1 basis-48 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-1.5">
            {t && <RotuloDaOrigem origem={t.origem} />}
            <span className="truncate text-body-lg font-semibold tracking-tight text-text-primary">{item.titulo}</span>
          </span>
          <span className="truncate text-small text-text-tertiary">
            {fonte ? fonte.rotulo : rotuloDoTipo(item.tipo)}
            {contexto && ` · ${contexto}`}
            {item.fonte === "responder" ? (
              <span className="font-medium text-danger"> · esperando resposta</span>
            ) : (
              prazo && <span className={cn(t?.overdue && "font-medium text-danger")}> · {prazo}</span>
            )}
            {t?.overdue && <span className="sr-only"> (atrasada)</span>}
          </span>
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          <AcaoRapida tamanho="md" tipo={item.tipo} contato={contatoDoItem(item)} />
          {t && <BotaoConcluir texto={t.text} onConcluir={(el) => onConcluir(t, el)} />}
          {t && <MenuDeAdiar tarefa={{ id: t.id, dueAt: t.dueAt, deal: t.deal }} onAdiada={onMudou} />}
        </span>
      </div>
    </section>
  );
}

// Linha com três coisas: concluir, o que é e para quem, e o prazo. Ligar,
// e-mail e adiar aparecem ao passar o mouse.
function ItemDoDia({
  item,
  agora,
  fixo = false,
  onConcluir,
  onMudou,
}: {
  item: ItemDoDiaDaTela;
  agora: Date;
  fixo?: boolean;
  onConcluir: Concluir;
  onMudou: () => void;
}) {
  const t = item.tarefa;
  const fonte = item.fonte !== "tarefa" ? FONTE[item.fonte] : null;
  const contexto = contextoDoItem(item);
  const atrasada = !!t?.overdue;
  const prazo = textoDoItem(item, agora, fixo);
  return (
    <li className={linhaDeLista} title={detalhesDoItem(item)}>
      {t ? (
        <BotaoConcluir texto={t.text} onConcluir={(el) => onConcluir(t, el)} />
      ) : (
        <span className="flex size-7 shrink-0 items-center justify-center" aria-hidden="true">
          {fonte && <fonte.icone size={16} strokeWidth={1.5} className="text-text-tertiary" />}
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-center gap-1.5">
          {t && <RotuloDaOrigem origem={t.origem} />}
          <span className="truncate text-body font-medium text-text-primary">{item.titulo}</span>
        </span>
        <span className="truncate text-caption text-text-tertiary">
          {/* No celular o prazo desce para cá e o título fica com a largura toda. */}
          {prazo && (
            <span className={cn("sm:hidden", atrasada || item.fonte === "responder" ? "font-medium text-danger" : "text-text-secondary")}>{prazo} · </span>
          )}
          {fonte ? fonte.rotulo : rotuloDoTipo(item.tipo)}
          {contexto && ` · ${contexto}`}
          {item.prioridade === "alta" && <span className="text-warning"> · alta</span>}
        </span>
      </span>
      <span className={acoesDaLinha}>
        <AcaoRapida tipo={item.tipo} contato={contatoDoItem(item)} />
        {t && <MenuDeAdiar tarefa={{ id: t.id, dueAt: t.dueAt, deal: t.deal }} onAdiada={onMudou} />}
      </span>
      {prazo && (
        <span
          className={cn(
            "hidden shrink-0 text-small tabular-nums sm:inline",
            atrasada || item.fonte === "responder" ? "font-medium text-danger" : fixo ? "font-semibold text-text-primary" : "text-text-secondary"
          )}
        >
          {prazo}
          {atrasada && <span className="sr-only"> (atrasada)</span>}
        </span>
      )}
    </li>
  );
}
