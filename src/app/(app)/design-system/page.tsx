import type { Metadata } from "next";
import { Vitrine } from "@/components/design-system/vitrine";

export const metadata: Metadata = {
  title: "Design system · Eva",
};

// Página viva do design system: tokens, componentes e dois exemplos de tela.
// Só leitura e com dados fictícios (ver components/design-system/dados-ficticios.ts).
export default function DesignSystemPage() {
  return <Vitrine />;
}
