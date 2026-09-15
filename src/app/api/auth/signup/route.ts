import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db/prisma";
import { checkRateLimit, getClientIp } from "@/lib/server/rate-limit";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  // Registro é aberto — sem rate limit, dá pra criar contas/orgs em massa
  // (abuso, spam de e-mail de confirmação, enumeração). Limita por IP.
  const ip = getClientIp(request);
  const rl = await checkRateLimit(`signup:${ip}`, 5, 3600); // 5/hora por IP
  if (!rl.allowed) {
    return NextResponse.json({ error: "Muitas tentativas. Tente novamente mais tarde." }, { status: 429 });
  }

  const { name, email, password, orgName } = await request.json();

  if (!name || !email || !password || !orgName) {
    return NextResponse.json({ error: "Preencha todos os campos." }, { status: 400 });
  }
  if (typeof email !== "string" || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "E-mail inválido." }, { status: 400 });
  }
  if (typeof password !== "string" || password.length < 8) {
    return NextResponse.json({ error: "A senha precisa ter pelo menos 8 caracteres." }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError || !created.user) {
    const message = createError?.message?.includes("already been registered")
      ? "Já existe uma conta com esse e-mail."
      : createError?.message ?? "Não foi possível criar a conta.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({ data: { name: orgName } });
      await tx.profile.create({
        data: { id: created.user.id, orgId: org.id, name, email },
      });
    });
  } catch (err) {
    await admin.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: "Não foi possível criar a organização." }, { status: 500 });
  }

  const supabase = await createServerSupabaseClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) {
    return NextResponse.json({ error: "Conta criada, mas não foi possível entrar automaticamente." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
