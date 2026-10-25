import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_CONTRATO, destinoDoCaminhoAntigo, ehCaminhoDeSecao } from "@/lib/contrato/rotas";

// Refreshes the Supabase auth cookie on every request so server-side reads
// (Route Handlers, Server Components) never see an expired access token.
// Page-level auth gating stays client-side in AuthProvider/(app)/layout.tsx.
export async function proxy(request: NextRequest) {
  // Caminho antigo (link salvo, e-mail, aviso no banco): sem contrato
  // (/negocios/123 → /<último contrato>/deals/123; o layout do contrato confere
  // o vínculo, o cookie aqui é só sugestão) e/ou com nome em português
  // (/<id>/negocios?funil=2 → /<id>/deals?pipeline=2, /convite → /invite).
  const { pathname, search } = request.nextUrl;
  const antigo = destinoDoCaminhoAntigo(pathname, search, request.cookies.get(COOKIE_CONTRATO)?.value);
  // 308 (permanente) só quando o destino não depende do cookie.
  if (antigo) return NextResponse.redirect(new URL(antigo, request.url), ehCaminhoDeSecao(pathname) ? 307 : 308);

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|jpg|jpeg|gif|webp)$).*)"],
};
