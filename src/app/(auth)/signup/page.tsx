"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function SignupPage() {
  const router = useRouter();
  const { signUp } = useAuth();
  const [name, setName] = React.useState("");
  const [orgName, setOrgName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    const result = await signUp({ name, email, password, orgName });
    setIsSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push("/inicio");
  }

  return (
    <Card className="glass-card">
      <h1 className="font-display text-xl font-semibold text-text-primary">Criar conta</h1>
      <p className="mt-1 text-sm text-text-secondary">Comece a criar agentes em minutos.</p>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <div>
          <Label htmlFor="name">Seu nome</Label>
          <Input
            id="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Matheus Paes"
          />
        </div>
        <div>
          <Label htmlFor="orgName">Nome da organização</Label>
          <Input
            id="orgName"
            required
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            placeholder="Minha Empresa"
          />
        </div>
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
            minLength={4}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>

        {error && <p className="text-[13px] text-danger">{error}</p>}

        <Button type="submit" size="lg" disabled={isSubmitting} className="mt-2 w-full">
          {isSubmitting ? "Criando..." : "Criar conta"}
        </Button>
      </form>

      <p className="mt-6 text-center text-[13px] text-text-secondary">
        Já tem conta?{" "}
        <Link href="/login" className="font-medium text-accent-400 hover:text-accent-500">
          Entrar
        </Link>
      </p>
    </Card>
  );
}
