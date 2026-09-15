import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  const rows = await prisma.conversation.findMany({
    where: { channel: "website" },
    select: { contactId: true, agentId: true, leadStage: true, variables: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  var dbHost = "unknown";
  try {
    dbHost = new URL(process.env.DATABASE_URL || "").hostname;
  } catch {}
  const agentCount = await prisma.agent.count();
  const totalConvCount = await prisma.conversation.count();
  return NextResponse.json({ dbHost, agentCount, totalConvCount, count: rows.length, rows });
}
