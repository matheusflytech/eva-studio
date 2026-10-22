"use client";

import * as React from "react";
import { ImageUp, LogOut, Copy, Check } from "lucide-react";
import { useRouter, useSearchParams, usePathname } from "@/lib/contrato/navegacao";
import { useAuth } from "@/lib/auth/auth-context";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AbaMembros } from "@/components/configuracoes/aba-membros";
import { AbaPapeis } from "@/components/configuracoes/aba-papeis";
import { AbaGrupos } from "@/components/configuracoes/aba-grupos";
import { AbaEquipes } from "@/components/configuracoes/aba-equipes";
import { ApiKeysPanel } from "@/components/integrations/api-keys-panel";
import { AbaLixeira } from "@/components/configuracoes/aba-lixeira";
import { AbaCanais } from "@/components/configuracoes/aba-canais";
import { CanvasThemeSwitch, ThemeChooser } from "@/components/ui/theme";

const ABAS = [
  { id: "contrato", rotulo: "Contrato" },
  { id: "conta", rotulo: "Sua conta" },
  { id: "canais", rotulo: "Canais" },
  { id: "membros", rotulo: "Membros" },
  { id: "papeis", rotulo: "Papéis e permissões" },
  { id: "grupos", rotulo: "Grupos" },
  { id: "equipes", rotulo: "Equipes" },
  { id: "chaves", rotulo: "Chaves de API" },
  { id: "lixeira", rotulo: "Lixeira" },
] as const;

function IdDoContrato({ id }: { id: string }) {
  const [copiado, setCopiado] = React.useState(false);
  return (
    <div>
      <Label>ID do contrato</Label>
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate rounded-xl border border-border-default bg-surface-3 px-3.5 py-2.5 font-mono text-[13px] text-text-primary">
          {id}
        </code>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          aria-label="Copiar o ID do contrato"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(id);
              setCopiado(true);
              setTimeout(() => setCopiado(false), 1500);
            } catch {
              /* sem área de transferência */
            }
          }}
        >
          {copiado ? <Check size={15} className="text-success" /> : <Copy size={15} />}
        </Button>
      </div>
      <p className="mt-1 text-[12px] text-text-tertiary">É o que aparece na URL e o que o suporte da Eva pede para achar seu contrato.</p>
    </div>
  );
}

function AbaContrato() {
  const { session, updateOrgName, updateOrgLogo } = useAuth();
  const [orgName, setOrgName] = React.useState(session?.orgName ?? "");
  const [saved, setSaved] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const podeEditar = session?.permissoes?.includes("contrato:gerenciar") ?? false;

  React.useEffect(() => {
    setOrgName(session?.orgName ?? "");
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

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle>Contrato</CardTitle>
          <CardDescription>Nome e imagem exibidos no menu. Cada cliente é um contrato, com os próprios dados.</CardDescription>
        </CardHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            updateOrgName(orgName.trim());
            flashSaved("org");
          }}
          className="flex flex-col gap-4"
        >
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
            {podeEditar && (
              <Button type="button" variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
                <ImageUp size={14} /> Alterar imagem
              </Button>
            )}
          </div>
          {session?.contratoId && <IdDoContrato id={session.contratoId} />}
          <div>
            <Label htmlFor="org-name">Nome do contrato</Label>
            <Input id="org-name" value={orgName} disabled={!podeEditar} onChange={(e) => setOrgName(e.target.value)} />
          </div>
          {podeEditar && (
            <div className="flex items-center gap-3">
              <Button type="submit" size="sm">
                Salvar
              </Button>
              {saved === "org" && <span className="text-[12.5px] text-text-tertiary">Salvo.</span>}
            </div>
          )}
        </form>
      </Card>

    </div>
  );
}

/**
 * O que é da pessoa, não do contrato: nome, aparência e sessão. Tema e canvas
 * ficam salvos neste navegador (como o resto das preferências de tela).
 */
