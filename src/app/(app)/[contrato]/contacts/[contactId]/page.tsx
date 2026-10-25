import { PaginaDoContato } from "@/components/crm/contatos/pagina-do-contato";

// Página completa do contato, com endereço próprio: o link que se manda para
// alguém ("olha esse cliente"). Os dados vêm do navegador, como no resto do
// CRM (a sessão mora no cliente; ver o layout de (app)).
export default async function ContatoPage({ params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await params;
  return <PaginaDoContato contactId={contactId} />;
}
