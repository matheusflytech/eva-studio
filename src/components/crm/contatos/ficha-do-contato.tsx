"use client";

import * as React from "react";
import { CalendarDays, ListTodo, Mail, Maximize2, MoreHorizontal, Phone, Trash2, UserRound, X, MapPin } from "lucide-react";
import { LogoOficial } from "@/components/ui/logo-oficial";
import Link from "@/components/contrato/link";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Notice } from "@/components/ui/notice";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { focusRing } from "@/components/ui/styles";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ContactActivity } from "@/components/crm/contact-activity";
import { linkDoWhatsAppWeb } from "@/lib/telefone";
import { cn } from "@/lib/utils";
import { nomeDoContato, type Contact, type TagRow } from "./tipos";
import { DadosDoContato } from "./dados-do-contato";
import { EtiquetasDoContato } from "./etiquetas-do-contato";
import { FotoDoContato } from "./foto-do-contato";
import { TrocarFoto } from "@/components/crm/trocar-foto";
import { useApagarComDesfazer } from "@/components/crm/lixeira/use-apagar-com-desfazer";
import { useRegistroEmFoco, type RegistroEmFoco } from "@/components/busca/registro-em-foco";

type AbaDaFicha = "resumo" | "atividade" | "dados";
const ABAS: { value: AbaDaFicha; label: string }[] = [
  { value: "resumo", label: "Resumo" },
  { value: "atividade", label: "Atividade" },
  { value: "dados", label: "Dados" },
];

