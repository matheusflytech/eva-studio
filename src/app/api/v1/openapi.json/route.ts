import { NextResponse } from "next/server";
import { montarOpenApi } from "@/lib/api-v1-openapi";

// GET /api/v1/openapi.json — referência pública (sem chave): é só a descrição
// dos endpoints, nenhum dado de organização.
export async function GET(request: Request) {
  const origem = new URL(request.url).origin;
  return NextResponse.json(montarOpenApi(`${origem}/api/v1`), {
    headers: { "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" },
  });
}
