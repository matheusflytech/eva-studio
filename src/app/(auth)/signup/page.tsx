"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";
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
    router.push("/contratos");
  }

  return (
    <div className="flex flex-col text-left">
      <h1 className="text-title font-semibold tracking-tight text-text-primary">Criar conta</h1>
      <p className="mt-1 text-small text-text-secondary">Comece a criar agentes em minutos.</p>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3 text-left">
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

        {error && <p className="text-small text-danger">{error}</p>}

        <Button type="submit" size="lg" disabled={isSubmitting} className="mt-3 h-11 w-full bg-[#f2f2f4] text-body font-semibold text-[#0a0a0b] shadow-[0_8px_24px_rgba(255,255,255,0.08)] hover:bg-white">
          {isSubmitting ? "Criando..." : "Criar conta"}
        </Button>
      </form>

      <p className="mt-5 text-small text-text-tertiary">
        Já tem conta?{" "}
        <Link href="/login" className="font-medium text-text-primary hover:underline">
          Entrar
        </Link>
      </p>
    </div>
  );
}
