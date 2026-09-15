import { NextResponse } from "next/server";

export async function GET() {
  try {
    const { prisma } = await import("@/lib/db/prisma");
    const count = await prisma.agent.count();
    return NextResponse.json({ ok: true, count, hasDbUrl: !!process.env.DATABASE_URL, hasDirectUrl: !!process.env.DIRECT_URL });
  } catch (e: unknown) {
    const err = e as Error;
    return NextResponse.json(
      { ok: false, error: err?.message, stack: String(err?.stack).slice(0, 2000), hasDbUrl: !!process.env.DATABASE_URL, hasDirectUrl: !!process.env.DIRECT_URL },
      { status: 500 }
    );
  }
}
