import { config } from "dotenv";
import { defineConfig } from "prisma/config";

config({ path: ".env.local" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // DIRECT_URL, não DATABASE_URL: migração abre transação longa e cria tipo,
    // o que o pooler em modo transação não aguenta. O app usa o pooler; a
    // migração fala direto com o banco.
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
  },
});
