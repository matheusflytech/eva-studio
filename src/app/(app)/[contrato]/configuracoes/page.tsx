"use client";

import * as React from "react";
import {
  Building2,
  Check,
  Contact,
  Copy,
  ImageUp,
  KeyRound,
  Lock,
  LogOut,
  MessagesSquare,
  Trash2,
  UserRound,
  Users,
  UsersRound,
} from "lucide-react";
import { useRouter, useSearchParams, usePathname } from "@/lib/contrato/navegacao";
import { useAuth } from "@/lib/auth/auth-context";
import { useBuscaGlobal } from "@/components/busca/paleta-de-busca";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Select } from "@/components/ui/select";
import { focusRing } from "@/components/ui/styles";
import { AbaMembros } from "@/components/configuracoes/aba-membros";
import { AbaPapeis } from "@/components/configuracoes/aba-papeis";
import { AbaGrupos } from "@/components/configuracoes/aba-grupos";
import { AbaEquipes } from "@/components/configuracoes/aba-equipes";
import { ApiKeysPanel } from "@/components/integrations/api-keys-panel";
import { AbaLixeira } from "@/components/configuracoes/aba-lixeira";
import { AbaCanais } from "@/components/configuracoes/aba-canais";
import { EscolhaDeCanvas, EscolhaDeTema } from "@/components/configuracoes/aparencia";
import { CabecalhoDaSecao, LinhaDeConfig, RodapeDaSecao } from "@/components/configuracoes/secao";
import { pulsar } from "@/lib/fundo/eventos";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Configurações (v5): as nove abas viram um menu de seções à esquerda, em
// grupos (Contrato, Pessoas e acesso, Você, Dados). A seção continua na URL
// (?aba=conta, ?aba=membros...): o menu do usuário e outros links dependem
// disso. Cada seção é feita de linhas "rótulo + descrição | campo", sem
// formulário dentro de cartão.
// ---------------------------------------------------------------------------

type IdDaAba = "contrato" | "conta" | "canais" | "membros" | "papeis" | "grupos" | "equipes" | "chaves" | "lixeira";

const GRUPOS: { rotulo: string; abas: { id: IdDaAba; rotulo: string; icone: React.ReactNode }[] }[] = [
  {
    rotulo: "Contrato",
    abas: [
      { id: "contrato", rotulo: "Contrato", icone: <Building2 /> },
      { id: "canais", rotulo: "Canais", icone: <MessagesSquare /> },
      { id: "chaves", rotulo: "Chaves de API", icone: <KeyRound /> },
    ],
  },
  {
    rotulo: "Pessoas e acesso",
    abas: [
      { id: "membros", rotulo: "Membros", icone: <Users /> },
      { id: "papeis", rotulo: "Papéis e permissões", icone: <Lock /> },
      { id: "grupos", rotulo: "Grupos", icone: <Contact /> },
      { id: "equipes", rotulo: "Equipes", icone: <UsersRound /> },
    ],
  },
  { rotulo: "Você", abas: [{ id: "conta", rotulo: "Sua conta", icone: <UserRound /> }] },
  { rotulo: "Dados", abas: [{ id: "lixeira", rotulo: "Lixeira", icone: <Trash2 /> }] },
];
const ABAS = GRUPOS.flatMap((g) => g.abas);

