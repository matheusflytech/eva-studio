"use client";

import * as React from "react";
import { ImageUp, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function ConfiguracoesPage() {
  const router = useRouter();
  const { session, updateOrgName, updateUserName, updateOrgLogo, logOut } = useAuth();
  const [orgName, setOrgName] = React.useState(session?.orgName ?? "");
  const [userName, setUserName] = React.useState(session?.name ?? "");
  const [saved, setSaved] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setOrgName(session?.orgName ?? "");
    setUserName(session?.name ?? "");
  }, [session]);

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") updateOrgLogo(reader.result);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function flashSaved(label: string) {
    setSaved(label);
    setTimeout(() => setSaved(null), 2000);
  }

  function handleSaveOrg(e: React.FormEvent) {
    e.preventDefault();
    updateOrgName(orgName.trim());
    flashSaved("org");
  }

  function handleSaveAccount(e: React.FormEvent) {
    e.preventDefault();
    updateUserName(userName.trim());
    flashSaved("account");
  }

  function handleLogout() {
    logOut();
    router.push("/login");
  }

  return (
    <div className="flex-1 p-8">
      <div className="mx-auto flex max-w-2xl flex-col gap-5 pb-10">
        <div>
          <h1 className="font-display text-xl font-semibold text-text-primary">Configurações</h1>
          <p className="mt-1 text-[13px] text-text-secondary">Preferências da organização e da sua conta.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Organização</CardTitle>
            <CardDescription>Nome e imagem exibidos na barra lateral.</CardDescription>
          </CardHeader>
          <form onSubmit={handleSaveOrg} className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-ice text-[16px] font-bold text-bg-base">
                {session?.orgLogoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={session.orgLogoUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  orgName.charAt(0).toUpperCase()
                )}
              </span>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
              <Button type="button" variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
                <ImageUp size={14} /> Alterar imagem
              </Button>
            </div>
            <div>
              <Label htmlFor="org-name">Nome da organização</Label>
              <Input id="org-name" value={orgName} onChange={(e) => setOrgName(e.target.value)} />
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" size="sm">
                Salvar
              </Button>
              {saved === "org" && <span className="text-[12.5px] text-text-tertiary">Salvo.</span>}
            </div>
          </form>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sua conta</CardTitle>
            <CardDescription>Informações de identificação da sua conta.</CardDescription>
          </CardHeader>
          <form onSubmit={handleSaveAccount} className="flex flex-col gap-4">
            <div>
              <Label htmlFor="user-name">Nome</Label>
              <Input id="user-name" value={userName} onChange={(e) => setUserName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="user-email">E-mail</Label>
              <Input id="user-email" value={session?.email ?? ""} disabled />
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" size="sm">
                Salvar
              </Button>
              {saved === "account" && <span className="text-[12.5px] text-text-tertiary">Salvo.</span>}
            </div>
          </form>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sessão</CardTitle>
            <CardDescription>Encerrar o acesso neste dispositivo.</CardDescription>
          </CardHeader>
          <Button type="button" variant="danger" size="md" onClick={handleLogout} className="self-start">
            <LogOut size={15} /> Sair da conta
          </Button>
        </Card>
      </div>
    </div>
  );
}
