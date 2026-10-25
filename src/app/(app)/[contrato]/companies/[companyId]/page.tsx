import { PaginaDaEmpresa } from "@/components/crm/empresas/pagina-da-empresa";

// Página da empresa, com endereço próprio (o link que se manda para alguém).
// Os dados vêm do navegador, como no resto do CRM (a sessão mora no cliente;
// ver o layout de (app)).
export default async function EmpresaPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  return <PaginaDaEmpresa companyId={companyId} />;
}