function IdDoContrato({ id }: { id: string }) {
  const [copiado, setCopiado] = React.useState(false);
  return (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-[10px] bg-raised px-2.5 py-1.5 font-mono text-small text-text-primary ring-1 ring-inset ring-border-subtle">
        {id}
      </code>
      <IconButton
        variant="secondary"
        aria-label="Copiar o ID do contrato"
        tooltip={copiado ? "Copiado" : "Copiar"}
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
        {copiado ? <Check className="text-success" /> : <Copy />}
      </IconButton>
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

  const mudou = orgName.trim() !== (session?.orgName ?? "");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        updateOrgName(orgName.trim());
        flashSaved("org");
        pulsar(e.currentTarget.querySelector("[type=submit]"), 1.2);
      }}
    >
      <CabecalhoDaSecao titulo="Contrato" descricao="Nome e imagem exibidos no menu. Cada cliente é um contrato, com os próprios dados." />
      <LinhaDeConfig rotulo="Imagem do contrato" descricao="Aparece no menu lateral e no seletor de contratos.">
        <div className="flex items-center gap-4">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[16px] bg-inverse text-title font-semibold text-inverse-fg">
            {session?.orgLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={session.orgLogoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              orgName.charAt(0).toUpperCase()
            )}
          </span>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
          {podeEditar && (
            <Button type="button" variant="secondary" onClick={() => fileInputRef.current?.click()}>
              <ImageUp size={14} aria-hidden="true" /> Alterar imagem
            </Button>
          )}
        </div>
      </LinhaDeConfig>
      <LinhaDeConfig rotulo="Nome do contrato" htmlFor="org-name" descricao={podeEditar ? undefined : "Só quem gerencia o contrato muda o nome."}>
        <Input id="org-name" value={orgName} disabled={!podeEditar} onChange={(e) => setOrgName(e.target.value)} className="max-w-md" />
      </LinhaDeConfig>
      {session?.contratoId && (
        <LinhaDeConfig rotulo="ID do contrato" descricao="É o que aparece na URL e o que o suporte da Eva pede para achar seu contrato.">
          <div className="max-w-md">
            <IdDoContrato id={session.contratoId} />
          </div>
        </LinhaDeConfig>
      )}
      {podeEditar && (
        <RodapeDaSecao mensagem={saved === "org" ? "Salvo." : undefined}>
          <Button type="button" variant="ghost" disabled={!mudou} onClick={() => setOrgName(session?.orgName ?? "")}>
            Cancelar
          </Button>
          <Button type="submit" disabled={!mudou}>
            Salvar
          </Button>
        </RodapeDaSecao>
      )}
    </form>
  );
}

/**
 * O que é da pessoa, não do contrato: nome, aparência e sessão. Tema e canvas
 * ficam salvos neste navegador (como o resto das preferências de tela).
 */
function AbaConta() {
  const router = useRouter();
  const { abrirAtalhos, mac } = useBuscaGlobal();
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

  const mudou = userName.trim() !== (session?.name ?? "");

  return (
    <div className="flex flex-col gap-10">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          updateUserName(userName.trim());
          flashSaved("account");
          pulsar(e.currentTarget.querySelector("[type=submit]"), 1.2);
        }}
      >
        <CabecalhoDaSecao
          titulo="Sua conta"
          descricao={`Vale para todos os seus contratos.${session?.papelNome ? ` Neste contrato você é: ${session.papelNome}.` : ""}`}
        />
        <LinhaDeConfig rotulo="Nome" htmlFor="user-name" descricao="Como o time vê você nas conversas, tarefas e negócios.">
          <Input id="user-name" value={userName} onChange={(e) => setUserName(e.target.value)} className="max-w-md" />
        </LinhaDeConfig>
        <LinhaDeConfig rotulo="E-mail" htmlFor="user-email" descricao="É com ele que você entra. Não dá para trocar aqui.">
          <Input id="user-email" value={session?.email ?? ""} disabled className="max-w-md" />
        </LinhaDeConfig>
        <RodapeDaSecao mensagem={saved === "account" ? "Salvo." : undefined}>
          <Button type="button" variant="ghost" disabled={!mudou} onClick={() => setUserName(session?.name ?? "")}>
            Cancelar
          </Button>
          <Button type="submit" disabled={!mudou}>
            Salvar
          </Button>
        </RodapeDaSecao>
      </form>

      <section aria-labelledby="titulo-aparencia">
        <CabecalhoDaSecao
          nivel={2}
          titulo={<span id="titulo-aparencia">Aparência</span>}
          descricao="Aplica na hora e vale só neste navegador. O menu lateral continua escuro nos dois temas."
        />
        <LinhaDeConfig rotulo="Tema da interface" descricao="Escolha um tema ou siga o do sistema.">
          <EscolhaDeTema />
        </LinhaDeConfig>
        <LinhaDeConfig rotulo="Canvas do builder" descricao="O quadro dos fluxos acompanha o tema ou fica sempre escuro.">
          <EscolhaDeCanvas />
        </LinhaDeConfig>
        <LinhaDeConfig rotulo="Atalhos de teclado" descricao="Busca, navegação e ações sem tirar a mão do teclado.">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
            <kbd className="rounded-[6px] bg-raised px-2 py-0.5 font-mono text-caption text-text-secondary ring-1 ring-inset ring-border-subtle">
              {mac ? "⌘ K" : "Ctrl K"}
            </kbd>
            <span className="text-caption text-text-tertiary">buscar</span>
            <kbd className="ml-2.5 rounded-[6px] bg-raised px-2 py-0.5 font-mono text-caption text-text-secondary ring-1 ring-inset ring-border-subtle">?</kbd>
            <span className="text-caption text-text-tertiary">ver todos</span>
            <Button type="button" variant="secondary" size="sm" className="ml-auto" onClick={abrirAtalhos}>
              Ver atalhos
            </Button>
          </div>
        </LinhaDeConfig>
        <LinhaDeConfig rotulo="Sessão" descricao="Encerrar o acesso neste dispositivo.">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              logOut();
              router.push("/login");
            }}
            className="text-danger hover:text-danger"
          >
            <LogOut size={14} aria-hidden="true" /> Sair da conta
          </Button>
        </LinhaDeConfig>
      </section>
    </div>
  );
}

