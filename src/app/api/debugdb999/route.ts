import { NextResponse } from "next/server";

export async function GET() {
  try {
    const { prisma } = await import("@/lib/db/prisma");
    const agents = await prisma.agent.findMany({ select: { id: true, name: true, widgetEnabled: true } });
    const target = await prisma.agent.findUnique({ where: { id: "9b9c6392-6cc0-4093-847a-9589b525e51d" } });
    let advanceResult: unknown = null;
    let advanceError: string | null = null;
    try {
      const { advanceConversation } = await import("@/lib/server/flow-engine");
      advanceResult = await advanceConversation({
        agentId: "9b9c6392-6cc0-4093-847a-9589b525e51d",
        channel: "website",
        contactId: "debugdb999_test",
        text: undefined,
        optionId: undefined,
        lang: undefined,
      });
    } catch (e2: unknown) {
      const err2 = e2 as Error;
      advanceError = (err2?.message || String(e2)) + "\n" + String(err2?.stack).slice(0, 1500);
    }
    return NextResponse.json({ ok: true, agents, target, advanceResult, advanceError });
  } catch (e: unknown) {
    const err = e as Error;
    return NextResponse.json(
      { ok: false, error: err?.message, stack: String(err?.stack).slice(0, 2000) },
      { status: 500 }
    );
  }
}
