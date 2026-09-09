"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import type { Session } from "@/lib/data/types";

type AuthResult = { ok: true } | { ok: false; error: string };

interface AuthContextValue {
  session: Session | null;
  isLoading: boolean;
  signUp: (input: { name: string; email: string; password: string; orgName: string }) => Promise<AuthResult>;
  logIn: (input: { email: string; password: string }) => Promise<AuthResult>;
  logOut: () => void;
  updateOrgLogo: (dataUrl: string) => void;
  updateOrgName: (orgName: string) => void;
  updateUserName: (name: string) => void;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

async function fetchSession(): Promise<Session | null> {
  const res = await fetch("/api/me");
  const data = await res.json();
  return data.session ?? null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    fetchSession()
      .then(setSession)
      .finally(() => setIsLoading(false));
  }, []);

  const signUp: AuthContextValue["signUp"] = async (input) => {
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error ?? "Não foi possível criar a conta." };
    setSession(await fetchSession());
    return { ok: true };
  };

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
      value={{ session, isLoading, signUp, logIn, logOut, updateOrgLogo, updateOrgName, updateUserName }}
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
