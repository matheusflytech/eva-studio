import "server-only";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

declare global {
  // eslint-disable-next-line no-var
  var __evaStudioPrisma: PrismaClient | undefined;
}

function createPrismaClient() {
  // ---------------------------------------------------------------------
  // Teto de conexões por instância.
  //
  // O node-postgres abre até 10 conexões por pool. Numa função serverless
  // isso é desperdício e é perigoso: a função atende uma requisição por vez,
  // mas cada instância reserva dez lugares. Com o pooler do Supabase em modo
  // sessão (limite de 15), duas instâncias vivas ao mesmo tempo já estouram,
  // e a partir daí qualquer rota responde 500 com EMAXCONNSESSION — que foi o
  // que aconteceu com a conexão do Instagram.
  //
  // Três é folga suficiente para as consultas em Promise.all que existem no
  // app (a tela de agentes faz sete de uma vez, mas o Prisma as enfileira no
  // mesmo pool sem precisar de uma conexão por consulta).
  //
  // O DATABASE_URL deve apontar para a porta 6543 (modo transação), onde o
  // pooler multiplexa. A 5432 é modo sessão e existe para migração.
  // ---------------------------------------------------------------------
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
    max: Number(process.env.DATABASE_POOL_MAX ?? 3),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
  return new PrismaClient({ adapter });
}

export const prisma = global.__evaStudioPrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.__evaStudioPrisma = prisma;
}