/** Cidade, se algum campo do contato guarda (o CRM não tem campo fixo para isso). */
export function cidadeDo(c: Contact): string | null {
  for (const [k, v] of Object.entries(c.customFields ?? {})) {
    if (/^(cidade|city)$/i.test(k) && typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

export const dataCurta = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
export const linkDeLigar = (telefone: string) => `tel:${telefone.replace(/[^\d+]/g, "")}`;

/**
 * Ficha do contato para o ajuste rápido sem sair da lista. Na visão Lista
 * mora no painel da direita ("painel"); na Tabela e no celular, numa gaveta.
 * Topo: foto, nome, cargo · empresa, botões redondos e etiquetas. Abaixo:
 * Resumo (dados em blocos, tarefas, negócios), Atividade (notas, conversas,
 * sequências) e Dados (os campos que salvam ao sair). A história inteira
 * fica na página completa (/contatos/<id>).
 */
export function FichaDoContato({
  contact,
  tags,
  modo,
  onClose,
  onChanged,
  onDeleted,
  onRestored,
}: {
  contact: Contact;
  tags: TagRow[];
  modo: "painel" | "gaveta";
  onClose: () => void;
  onChanged: (c: Contact) => void;
  onDeleted: () => void;
  /** Depois do "Desfazer" do apagar (a ficha já fechou): recarregar a lista. */
  onRestored?: () => void;
}) {
  const [erro, setErro] = React.useState<string | null>(null);
  // Busca global (⌘K): com a ficha aberta, WhatsApp e tarefa para este contato vêm primeiro.
  const registro = React.useMemo<RegistroEmFoco>(
    () => ({
      tipo: "contato",
      id: contact.id,
      titulo: contact.name || contact.phone || contact.email || "Contato sem nome",
      caminho: `/contatos/${contact.id}`,
      subtitulo: [contact.phone, contact.email].filter(Boolean).join(" · "),
      whatsapp: { nome: contact.name || "o contato", telefone: contact.phone },
      tarefa: { contactId: contact.id },
    }),
    [contact.id, contact.name, contact.phone, contact.email]
  );
  useRegistroEmFoco(registro);

  const apagarComDesfazer = useApagarComDesfazer();
  // Sem confirmação: vai para a lixeira e o toast desfaz.
  async function remove() {
    setErro(null);
    const r = await apagarComDesfazer({
      url: `/api/contacts/${contact.id}`,
      titulo: "Contato apagado",
      perguntaSemLixeira: `A lixeira ainda não está ativada: apagar ${nomeDoContato(contact)} leva junto tarefas, notas e etiquetas e não tem volta. Apagar mesmo assim?`,
      aoRestaurar: () => onRestored?.(),
    });
    if (r.ok) onDeleted();
    else if (r.erro) setErro(r.erro);
  }

  const nome = nomeDoContato(contact);
  const subtitulo = [contact.jobTitle, contact.company?.name].filter(Boolean).join(" · ");

  const corpo = <CorpoDaFicha contact={contact} tags={tags} onChanged={onChanged} erro={erro} mostrarNome={modo === "painel"} />;

  if (modo === "gaveta") {
    return (
      <Drawer open onOpenChange={(v) => !v && onClose()}>
        <DrawerContent
          title={nome}
          description={subtitulo || undefined}
          size="md"
          footer={
            <>
              <Button variant="ghost" className="mr-auto text-danger hover:text-danger" onClick={remove}>
                <Trash2 size={14} aria-hidden="true" /> Apagar contato
              </Button>
              <AbrirPaginaCompleta id={contact.id} />
            </>
          }
        >
          {corpo}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <div className="flex flex-col gap-3" aria-label={`Ficha de ${nome}`} role="region">
      <div className="-mx-1 flex items-center gap-1">
        <IconButton aria-label="Fechar ficha" tooltip size="sm" onClick={onClose}>
          <X aria-hidden="true" />
        </IconButton>
        <span className="ml-auto" />
        <AbrirPaginaCompleta id={contact.id} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton aria-label="Mais ações do contato" size="sm">
              <MoreHorizontal aria-hidden="true" />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem tone="danger" onSelect={() => void remove()}>
              <Trash2 aria-hidden="true" /> Apagar contato
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {corpo}
    </div>
  );
}

function AbrirPaginaCompleta({ id }: { id: string }) {
  return (
    <Link
      href={`/contatos/${id}`}
      className={cn("inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-small font-medium text-accent-fg hover:bg-hover", focusRing)}
    >
      <Maximize2 size={13} aria-hidden /> Abrir página completa
    </Link>
  );
}

function CorpoDaFicha({
  contact,
  tags,
  onChanged,
  erro,
  mostrarNome,
}: {
  contact: Contact;
  tags: TagRow[];
  onChanged: (c: Contact) => void;
  erro: string | null;
  /** Na gaveta o nome já está no título dela. */
  mostrarNome: boolean;
}) {
  const [aba, setAba] = React.useState<AbaDaFicha>("resumo");
  // Botão redondo "Tarefa": vai ao Resumo e abre o campo de nova tarefa.
  const [pedidoDeTarefa, setPedidoDeTarefa] = React.useState(0);
  const nome = nomeDoContato(contact);
  const subtitulo = [contact.jobTitle, contact.company?.name].filter(Boolean).join(" · ");
  const whatsapp = linkDoWhatsAppWeb(contact.phone);
  const cidade = cidadeDo(contact);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4.5">
        <TrocarFoto endpoint={`/api/contacts/${contact.id}/foto`} temFoto={!!contact.avatarPath} rotulo={nome} onMudou={(avatarPath) => onChanged({ ...contact, avatarPath })}>
          <FotoDoContato nome={nome} semente={contact.id} tamanho="lg" foto={contact.avatarPath} />
        </TrocarFoto>
        <div className="min-w-0 flex-1">
          {mostrarNome && <h2 className="truncate text-title font-semibold tracking-tight text-text-primary">{nome}</h2>}
          <p className="mb-2 mt-0.5 truncate text-small text-text-tertiary">{subtitulo || "Sem cargo e sem empresa"}</p>
          <div className="flex gap-1.5">
            <BotaoRedondo rotulo="Ligar" href={contact.phone ? linkDeLigar(contact.phone) : null}>
              <Phone aria-hidden />
            </BotaoRedondo>
            <BotaoRedondo rotulo="WhatsApp" href={whatsapp} externo>
              <LogoOficial marca="whatsapp" tamanho={14} />
            </BotaoRedondo>
            <BotaoRedondo rotulo="E-mail" href={contact.email ? `mailto:${contact.email}` : null}>
              <Mail aria-hidden />
            </BotaoRedondo>
            <BotaoRedondo
              rotulo="Nova tarefa"
              onClick={() => {
                setAba("resumo");
                setPedidoDeTarefa((n) => n + 1);
              }}
            >
              <ListTodo aria-hidden />
            </BotaoRedondo>
          </div>
        </div>
      </div>

      <EtiquetasDoContato contact={contact} tags={tags} onChanged={onChanged} />

      {erro && <Notice tone="danger">{erro}</Notice>}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Bloco icone={<Phone aria-hidden />} vazio="Sem telefone">{contact.phone}</Bloco>
        <Bloco icone={<Mail aria-hidden />} vazio="Sem e-mail">{contact.email}</Bloco>
        {cidade ? (
          <Bloco icone={<MapPin aria-hidden />}>{cidade}</Bloco>
        ) : (
          <Bloco icone={<CalendarDays aria-hidden />}>Desde {dataCurta(contact.createdAt)}</Bloco>
        )}
        <Bloco icone={<UserRound aria-hidden />}>{contact.owner?.name ? `Dono: ${contact.owner.name}` : "Sem proprietário"}</Bloco>
      </div>

      <SegmentedControl label="Seções da ficha" options={ABAS} value={aba} onChange={setAba} className="self-start" />

      {aba === "resumo" && <ContactActivity contactId={contact.id} secoes={["tarefas", "negocios"]} pedidoDeTarefa={pedidoDeTarefa} />}
      {aba === "atividade" && <ContactActivity contactId={contact.id} secoes={["notas", "conversas", "sequencias"]} />}
      {aba === "dados" && <DadosDoContato contact={contact} onChanged={onChanged} />}
    </div>
  );
}

/** Dado em bloco (telefone, e-mail, cidade, dono): duas colunas na ficha. */
export function Bloco({ icone, children, vazio, className }: { icone: React.ReactNode; children?: React.ReactNode; vazio?: string; className?: string }) {
  const tem = children !== undefined && children !== null && children !== "";
  return (
    <div
      className={cn(
        "flex h-11 min-w-0 items-center gap-2.5 rounded-[14px] bg-raised px-3 text-small ring-1 ring-border-subtle [&>svg]:size-3.5 [&>svg]:shrink-0 [&>svg]:text-text-tertiary",
        className
      )}
    >
      {icone}
      <span className={cn("truncate", tem ? "text-text-primary" : "text-text-tertiary")}>{tem ? children : vazio}</span>
    </div>
  );
}

/** Botão redondo de ação (ligar, WhatsApp, e-mail, tarefa). Sem destino: fica apagado. */
export function BotaoRedondo({
  rotulo,
  href,
  externo,
  onClick,
  children,
}: {
  rotulo: string;
  href?: string | null;
  externo?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const classe = cn(
    "grid size-8 place-items-center rounded-full bg-raised text-text-primary ring-1 ring-border-default transition-colors duration-120 hover:bg-hover [&_svg]:size-3.5",
    focusRing
  );
  if (onClick) {
    return (
      <button type="button" aria-label={rotulo} title={rotulo} onClick={onClick} className={classe}>
        {children}
      </button>
    );
  }
  if (!href) {
    return (
      <span aria-label={`${rotulo} (indisponível)`} role="img" title={`${rotulo}: sem dado no contato`} className={cn(classe, "cursor-not-allowed opacity-40 hover:bg-raised")}>
        {children}
      </span>
    );
  }
  return (
    <a href={href} aria-label={rotulo} title={rotulo} className={classe} {...(externo ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
      {children}
    </a>
  );
}
