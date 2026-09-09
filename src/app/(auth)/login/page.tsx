"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const router = useRouter();
  const { logIn } = useAuth();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    const result = await logIn({ email, password });
    setIsSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push("/inicio");
  }

  return (
    <Card className="glass-card">
      <h1 className="font-display text-xl font-semibold text-text-primary">Entrar</h1>
      <p className="mt-1 text-sm text-text-secondary">Acesse seu painel de agentes.</p>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
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

        {error && <p className="text-[13px] text-danger">{error}</p>}

        <Button type="submit" size="lg" disabled={isSubmitting} className="mt-2 w-full">
          {isSubmitting ? "Entrando..." : "Entrar"}
        </Button>
      </form>

      <p className="mt-6 text-center text-[13px] text-text-secondary">
        Ainda não tem conta?{" "}
        <Link href="/signup" className="font-medium text-accent-400 hover:text-accent-500">
          Criar conta
        </Link>
      </p>
    </Card>
  );
}
