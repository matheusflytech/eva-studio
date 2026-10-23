"use client";

import * as React from "react";
import {
  Bot, UserRound, Inbox, Bell, BellOff, ChevronsUpDown, Check, ListFilter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { focusRing } from "@/components/ui/styles";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { OrbeDoAgente } from "@/components/agent-studio/orbe-do-agente";
import { AvatarDoContato, QuadradoDoAgente, SeloDoCanal } from "./avatar";
import { LogoOficial, marcaDoCanal } from "@/components/ui/logo-oficial";
import {
  NOME_DO_CANAL, horaCurta,
  type Conversa, type IdDoFiltro, type Resumo,
} from "./tipos";

/** Os mesmos canais do antigo select de canal. */
const CANAIS = [
  { valor: "", rotulo: "Todos os canais" },
  { valor: "whatsapp_meta", rotulo: "WhatsApp oficial" },
  { valor: "whatsapp_qr", rotulo: "WhatsApp (QR)" },
  { valor: "instagram", rotulo: "Instagram" },
  { valor: "messenger", rotulo: "Messenger" },
  { valor: "telegram", rotulo: "Telegram" },
  { valor: "tiktok", rotulo: "TikTok" },
  { valor: "website", rotulo: "Site" },
];

/** As três abas à vista. "Com o agente" e "Encerradas" moram em Filtros. */
const ABAS: { id: IdDoFiltro; rotulo: string }[] = [
  { id: "todas", rotulo: "Todas" },
  { id: "esperando", rotulo: "Esperando" },
  { id: "minhas", rotulo: "Minhas" },
];

const FILTROS_DO_MENU: { id: IdDoFiltro; rotulo: string }[] = [
  { id: "agente", rotulo: "Com o agente" },
  { id: "encerradas", rotulo: "Encerradas" },
];

type AgenteDaLista = { id: string; name: string; primaryChannel?: string };

/** Quem escreveu por último, na prévia da lista. */
function prefixoDaPrevia(papel: string): string {
  if (papel === "human") return "Você: ";
  if (papel === "bot") return "Agente: ";
  return "";
}

/** Só o status: esperando, com quem está, com o agente ou encerrada. */
function EstadoDaConversa({ c }: { c: Conversa }) {
  if (c.status === "waiting_human") {
    return <Badge variant="danger" dot>Esperando</Badge>;
  }
  if (c.status === "human") {
    return (
      <span className="inline-flex items-center gap-1 text-caption text-text-secondary">
        <UserRound size={12} aria-hidden="true" /> {c.assignedTo?.name.split(" ")[0] ?? "Humano"}
      </span>
    );
  }
  if (c.status === "ended") {
    return <span className="text-caption text-text-tertiary">Encerrada</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 text-caption text-text-tertiary">
      {c.agentId ? <OrbeDoAgente agenteId={c.agentId} tamanho={16} leve /> : <Bot size={12} aria-hidden="true" />} Agente
    </span>
  );
}

/** Seletor de caixa (agente) no lugar do título: cor do agente e quantos esperam. */
function SeletorDeCaixa({
  agente, onAgente, agentes, totalDeConversas, esperando,
}: {
  agente: string;
  onAgente: (v: string) => void;
  agentes: AgenteDaLista[];
  totalDeConversas: string;
  esperando: number | null;
}) {
  const atual = agentes.find((a) => a.id === agente) ?? null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "-mx-1.5 flex w-[calc(100%+12px)] items-center gap-2.5 rounded-lg px-1.5 py-1 text-left transition-colors duration-120 hover:bg-hover data-[state=open]:bg-hover",
            focusRing
          )}
        >
          {atual ? (
            <QuadradoDoAgente id={atual.id} nome={atual.name} />
          ) : (
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] bg-hover text-text-secondary" aria-hidden="true">
              <Inbox size={14} />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-body-lg font-semibold leading-tight tracking-tight text-text-primary">
              {atual?.name ?? "Todas as caixas"}
            </span>
            <span className="block truncate text-caption text-text-tertiary">
              {totalDeConversas}
              {esperando !== null && esperando > 0 && (
                <>
                  {" · "}
                  <span className="font-medium text-danger">{esperando} esperando</span>
                </>
              )}
            </span>
          </span>
          <ChevronsUpDown size={14} className="shrink-0 text-text-tertiary" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[300px] max-w-[calc(100vw-24px)]">
        <ItemDaCaixa ativo={!agente} onSelect={() => onAgente("")} nome="Todas as caixas" quadrado={
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-hover text-text-secondary" aria-hidden="true">
            <Inbox size={12} />
          </span>
        } />
        {agentes.length > 0 && <DropdownMenuSeparator />}
        {agentes.map((a) => (
          <ItemDaCaixa
            key={a.id}
            ativo={agente === a.id}
            onSelect={() => onAgente(a.id)}
            nome={a.name}
            detalhe={a.primaryChannel ? NOME_DO_CANAL[a.primaryChannel] : undefined}
            quadrado={<QuadradoDoAgente id={a.id} nome={a.name} tamanho="sm" />}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ItemDaCaixa({
  ativo, onSelect, nome, detalhe, quadrado,
}: {
  ativo: boolean;
  onSelect: () => void;
  nome: string;
  detalhe?: string;
  quadrado: React.ReactNode;
}) {
  return (
    <DropdownMenuItem onSelect={onSelect} className={cn("py-1.5", ativo && "bg-hover")}>
      {quadrado}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{nome}</span>
        {detalhe && <span className="truncate text-caption text-text-tertiary">{detalhe}</span>}
      </span>
      <span className="flex w-4 shrink-0 justify-center">
        {ativo && <Check size={14} className="text-accent-fg!" aria-label="Caixa atual" />}
      </span>
    </DropdownMenuItem>
  );
}

/** Abas em cápsula, no desenho do SegmentedControl, com contador ao lado do rótulo. */
function AbasDeStatus({
  filtro, onFiltro, contadores,
}: {
  filtro: IdDoFiltro;
  onFiltro: (f: IdDoFiltro) => void;
  contadores: Partial<Record<IdDoFiltro, number>>;
}) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  // Com "Com o agente" ou "Encerradas" ligado (via Filtros) nenhuma aba fica
  // marcada; a primeira segue alcançável pelo teclado.
  const algumaAtiva = ABAS.some((a) => a.id === filtro);
  return (
    <div
      role="radiogroup"
      aria-label="Situação da conversa"
      className="inline-flex h-8 items-center self-start rounded-full border border-border-subtle bg-raised p-0.5"
    >
      {ABAS.map((a, i) => {
        const ativo = a.id === filtro;
        const n = contadores[a.id];
        return (
          <button
            key={a.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={ativo}
            tabIndex={ativo || (!algumaAtiva && i === 0) ? 0 : -1}
            onClick={() => onFiltro(a.id)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
              e.preventDefault();
              const j = (i + (e.key === "ArrowRight" ? 1 : -1) + ABAS.length) % ABAS.length;
              onFiltro(ABAS[j].id);
              refs.current[j]?.focus();
            }}
            className={cn(
              "inline-flex h-full items-center gap-1.5 rounded-full px-3 text-small transition-colors duration-120",
              ativo ? "bg-inverse font-medium text-inverse-fg" : "text-text-secondary hover:text-text-primary",
              focusRing
            )}
          >
            {a.rotulo}
            {n !== undefined && n > 0 && (
              <span
                className={cn(
                  "font-mono text-caption tabular-nums",
                  a.id === "esperando"
                    ? "rounded-full bg-danger-solid px-1.5 text-text-on-danger"
                    : ativo ? "opacity-60" : "text-text-tertiary"
                )}
              >
                {n}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Canal, "Com o agente", "Encerradas" e testes: tudo atrás de um botão. */
function BotaoDeFiltros({
  filtro, onFiltro, canal, onCanal, testes, onTestes,
}: {
  filtro: IdDoFiltro;
  onFiltro: (f: IdDoFiltro) => void;
  canal: string;
  onCanal: (v: string) => void;
  testes: boolean;
  onTestes: (v: boolean) => void;
}) {
  const ativos =
    (canal ? 1 : 0) + (FILTROS_DO_MENU.some((f) => f.id === filtro) ? 1 : 0) + (testes ? 1 : 0);
  // Marcar não fecha o menu: a pessoa costuma ligar mais de um filtro de vez.
  const manterAberto = (e: Event) => e.preventDefault();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="md" className="shrink-0 px-3 data-[state=open]:bg-hover" aria-label={ativos ? `Filtros (${ativos} ativos)` : "Filtros"}>
          <ListFilter size={14} aria-hidden="true" />
          Filtros
          {ativos > 0 && (
            <span className="rounded-full bg-accent-solid px-1.5 font-mono text-caption tabular-nums text-text-on-accent">{ativos}</span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[220px]">
        <DropdownMenuLabel>Canal</DropdownMenuLabel>
        {CANAIS.map((c) => (
          <DropdownMenuCheckboxItem
            key={c.valor || "todos"}
            checked={canal === c.valor}
            onCheckedChange={() => onCanal(c.valor)}
            onSelect={manterAberto}
          >
            {marcaDoCanal(c.valor) && <LogoOficial marca={marcaDoCanal(c.valor)!} tamanho={14} />}
            {c.rotulo}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Situação</DropdownMenuLabel>
        {FILTROS_DO_MENU.map((f) => (
          <DropdownMenuCheckboxItem
            key={f.id}
            checked={filtro === f.id}
            onCheckedChange={(v) => onFiltro(v ? f.id : "todas")}
            onSelect={manterAberto}
          >
            {f.rotulo}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem checked={testes} onCheckedChange={(v) => onTestes(v === true)} onSelect={manterAberto}>
          Mostrar testes
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function LinhaDeConversa({
  c, ativa, mostrarAgente, onSelecionar,
}: {
  c: Conversa;
  ativa: boolean;
  mostrarAgente: boolean;
  onSelecionar: (id: string) => void;
}) {
  const naoLida = c.naoLidas > 0;
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelecionar(c.id)}
        aria-current={ativa ? "true" : undefined}
        className={cn(
          "relative flex w-full items-start gap-2.5 border-b border-border-subtle py-2.5 pl-3 pr-3 text-left transition-colors duration-120",
          ativa ? "bg-accent-subtle" : "hover:bg-hover",
          focusRing,
          "focus-visible:outline-offset-[-2px]"
        )}
      >
        {naoLida && (
          <span className="absolute left-1 top-[26px] h-1.5 w-1.5 rounded-full bg-accent-solid" aria-hidden="true" />
        )}

        <span className="relative mt-0.5 shrink-0">
          <AvatarDoContato chave={c.contactId} nome={c.nome} />
          {/* Canal da conversa: logo oficial no canto de baixo à direita. */}
          <SeloDoCanal canal={c.channel} className="absolute -bottom-0.5 -right-0.5" />
          {/* Em "Todas as caixas", de qual agente é a conversa: só a cor, o nome fica no title. */}
          {mostrarAgente && (
            <span className="absolute -bottom-0.5 -left-0.5 rounded-[5px] ring-2 ring-page" title={c.agentName}>
              <QuadradoDoAgente id={c.agentId} nome={c.agentName} tamanho="xs" />
            </span>
          )}
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-px">
          <span className="flex items-baseline gap-2">
            <span className={cn("truncate text-body text-text-primary", naoLida ? "font-semibold" : "font-medium")}>
              {c.nome}
            </span>
            <span className={cn("ml-auto shrink-0 text-caption tabular-nums", naoLida ? "font-semibold text-accent-fg" : "text-text-tertiary")}>
              {horaCurta(c.lastMessageAt)}
            </span>
          </span>
          <span className={cn("truncate text-small", naoLida ? "text-text-secondary" : "text-text-tertiary")}>
            {c.lastMessageText ? `${prefixoDaPrevia(c.lastMessageRole)}${c.lastMessageText}` : "Sem mensagens"}
          </span>
          <span className="mt-1 flex items-center">
            <EstadoDaConversa c={c} />
          </span>
          {naoLida && (
            <span className="sr-only">
              {c.naoLidas === 1 ? "1 mensagem não lida" : `${c.naoLidas} mensagens não lidas`}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

export function ListaDeConversas({
  itens, selecionada, onSelecionar,
  filtro, onFiltro, busca, onBusca, canal, onCanal, agente, onAgente, agentes, testes, onTestes,
  resumo, carregando, temMais, carregandoMais, onMais, som, onSom, className,
}: {
  itens: Conversa[];
  selecionada: string | null;
  onSelecionar: (id: string) => void;
  filtro: IdDoFiltro;
  onFiltro: (f: IdDoFiltro) => void;
  busca: string;
  onBusca: (v: string) => void;
  canal: string;
  onCanal: (v: string) => void;
  /** "" = todos os agentes. Cada site tem o seu (Eva Holding, Drawing Club...). */
  agente: string;
  onAgente: (v: string) => void;
  agentes: AgenteDaLista[];
  testes: boolean;
  onTestes: (v: boolean) => void;
  resumo: Resumo | null;
  carregando: boolean;
  temMais: boolean;
  carregandoMais: boolean;
  onMais: () => void;
  som: boolean;
  onSom: (v: boolean) => void;
  className?: string;
}) {
  const contadores: Partial<Record<IdDoFiltro, number>> = {
    esperando: resumo?.esperando,
    minhas: resumo?.minhas,
  };

  // O resumo do servidor é do contrato inteiro. Com um agente escolhido, quem
  // espera é contado na lista carregada, que já vem só daquele agente.
  const esperando = agente
    ? itens.filter((c) => c.status === "waiting_human").length
    : resumo?.esperando ?? null;
  const totalDeConversas = carregando && itens.length === 0
    ? "Carregando..."
    : `${itens.length}${temMais ? "+" : ""} ${itens.length === 1 && !temMais ? "conversa" : "conversas"}`;

  return (
    <section className={cn("flex min-h-0 flex-col overflow-hidden", className)}>
      <div className="flex flex-col gap-2 border-b border-border-subtle px-3 pb-2.5 pt-2.5">
        <SeletorDeCaixa
          agente={agente}
          onAgente={onAgente}
          agentes={agentes}
          totalDeConversas={totalDeConversas}
          esperando={esperando}
        />

        <div className="flex items-center gap-1.5">
          {/* 16px no celular: abaixo disso o iPhone dá zoom ao tocar no campo. */}
          <SearchInput
            value={busca}
            onValueChange={onBusca}
            placeholder="Buscar nome, telefone, mensagem"
            aria-label="Buscar conversas"
            className="min-w-0 flex-1 [&_input]:h-10 [&_input]:text-body-lg lg:[&_input]:h-8 lg:[&_input]:text-body"
          />
          <BotaoDeFiltros
            filtro={filtro}
            onFiltro={onFiltro}
            canal={canal}
            onCanal={onCanal}
            testes={testes}
            onTestes={onTestes}
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onSom(!som)}
            aria-label={som ? "Desligar o som de mensagem nova" : "Ligar o som de mensagem nova"}
            title={som ? "Som ligado" : "Som desligado"}
            className="shrink-0"
          >
            {som ? <Bell aria-hidden="true" /> : <BellOff aria-hidden="true" />}
          </Button>
        </div>

        <AbasDeStatus filtro={filtro} onFiltro={onFiltro} contadores={contadores} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {carregando && itens.length === 0 ? (
          <p className="p-6 text-center text-small text-text-tertiary">Carregando...</p>
        ) : itens.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <Inbox size={20} className="mb-3 text-text-tertiary" aria-hidden="true" />
            <p className="text-body font-medium text-text-primary">
              {busca ? "Nada encontrado" : filtro === "esperando" ? "Ninguém esperando" : "Nenhuma conversa"}
            </p>
            <p className="mt-1 max-w-[220px] text-caption text-text-tertiary">
              {busca
                ? "Tente outro nome, número ou trecho da mensagem."
                : filtro === "esperando"
                  ? "Quando o agente passar uma conversa para uma pessoa, ela aparece aqui."
                  : "As conversas aparecem aqui assim que alguém escrever por um canal conectado."}
            </p>
          </div>
        ) : (
          <ul>
            {itens.map((c) => (
              <LinhaDeConversa
                key={c.id}
                c={c}
                ativa={c.id === selecionada}
                mostrarAgente={!agente && agentes.length > 1}
                onSelecionar={onSelecionar}
              />
            ))}

            {temMais && (
              <li className="p-3">
                <Button variant="ghost" size="sm" onClick={onMais} loading={carregandoMais} className="w-full">
                  Carregar mais
                </Button>
              </li>
            )}
          </ul>
        )}
      </div>
    </section>
  );
}
