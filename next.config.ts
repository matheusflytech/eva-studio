import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O leitor de PDF carrega um arquivo auxiliar (pdf.worker) pelo caminho de
  // node_modules. Embutido no bundle ele não acha esse arquivo e a extração
  // falha; como pacote externo, o Node resolve normalmente.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
