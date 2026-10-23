"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { pulsar } from "@/lib/fundo/eventos";

export default function LoginPage() {
  const router = useRouter();
  const { logIn } = useAuth();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    pulsar((e.currentTarget as HTMLFormElement).querySelector("button[type=submit]"), 2.2);
    setError(null);
    setIsSubmitting(true);
    const result = await logIn({ email, password });
    setIsSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push("/contratos");
  }

  return (
    <div className="flex flex-col text-left">
      <h1 className="text-title font-semibold tracking-tight text-text-primary">Entrar</h1>
      <p className="mt-1 text-small text-text-secondary">Acesse o painel da Eva Holding.</p>

      {/* O fundo reage quando a pessoa entra num campo. */}
      <form onSubmit={handleSubmit} onFocus={(e) => pulsar(e.target, 0.9)} className="mt-6 flex flex-col gap-3 text-left">
        <div>
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@empresa.com"
          />
        </div>
        <div>
          <Label htmlFor="password">Senha</Label>
          <Input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>

        {error && <p className="text-small text-danger">{error}</p>}

        <Button type="submit" size="lg" disabled={isSubmitting} className="mt-3 h-11 w-full bg-[#f2f2f4] text-body font-semibold text-[#0a0a0b] shadow-[0_8px_24px_rgba(255,255,255,0.08)] hover:bg-white">
          {isSubmitting ? "Entrando..." : "Entrar"}
        </Button>
      </form>

      <p className="mt-5 text-small text-text-tertiary">
        Ainda não tem conta?{" "}
        <Link href="/signup" className="font-medium text-text-primary hover:underline">
          Criar conta
        </Link>
      </p>
    </div>
  );
}
