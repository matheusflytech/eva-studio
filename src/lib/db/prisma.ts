import "server-only";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

declare global {
  // eslint-disable-next-line no-var
  var __evaStudioPrisma: PrismaClient | undefined;
}

function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  return new PrismaClient({ adapter });
}

export const prisma = global.__evaStudioPrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.__evaStudioPrisma = prisma;
}
