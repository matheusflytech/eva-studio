"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { idCurto } from "@/lib/contrato/rotas";
import { useContrato } from "@/lib/contrato/navegacao";
import { IconButton } from "@/components/ui/icon-button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// ---------------------------------------------------------------------------
// Peças da documentação da API (visão geral e referência): método, bloco de
// código com copiar, abas de exemplo (cURL | JavaScript) e linha de campo.
// ---------------------------------------------------------------------------

const METHOD_STYLE: Record<string, string> = {
  GET: "bg-cat-blue-subtle text-cat-blue",
  POST: "bg-cat-green-subtle text-cat-green",
  PUT: "bg-cat-indigo-subtle text-cat-indigo",
  PATCH: "bg-cat-amber-subtle text-cat-amber",
  DELETE: "bg-cat-red-subtle text-cat-red",
};

export function Method({ method }: { method: string }) {
  return (
    <span className={cn("inline-flex h-5 shrink-0 items-center rounded-full px-2 font-mono text-caption font-semibold", METHOD_STYLE[method])}>
      {method}
    </span>
  );
}

export function CopyButton({ text, label = "Copiar" }: { text: string; label?: string }) {
  const [ok, setOk] = React.useState(false);
  return (
    <IconButton
      aria-label={ok ? "Copiado" : label}
      tooltip={label}
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setOk(true);
          setTimeout(() => setOk(false), 1500);
        } catch {
          /* sem área de transferência */
        }
      }}
    >
      {ok ? <Check className="text-success" /> : <Copy />}
    </IconButton>
  );
}

/** Bloco de código com cabeçalho (rótulo à esquerda, copiar à direita). */
export function CodeBlock({ code, label, className }: { code: string; label?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0 overflow-hidden rounded-[14px] border border-border-subtle bg-raised", className)}>
      <div className="flex h-9 items-center justify-between gap-2 border-b border-border-subtle pl-3.5 pr-1">
        <span className="min-w-0 truncate font-mono text-caption text-text-tertiary">{label}</span>
        <CopyButton text={code} />
      </div>
      <pre className="max-h-[420px] overflow-auto p-3.5 font-mono text-caption leading-relaxed text-text-secondary">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export interface CodeSample {
  id: string;
  label: string;
  code: string;
}

/** Mesmo exemplo em várias linguagens; a aba escolhida vale para a página toda. */
const LanguageContext = React.createContext<{ lang: string; setLang: (l: string) => void } | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = React.useState("curl");
  const value = React.useMemo(() => ({ lang, setLang }), [lang]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function CodeTabs({ samples, label }: { samples: CodeSample[]; label?: string }) {
  const shared = React.useContext(LanguageContext);
  const [local, setLocal] = React.useState(samples[0]?.id ?? "");
  const lang = shared && samples.some((s) => s.id === shared.lang) ? shared.lang : local;
  const setLang = shared?.setLang ?? setLocal;
  const current = samples.find((s) => s.id === lang) ?? samples[0];
  return (
    <Tabs value={current.id} onValueChange={setLang} className="min-w-0 overflow-hidden rounded-[14px] border border-border-subtle bg-raised">
      <div className="flex min-h-10 items-center justify-between gap-2 border-b border-border-subtle py-1 pl-1.5 pr-1">
        <div className="flex min-w-0 items-center gap-2">
          <TabsList aria-label={label ?? "Linguagem do exemplo"} className="h-7 border-0 bg-transparent">
            {samples.map((s) => (
              <TabsTrigger key={s.id} value={s.id} className="px-2.5 text-caption">
                {s.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {label && <span className="hidden truncate font-mono text-caption text-text-tertiary sm:inline">{label}</span>}
        </div>
        <CopyButton text={current.code} />
      </div>
      {samples.map((s) => (
        <TabsContent key={s.id} value={s.id} className="outline-none">
          <pre className="max-h-[420px] overflow-auto p-3.5 font-mono text-caption leading-relaxed text-text-secondary">
            <code>{s.code}</code>
          </pre>
        </TabsContent>
      ))}
    </Tabs>
  );
}

/** Linha de parâmetro/campo: nome e tipo à esquerda, descrição à direita (empilha em tela estreita). */
export function Field({ name, type, required, children }: { name: string; type?: string; required?: boolean; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-border-subtle py-2.5 last:border-0 sm:flex-row sm:gap-3">
      <div className="shrink-0 sm:w-[180px]">
        <code className="break-all font-mono text-small text-text-primary">{name}</code>
        {(type || required) && (
          <p className="mt-0.5 font-mono text-caption text-text-tertiary">
            {type}
            {required && <span className="ml-1.5 text-danger">obrigatório</span>}
          </p>
        )}
      </div>
      {children && <div className="min-w-0 text-small leading-relaxed text-text-secondary">{children}</div>}
    </div>
  );
}

/** Rótulo pequeno de subseção ("Parâmetros", "Resposta"). */
export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("mb-2 font-mono text-caption uppercase tracking-wide text-text-tertiary", className)}>{children}</p>;
}

export const json = (v: unknown) => JSON.stringify(v, null, 2);

const noop = () => () => {};
/** Origem do app (a URL base dos exemplos). No servidor, um marcador. */
export function useOrigin() {
  return React.useSyncExternalStore(noop, () => window.location.origin, () => "https://SEU-DOMINIO");
}

/** URL base da API do contrato atual: https://<domínio>/api/v1/<id curto do contrato>. */
export function useApiBase() {
  const origin = useOrigin();
  const contrato = useContrato();
  return `${origin}/api/v1/${contrato ? idCurto(contrato) : "SEU-CONTRATO"}`;
}
