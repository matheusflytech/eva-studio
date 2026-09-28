import "server-only";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

declare global {
  // eslint-disable-next-line no-var
  var __evaStudioPrisma: PrismaClient | undefined;
}

/**
 * O app fala com o pooler em modo TRANSAÇÃO, sempre.
 *
 * O Supavisor do Supabase atende os dois modos em portas diferentes: 5432 é
 * modo sessão (cada cliente segura uma conexão do Postgres pra vida inteira,
 * teto de 15) e 6543 é modo transação (multiplexa, teto muito maior). Função
 * serverless com modo sessão é combinação que não fecha: cada instância viva
 * reserva conexão, e a partir da sexta instância TODA rota que toca o banco
 * responde 500 com EMAXCONNSESSION. Foi o que derrubou a produção em
 * 28/09/2026, e não é um caso raro — é o comportamento esperado.
 *
 * Por isso a porta é corrigida aqui em vez de depender de alguém lembrar de
 * configurar certo: é a recomendação da própria Supabase pra serverless, e o
 * custo de errar é o app inteiro fora do ar. Migração continua indo pela
 * conexão direta (DIRECT_URL, ver prisma.config.ts), que precisa de sessão.
 *
 * Pra desligar: DATABASE_FORCE_POOL_TRANSACAO=false.
 */
function urlDoPooler(bruta: string): string {
  if (process.env.DATABASE_FORCE_POOL_TRANSACAO === "false") return bruta;
  try {
    const u = new URL(bruta);
    if (u.hostname.includes("pooler.supabase.com") && u.port === "5432") {
      u.port = "6543";
      return u.toString();
    }
  } catch {
    // URL malformada não é problema deste helper: deixa o driver reclamar.
  }
  return bruta;
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
    connectionString: urlDoPooler(process.env.DATABASE_URL!),
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
