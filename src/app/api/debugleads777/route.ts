import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  const rows = await prisma.conversation.findMany({
    where: { channel: "website" },
    select: { contactId: true, agentId: true, leadStage: true, variables: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ count: rows.length, rows });
}
