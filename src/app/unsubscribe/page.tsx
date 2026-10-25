import { Descadastro } from "./descadastro";

// Página pública do descadastro de e-mail (link do rodapé). Fora de (app):
// abre sem login. Confirma com um botão: antivírus de e-mail costuma "abrir"
// links sozinho, e o descadastro só vale no clique.
export default async function DescadastroPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  return <Descadastro token={t ?? ""} />;
}
