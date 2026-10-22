import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { THEME_INIT_SCRIPT } from "@/lib/design-system/theme";

// Inter na interface; Plus Jakarta Sans (identidade da Eva) só em título de
// página e número grande; JetBrains Mono no rótulo "eyebrow" e em código (ver
// docs/design-system.md). Sem `weight`, o next/font baixa o arquivo variável.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Eva",
  description: "Crie e configure agentes de IA sem escrever código.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: o script do <head> grava data-theme antes do
    // React hidratar; o atributo diferente do HTML do servidor é esperado.
    <html
      lang="pt-BR"
      className={`${inter.variable} ${jakarta.variable} ${jetbrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