function AbaConta() {
  const router = useRouter();
  const { session, updateUserName, logOut } = useAuth();
  const [userName, setUserName] = React.useState(session?.name ?? "");
  const [saved, setSaved] = React.useState<string | null>(null);
  // Sessão carregou (ou o nome mudou em outra aba): o campo acompanha.
  // Ajuste durante a renderização, sem efeito (react.dev: "You might not need an effect").
  const [nomeDaSessao, setNomeDaSessao] = React.useState(session?.name);
  if (session?.name !== nomeDaSessao) {
    setNomeDaSessao(session?.name);
    setUserName(session?.name ?? "");
  }

  function flashSaved(label: string) {
    setSaved(label);
    setTimeout(() => setSaved(null), 2000);
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle>Sua conta</CardTitle>
          <CardDescription>
            Vale para todos os seus contratos.{session?.papelNome ? ` Neste contrato você é: ${session.papelNome}.` : ""}
          </CardDescription>
        </CardHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            updateUserName(userName.trim());
            flashSaved("account");
          }}
          className="flex flex-col gap-4"
        >
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
          <CardTitle>Aparência</CardTitle>
          <CardDescription>Vale só neste navegador. O menu lateral continua escuro nos dois temas.</CardDescription>
        </CardHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Tema</Label>
            <ThemeChooser className="self-start" />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="canvas-sempre-escuro" className="mb-0">Canvas do builder sempre escuro</Label>
              <p className="text-caption text-text-tertiary">Desligado, o canvas acompanha o tema.</p>
            </div>
            <CanvasThemeSwitch />
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sessão</CardTitle>
          <CardDescription>Encerrar o acesso neste dispositivo.</CardDescription>
        </CardHeader>
        <Button
          type="button"
          variant="danger"
          size="md"
          onClick={() => {
            logOut();
            router.push("/login");
          }}
          className="self-start"
        >
          <LogOut size={15} /> Sair da conta
        </Button>
      </Card>
    </div>
  );
}

function Configuracoes() {
  const router = useRouter();
  const pathname = usePathname();
  const pedida = useSearchParams().get("aba");
  const aba = ABAS.some((a) => a.id === pedida) ? (pedida as string) : "contrato";
  const { session } = useAuth();
  const podeGerenciar = session?.permissoes?.includes("membros:gerenciar") ?? false;

  return (
    <div className="flex-1 p-4 sm:p-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-5 pb-10">
        <div>
          <h1 className="font-display text-xl font-semibold text-text-primary">Configurações</h1>
          <p className="mt-1 text-[13px] text-text-secondary">Contrato, sua conta e aparência, os canais de atendimento, quem participa, o que cada um pode fazer, as chaves de API e a lixeira.</p>
        </div>

        {/* A aba fica na URL: dá para mandar o link "aba de membros" a alguém. */}
        <Tabs value={aba} onValueChange={(v) => router.replace(`${pathname}?aba=${v}`)}>
          <div className="overflow-x-auto">
            <TabsList>
              {ABAS.map((a) => (
                <TabsTrigger key={a.id} value={a.id}>
                  {a.rotulo}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <TabsContent value="contrato" className="mt-5">
            <AbaContrato />
          </TabsContent>
          <TabsContent value="conta" className="mt-5">
            <AbaConta />
          </TabsContent>
          <TabsContent value="canais" className="mt-5">
            <AbaCanais />
          </TabsContent>
          <TabsContent value="membros" className="mt-5">
            <AbaMembros />
          </TabsContent>
          <TabsContent value="papeis" className="mt-5">
            <AbaPapeis podeGerenciar={podeGerenciar} />
          </TabsContent>
          <TabsContent value="grupos" className="mt-5">
            <AbaGrupos podeGerenciar={podeGerenciar} />
          </TabsContent>
          <TabsContent value="equipes" className="mt-5">
            <AbaEquipes podeGerenciar={podeGerenciar} />
          </TabsContent>
          <TabsContent value="chaves" className="mt-5">
            <ApiKeysPanel />
          </TabsContent>
          <TabsContent value="lixeira" className="mt-5">
            <AbaLixeira />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export default function ConfiguracoesPage() {
  // useSearchParams exige Suspense: sem ele o Next recusa gerar a página.
  return (
    <React.Suspense fallback={<div className="flex-1 p-8" />}>
      <Configuracoes />
    </React.Suspense>
  );
}
