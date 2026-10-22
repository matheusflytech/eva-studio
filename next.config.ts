import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O leitor de PDF carrega um arquivo auxiliar (pdf.worker) pelo caminho de
  // node_modules. Embutido no bundle ele não acha esse arquivo e a extração
  // falha; como pacote externo, o Node resolve normalmente.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
  turbopack: {
    root: __dirname,
  },
  // Troca de tela com a View Transitions API (a tela antiga sai com desfoque,
  // a nova entra em cascata). Ver docs/design/PLANO-v6.md.
  experimental: {
    viewTransition: true,
  },
};

export default nextConfig;
