"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { contratoDoCaminho } from "@/lib/contrato/rotas";
import type { Session } from "@/lib/data/types";

type AuthResult = { ok: true } | { ok: false; error: string };

interface AuthContextValue {
  session: Session | null;
  isLoading: boolean;
  logIn: (input: { email: string; password: string }) => Promise<AuthResult>;
  logOut: () => void;
  updateOrgLogo: (dataUrl: string) => void;
  updateOrgName: (orgName: string) => void;
  updateUserName: (name: string) => void;
  /** Contrato da URL para o qual a sessão atual foi buscada. */
  sessaoDoContrato: string | null | undefined;
  /** Relê a sessão (ex.: depois de criar contrato no /admin). */
  refresh: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

// O /api/me recebe o contrato da URL pelo cabeçalho que o fetch do app põe
// (src/lib/contrato/fetch-do-app.ts) e devolve o papel/permissões daquele
// contrato.
async function fetchSession(): Promise<Session | null> {
  const res = await fetch("/api/me");
  const data = await res.json();
  return data.session ?? null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  // Trocou de contrato na URL: a sessão (nome, papel, permissões) é outra.
  const contratoDaUrl = contratoDoCaminho(usePathname());
  // Só a resposta mais recente vale: trocar de contrato rápido não pode deixar
  // a sessão do contrato anterior chegar por último e ficar na tela.
  const pedido = React.useRef(0);

  // Para qual contrato da URL a sessão atual foi buscada (o layout espera a
  // sessão certa antes de desenhar, inclusive o aviso de "sem acesso").
  const [sessaoDoContrato, setSessaoDoContrato] = React.useState<string | null | undefined>(undefined);
  const urlAtual = React.useRef(contratoDaUrl);

  const refresh = React.useCallback(async () => {
    const meu = ++pedido.current;
    const para = urlAtual.current;
    try {
      const s = await fetchSession();
      if (meu === pedido.current) {
        setSession(s);
        setSessaoDoContrato(para);
      }
    } finally {
      if (meu === pedido.current) setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    urlAtual.current = contratoDaUrl;
    refresh();
  }, [contratoDaUrl, refresh]);

  const logIn: AuthContextValue["logIn"] = async ({ email, password }) => {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, error: "E-mail ou senha incorretos." };
    setSession(await fetchSession());
    return { ok: true };
  };

  const logOut = () => {
    const supabase = createClient();
    supabase.auth.signOut();
    setSession(null);
  };

  async function patchMe(body: Record<string, unknown>) {
    const res = await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.session) setSession(data.session);
  }

  const updateOrgLogo = (dataUrl: string) => {
    patchMe({ orgLogoUrl: dataUrl });
  };

  const updateOrgName = (orgName: string) => {
    patchMe({ orgName });
  };

  const updateUserName = (name: string) => {
    patchMe({ name });
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        isLoading,
        sessaoDoContrato,
        logIn,
        logOut,
        updateOrgLogo,
        updateOrgName,
        updateUserName,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