function Configuracoes() {
  const router = useRouter();
  const pathname = usePathname();
  const pedida = useSearchParams().get("aba");
  const aba: IdDaAba = ABAS.find((a) => a.id === pedida)?.id ?? "contrato";
  const { session } = useAuth();
  const podeGerenciar = session?.permissoes?.includes("membros:gerenciar") ?? false;
  // A seção fica na URL: dá para mandar o link "aba de membros" a alguém.
  const irPara = (v: string) => router.replace(`${pathname}?aba=${v}`);

  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 pb-6 pt-1 md:flex-row md:gap-8 lg:px-6">
      {/* Seções agrupadas à esquerda; no celular, um seletor só. */}
      <div className="pb-4 md:hidden">
        <Select aria-label="Seção das configurações" value={aba} onChange={(e) => irPara(e.target.value)}>
          {GRUPOS.map((g) => (
            <optgroup key={g.rotulo} label={g.rotulo}>
              {g.abas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.rotulo}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </div>
      <nav aria-label="Configurações" className="hidden w-[210px] shrink-0 flex-col gap-px border-r border-border-subtle pr-3 md:flex">
        {GRUPOS.map((g, gi) => (
          <div key={g.rotulo} className="flex flex-col gap-px">
            <p className={cn("px-2.5 pb-1.5 font-mono text-caption text-text-tertiary", gi === 0 ? "pt-1" : "pt-3")}>{g.rotulo}</p>
            {g.abas.map((a) => {
              const ativa = a.id === aba;
              return (
                <button
                  key={a.id}
                  type="button"
                  aria-current={ativa ? "page" : undefined}
                  onClick={() => irPara(a.id)}
                  className={cn(
                    "flex h-8 items-center gap-2.5 rounded-[10px] px-2.5 text-left text-small transition-colors [&_svg]:size-[15px]",
                    ativa
                      ? "bg-hover text-text-primary [&_svg]:text-text-primary"
                      : "text-text-secondary hover:bg-raised hover:text-text-primary [&_svg]:text-text-tertiary",
                    focusRing
                  )}
                >
                  {a.icone}
                  <span className="truncate">{a.rotulo}</span>
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="min-w-0 flex-1 pb-10 md:pt-1">
        <div className={cn("w-full", aba === "lixeira" || aba === "papeis" ? "max-w-5xl" : "max-w-3xl")}>
          {aba === "contrato" && <AbaContrato />}
          {aba === "conta" && <AbaConta />}
          {aba === "canais" && <AbaCanais />}
          {aba === "membros" && <AbaMembros />}
          {aba === "papeis" && <AbaPapeis podeGerenciar={podeGerenciar} />}
          {aba === "grupos" && <AbaGrupos podeGerenciar={podeGerenciar} />}
          {aba === "equipes" && <AbaEquipes podeGerenciar={podeGerenciar} />}
          {aba === "chaves" && <ApiKeysPanel />}
          {aba === "lixeira" && <AbaLixeira />}
        </div>
      </div>
    </div>
  );
}

export default function ConfiguracoesPage() {
  // useSearchParams exige Suspense: sem ele o Next recusa gerar a página.
  return (
    <React.Suspense fallback={<div className="flex-1" />}>
      <Configuracoes />
    </React.Suspense>
  );
}
