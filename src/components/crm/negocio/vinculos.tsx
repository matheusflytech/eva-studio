"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { Building2, CalendarDays, Mail, Phone, Plus, Repeat, X } from "lucide-react";
import { cn, formatRelativeDate } from "@/lib/utils";
import { Avatar } from "@/components/crm/negocios/deal-card";
import {
  ordenarTarefas,
  rotuloDoCanal,
  rotuloDoStatus,
  rotuloDoTipoDeTarefa,
  tarefaAtrasada,
  type ConversaDoNegocio,
} from "./linha-do-tempo";
import { BotaoDeIcone, BotaoDeSecao, BuscaDeVinculo, IconeDoCanal, Secao, dataLonga, type OpcaoDeBusca } from "./pecas";
import type { NegocioDaFicha } from "./use-ficha";

type Patch = (body: Record<string, unknown>) => Promise<string | null>;

async function buscarContatos(q: string): Promise<OpcaoDeBusca[]> {
  const res = await fetch(`/api/contacts?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error("busca");
  const d = await res.json();
  return (d.contacts ?? []).map((c: { id: string; name: string; phone: string; email: string }) => ({
    id: c.id,
    titulo: c.name || c.phone || c.email || "Sem nome",
    sub: [c.phone, c.email].filter(Boolean).join(" · ") || undefined,
  }));
}

async function buscarEmpresas(q: string): Promise<OpcaoDeBusca[]> {
  const res = await fetch(`/api/companies?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error("busca");
  const d = await res.json();
  return (d.companies ?? []).map((c: { id: string; name: string; sector: string; cnpj: string }) => ({
    id: c.id,
    titulo: c.name,
    sub: c.sector || c.cnpj || undefined,
  }));
}

/** Coluna de vínculos: quem, de qual empresa, por onde está falando e o que falta fazer. */
export function VinculosDoNegocio({
  deal,
  conversas,
  agora,
  patch,
  onVerTarefas,
}: {
  deal: NegocioDaFicha;
  conversas: ConversaDoNegocio[];
  agora: Date;
  patch: Patch;
  onVerTarefas: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Contatos deal={deal} patch={patch} />
      <Empresa deal={deal} patch={patch} />
      <Conversas conversas={conversas} />
      <TarefasAbertas deal={deal} agora={agora} onVerTodas={onVerTarefas} />
    </div>
  );
}

function ErroDaSecao({ erro }: { erro: string | null }) {
  return erro ? <p role="alert" className="mb-2 text-[12px] text-danger">{erro}</p> : null;
}

function Contatos({ deal, patch }: { deal: NegocioDaFicha; patch: Patch }) {
  const [buscando, setBuscando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [removendo, setRemovendo] = React.useState<string | null>(null);
  const contatos = deal.contacts.map((c) => c.contact);

  return (
    <Secao
      titulo="Contatos"
      contagem={contatos.length}
      acao={
        !buscando && (
          <BotaoDeSecao onClick={() => setBuscando(true)}>
            <Plus size={13} aria-hidden /> Vincular contato
          </BotaoDeSecao>
        )
      }
    >
      <ErroDaSecao erro={erro} />
      {buscando && (
        <BuscaDeVinculo
          rotulo="Buscar contato para vincular"
          placeholder="Nome, telefone ou e-mail"
          buscar={buscarContatos}
          ignorar={contatos.map((c) => c.id)}
          onFechar={() => setBuscando(false)}
          onEscolher={async (id) => {
            setErro(null);
            const falha = await patch({ addContactId: id });
            setErro(falha);
            if (!falha) setBuscando(false);
          }}
        />
      )}
      {contatos.length === 0 ? (
        !buscando && <p className="text-[12.5px] text-text-tertiary">Nenhum contato vinculado.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {contatos.map((c) => {
            const nome = c.name || c.phone || c.email || "Sem nome";
            return (
              <li key={c.id} className="group flex items-start gap-2.5 rounded-xl px-2 py-2 hover:bg-surface-2">
                <Avatar nome={nome} tamanho={28} rotulo="" />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/contatos?abrir=${c.id}`}
                    className="block truncate rounded text-[13px] font-medium text-text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent-500/60"
                  >
                    {nome}
                  </Link>
                  {c.phone && (
                    <a
                      href={`tel:${c.phone}`}
                      className="mt-0.5 flex items-center gap-1.5 truncate rounded text-[12px] text-text-secondary outline-none hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent-500/60"
                    >
                      <Phone size={11} aria-hidden className="shrink-0 text-text-tertiary" /> {c.phone}
                    </a>
                  )}
                  {c.email && (
                    <a
                      href={`mailto:${c.email}`}
                      className="mt-0.5 flex items-center gap-1.5 truncate rounded text-[12px] text-text-secondary outline-none hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent-500/60"
                    >
                      <Mail size={11} aria-hidden className="shrink-0 text-text-tertiary" /> <span className="truncate">{c.email}</span>
                    </a>
                  )}
                </div>
                <BotaoDeIcone
                  rotulo={`Desvincular ${nome}`}
                  disabled={removendo === c.id}
                  onClick={async () => {
                    setRemovendo(c.id);
                    setErro(null);
                    setErro(await patch({ removeContactId: c.id }));
                    setRemovendo(null);
                  }}
                  className="opacity-100 hover:bg-danger/10 hover:text-danger lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
                >
                  <X size={14} />
                </BotaoDeIcone>
              </li>
            );
          })}
        </ul>
      )}
    </Secao>
  );
}

function Empresa({ deal, patch }: { deal: NegocioDaFicha; patch: Patch }) {
  const [buscando, setBuscando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  return (
    <Secao
      titulo="Empresa"
      acao={
        !buscando &&
        !deal.company && (
          <BotaoDeSecao onClick={() => setBuscando(true)}>
            <Plus size={13} aria-hidden /> Vincular empresa
          </BotaoDeSecao>
        )
      }
    >
      <ErroDaSecao erro={erro} />
      {buscando && (
        <BuscaDeVinculo
          rotulo="Buscar empresa para vincular"
          placeholder="Nome, CNPJ ou setor"
          buscar={buscarEmpresas}
          ignorar={deal.company ? [deal.company.id] : []}
          onFechar={() => setBuscando(false)}
          onEscolher={async (id) => {
            setErro(null);
            const falha = await patch({ companyId: id });
            setErro(falha);
            if (!falha) setBuscando(false);
          }}
        />
      )}
      {deal.company ? (
        <div className="flex items-center gap-2.5 rounded-xl px-2 py-2 hover:bg-surface-2">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-surface-3 text-text-secondary">
            <Building2 size={14} aria-hidden />
          </span>
          <Link
            href={`/empresas/${deal.company.id}`}
            className="min-w-0 flex-1 truncate rounded text-[13px] font-medium text-text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent-500/60"
          >
            {deal.company.name}
          </Link>
          {!buscando && (
            <BotaoDeIcone rotulo="Trocar empresa" onClick={() => setBuscando(true)}>
              <Repeat size={14} />
            </BotaoDeIcone>
          )}
          <BotaoDeIcone
            rotulo={`Remover ${deal.company.name} do negócio`}
            onClick={async () => {
              setErro(null);
              setErro(await patch({ companyId: null }));
            }}
            className="hover:bg-danger/10 hover:text-danger"
          >
            <X size={14} />
          </BotaoDeIcone>
        </div>
      ) : (
        !buscando && <p className="text-[12.5px] text-text-tertiary">Nenhuma empresa vinculada.</p>
      )}
    </Secao>
  );
}

const AUTOR: Record<string, string> = { bot: "Agente: ", human: "Equipe: ", note: "Nota: " };

function Conversas({ conversas }: { conversas: ConversaDoNegocio[] }) {
  return (
    <Secao titulo="Conversas" contagem={conversas.length}>
      {conversas.length === 0 ? (
        <p className="text-[12.5px] text-text-tertiary">Nenhuma conversa com os contatos deste negócio.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {conversas.slice(0, 8).map((c) => (
            <li key={c.id}>
              <Link
                href={`/conversas?c=${c.id}`}
                aria-label={`Abrir conversa no ${rotuloDoCanal(c.canal)}${c.contato ? ` com ${c.contato.name}` : ""}${c.naoLida ? ", não lida" : ""}`}
                className="flex gap-2.5 rounded-xl px-2 py-2 outline-none transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent-500/60"
              >
                <span className="relative mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-3">
                  <IconeDoCanal canal={c.canal} tamanho={14} />
                  {c.naoLida && (
                    <span aria-hidden className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border-2 border-surface-1 bg-accent-500" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={cn("truncate text-[13px]", c.naoLida ? "font-semibold text-text-primary" : "font-medium text-text-primary")}>
                      {c.contato?.name || "Sem nome"}
                      <span className="font-normal text-text-tertiary"> · {rotuloDoCanal(c.canal)}</span>
                    </span>
                    <span className="shrink-0 text-[11px] tabular-nums text-text-tertiary">{formatRelativeDate(c.ultimaMensagemEm)}</span>
                  </span>
                  <span className={cn("mt-0.5 block truncate text-[12px]", c.naoLida ? "text-text-primary" : "text-text-secondary")}>
                    {c.ultimaMensagem ? (AUTOR[c.ultimoAutor] ?? "") + c.ultimaMensagem : "Sem mensagens"}
                  </span>
                  <span
                    className={cn(
                      "mt-1 inline-block rounded-md px-1.5 py-px text-[10.5px] font-medium",
                      c.status === "waiting_human" ? "bg-amber-400/12 text-amber-300" : c.status === "ended" ? "bg-surface-3 text-text-tertiary" : "bg-accent-soft text-accent-400"
                    )}
                  >
                    {rotuloDoStatus(c.status)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Secao>
  );
}

function TarefasAbertas({ deal, agora, onVerTodas }: { deal: NegocioDaFicha; agora: Date; onVerTodas: () => void }) {
  const abertas = ordenarTarefas(deal.tasks.filter((t) => !t.doneAt));
  return (
    <Secao
      titulo="Tarefas abertas"
      contagem={abertas.length}
      acao={<BotaoDeSecao onClick={onVerTodas}>{abertas.length > 0 ? "Ver todas" : "Criar tarefa"}</BotaoDeSecao>}
    >
      {abertas.length === 0 ? (
        <p className="text-[12.5px] text-text-tertiary">Nada pendente.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {abertas.slice(0, 4).map((t) => {
            const atrasada = tarefaAtrasada(t, agora);
            return (
              <li key={t.id} className="px-2">
                <p className="truncate text-[13px] text-text-primary">{t.text}</p>
                <p className="flex items-center gap-1.5 text-[11.5px] text-text-tertiary">
                  {rotuloDoTipoDeTarefa(t.type)}
                  {t.dueAt && (
                    <span className={cn("inline-flex items-center gap-1", atrasada && "text-danger")}>
                      · <CalendarDays size={11} aria-hidden /> {atrasada ? "atrasada, " : ""}
                      {dataLonga(t.dueAt)}
                    </span>
                  )}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </Secao>
  );
}
