import { FichaDoNegocio } from "@/components/crm/negocio/ficha-do-negocio";

// Ficha do negócio com endereço próprio: é o link que se manda para alguém
// ("dá uma olhada nesse negócio"). Os dados vêm do navegador, como no resto
// do CRM, porque a sessão mora no cliente (ver o layout de (app)).
export default async function NegocioPage({ params }: { params: Promise<{ dealId: string }> }) {
  const { dealId } = await params;
  return <FichaDoNegocio dealId={dealId} />;
}
