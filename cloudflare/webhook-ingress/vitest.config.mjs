// Testes rodam dentro do workerd (o mesmo runtime da Cloudflare), via plugin
// oficial. Arquivo .mjs de propósito: o tsconfig da raiz do app inclui
// "**/*.ts" e "**/*.mts", e não deve tentar checar a configuração do Worker.
import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
    }),
  ],
  test: {
    include: ["test/**/*.test.ts"],
  },
});
