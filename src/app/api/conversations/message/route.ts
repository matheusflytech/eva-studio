import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireOrgId } from "@/lib/auth/require-org";
import { advanceConversation } from "@/lib/server/flow-engine";

// Dois jeitos de chamar essa rota:
// 1) O worker do WhatsApp / webhook da Meta (processos externos, sem sessão
//    de usuário) — autenticam com o header X-Internal-Secret.
// 2) O Playground, de dentro do navegador de um usuário logado — autentica
//    com o cookie de sessão normal (Supabase), como qualquer outra rota.
async function authorize(request: Request, agentId: string): Promise<boolean> {
  const secretHeader = request.headers.get("x-internal-secret");
  const expected = process.env.INTERNAL_API_SECRET;
  if (expected && secretHeader === expected) return true;

  const orgId = await requireOrgId();
  if (!orgId) return false;
  const agent = await prisma.agent.findFirst({ where: { id: agentId, orgId } });
  return !!agent;
}

export async function POST(request: Request) {
  const body = await request.json();
  const { agentId, channel, contactId, text, optionId } = body ?? {};

  if (!agentId || !channel || !contactId) {
    return NextResponse.json({ error: "agentId, channel e contactId são obrigatórios." }, { status: 400 });
  }

  if (!(await authorize(request, agentId))) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const result = await advanceConversation({ agentId, channel, contactId, text, optionId });
  return NextResponse.json(result);
}
