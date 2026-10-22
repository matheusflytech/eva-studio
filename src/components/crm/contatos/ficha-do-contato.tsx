"use client";

import * as React from "react";
import { Maximize2, Trash2 } from "lucide-react";
import Link from "@/components/contrato/link";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Notice } from "@/components/ui/notice";
import { PhoneNumber } from "@/components/ui/phone-number";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ContactActivity } from "@/components/crm/contact-activity";
import { CHANNEL_LABEL, nomeDoContato, type Contact, type TagRow } from "./tipos";
import { DadosDoContato } from "./dados-do-contato";
import { useApagarComDesfazer } from "@/components/crm/lixeira/use-apagar-com-desfazer";
import { useRegistroEmFoco, type RegistroEmFoco } from "@/components/busca/registro-em-foco";

/**
 * Ficha do contato em gaveta, para o ajuste rápido sem sair da lista: dados
 * (que salvam ao sair do campo), atividade (tarefas e notas) e apagar. A
 * história inteira fica na página completa (/contatos/<id>).
 */
export function FichaDoContato({
  contact,
  tags,
  onClose,
  onChanged,
  onDeleted,
  onRestored,
}: {
  contact: Contact;
  tags: TagRow[];
  onClose: () => void;
  onChanged: (c: Contact) => void;
  onDeleted: () => void;
  /** Depois do "Desfazer" do apagar (a gaveta já fechou): recarregar a lista. */
  onRestored?: () => void;
}) {
  const [erro, setErro] = React.useState<string | null>(null);
  const [aba, setAba] = React.useState("ficha");
  // Contador na aba: a pessoa precisa ver que há tarefa aberta sem trocar de aba.
  const [tarefasAbertas, setTarefasAbertas] = React.useState(0);
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
  const subtitulo = [contact.company?.name ?? "Sem empresa", ...contact.channels.map((ch) => CHANNEL_LABEL[ch.channel] ?? ch.channel)].join(" · ");

  return (
    <Drawer open onOpenChange={(v) => !v && onClose()}>
      <DrawerContent
        title={nome}
        description={subtitulo}
        size="md"
        footer={
          <Button variant="ghost" className="mr-auto text-danger hover:text-danger" onClick={remove}>
            <Trash2 size={14} aria-hidden="true" /> Apagar contato
          </Button>
        }
      >
        <div className="mb-4 flex items-center gap-3">
          <Avatar name={nome} size="lg" />
          <div className="min-w-0 flex-1 text-small text-text-secondary">
            {contact.email && <p className="truncate">{contact.email}</p>}
            {contact.phone && <PhoneNumber value={contact.phone} whatsapp />}
          </div>
          <Link
            href={`/contatos/${contact.id}`}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[12.5px] font-medium text-accent-fg hover:bg-hover"
          >
            <Maximize2 size={13} aria-hidden /> Abrir página completa
          </Link>
        </div>

        {erro && <Notice tone="danger" className="mb-3">{erro}</Notice>}

        <Tabs value={aba} onValueChange={setAba}>
          <TabsList className="mb-4 w-full">
            <TabsTrigger value="ficha">Ficha</TabsTrigger>
            <TabsTrigger value="atividade">Atividade{tarefasAbertas > 0 ? ` (${tarefasAbertas})` : ""}</TabsTrigger>
          </TabsList>

          <TabsContent value="atividade">
            <ContactActivity contactId={contact.id} onCountsChange={setTarefasAbertas} />
          </TabsContent>

          <TabsContent value="ficha">
            <DadosDoContato contact={contact} tags={tags} onChanged={onChanged} />
          </TabsContent>
        </Tabs>
      </DrawerContent>
    </Drawer>
  );
}
