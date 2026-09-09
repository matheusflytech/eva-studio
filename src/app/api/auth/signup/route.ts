import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db/prisma";

export async function POST(request: Request) {
  const { name, email, password, orgName } = await request.json();

  if (!name || !email || !password || !orgName) {
    return NextResponse.json({ error: "Preencha todos os campos." }, { status: 400 });
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
