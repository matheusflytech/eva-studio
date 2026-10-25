import { AceitarConvite } from "./aceitar-convite";

// Página pública do aceite de convite (link do e-mail). Fora de (app): abre sem login.
export default async function ConvitePage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  return <AceitarConvite token={t ?? ""} />;
}
