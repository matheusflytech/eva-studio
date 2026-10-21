import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { rotaV1 } from "@/lib/server/api-v1/rota";

// GET /api/v1/me — quem é esta chave. O node do n8n testa a credencial aqui.
export const GET = rotaV1({ recurso: null }, async (ctx) => {
  const [org, chave] = await Promise.all([
    prisma.organization.findUnique({ where: { id: ctx.orgId }, select: { id: true, name: true } }),
    prisma.apiKey.findUnique({ where: { id: ctx.keyId }, select: { id: true, name: true, keyPrefix: true } }),
  ]);
  return NextResponse.json({
    data: {
      contract: { id: ctx.orgId, name: org?.name ?? "" },
      api_key: { id: ctx.keyId, name: chave?.name ?? "", prefix: chave?.keyPrefix ?? "", scopes: ctx.scopes },
      api_version: "v1",
    },
  });
});
