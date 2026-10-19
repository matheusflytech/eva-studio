"use client";

import * as React from "react";
import { UserPlus, Trash2, ShieldCheck } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface Membro {
  id: string;
  name: string;
  email: string;
  role: string;
  roleId: string | null;
  groupIds: string[];
  teamIds: string[];
  status: string;
  isMe: boolean;
}
interface Opcao {
  id: string;
  name: string;
}
interface PapelSistema {
  value: string;
  label: string;
  description: string;
}

// O <select> de papel mistura sistema ("sis:admin") e personalizado ("pp:<id>").
function valorDoPapel(m: Membro) {
  return m.roleId ? `pp:${m.roleId}` : `sis:${m.role}`;
}

function Multiplo({
  rotulo,
  opcoes,
  marcados,
  desabilitado,
  aoMudar,
}: {
  rotulo: string;
  opcoes: Opcao[];
  marcados: string[];
  desabilitado?: boolean;
  aoMudar: (ids: string[]) => void;
}) {
  const nomes = opcoes.filter((o) => marcados.includes(o.id)).map((o) => o.name);
  if (desabilitado) {
    return <span className="text-[12px] text-text-tertiary">{nomes.join(", ") || "—"}</span>;
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="max-w-[180px] truncate rounded-lg border border-border-default bg-surface-2 px-2.5 py-1.5 text-left text-[12px] text-text-secondary hover:text-text-primary"
        >
          {nomes.length ? nomes.join(", ") : `Sem ${rotulo.toLowerCase()}`}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[220px] p-2">
        {opcoes.length === 0 && <p className="px-2 py-1 text-[12px] text-text-tertiary">Nenhum(a) criado(a) ainda.</p>}
        {opcoes.map((o) => (
          <label key={o.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-text-secondary hover:bg-surface-3">
            <Checkbox
              checked={marcados.includes(o.id)}
              onCheckedChange={(v) => aoMudar(v ? [...marcados, o.id] : marcados.filter((x) => x !== o.id))}
            />
            {o.name}
          </label>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Membros do contrato: convidar, papel, grupos extras, equipes e remover. A
 * checagem de verdade é no servidor (src/lib/server/membros.ts); aqui é
 * conveniência.
 */
export function AbaMembros() {
  const [membros, setMembros] = React.useState<Membro[]>([]);
  const [sistema, setSistema] = React.useState<PapelSistema[]>([]);
  const [personalizados, setPersonalizados] = React.useState<Opcao[]>([]);
  const [grupos, setGrupos] = React.useState<Opcao[]>([]);
  const [equipes, setEquipes] = React.useState<Opcao[]>([]);
  const [pode, setPode] = React.useState(false);
  const [souDono, setSouDono] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [aviso, setAviso] = React.useState<string | null>(null);
  const [email, setEmail] = React.useState("");
  const [papelConvite, setPapelConvite] = React.useState("sis:agent");
  const [convidando, setConvidando] = React.useState(false);

  const carregar = React.useCallback(async () => {
    const [m, g, t] = await Promise.all([fetch("/api/members"), fetch("/api/permission-groups"), fetch("/api/teams")]);
    if (m.ok) {
      const d = await m.json();
      setMembros(d.members ?? []);
      setSistema(d.roles ?? []);
      setPersonalizados(d.customRoles ?? []);
      setPode(!!d.me?.podeGerenciar);
      setSouDono(d.me?.role === "owner" || !!d.me?.superadmin);
    }
    if (g.ok) setGrupos((await g.json()).grupos ?? []);
    if (t.ok) setEquipes(((await t.json()).equipes ?? []).map((e: Opcao) => ({ id: e.id, name: e.name })));
  }, []);

  React.useEffect(() => {
    // Fora do corpo do efeito: a primeira carga não dispara setState síncrono.
    Promise.resolve().then(carregar);
  }, [carregar]);

  async function enviar(metodo: "PATCH" | "DELETE" | "POST", corpo?: object, query = "") {
    setErro(null);
    setAviso(null);
    const res = await fetch(`/api/members${query}`, {
      method: metodo,
      headers: corpo ? { "Content-Type": "application/json" } : undefined,
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErro(d.error ?? "Não foi possível salvar.");
      return null;
    }
    await carregar();
    return d;
  }

  function papelDoSelect(v: string) {
    return v.startsWith("pp:") ? { roleId: v.slice(3) } : { role: v.slice(4), roleId: null };
  }

  async function convidar(e: React.FormEvent) {
    e.preventDefault();
    setConvidando(true);
    const p = papelDoSelect(papelConvite);
    // Papel personalizado no convite: a base de sistema fica "Atendente".
    const d = await enviar("POST", { email, ...("role" in p ? { role: p.role } : { role: "agent", roleId: p.roleId }) });
    setConvidando(false);
    if (d) {
      setEmail("");
      setAviso(
        d.convite?.novo
          ? `Convite enviado para ${d.convite.email}. A pessoa define a senha pelo link do e-mail.`
          : `${d.convite?.email} já tem conta no Eva e passa a ver este contrato no seletor.`
      );
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Membros</CardTitle>
        <CardDescription>
          Quem participa deste contrato. A mesma pessoa pode estar em vários contratos, com um papel diferente em cada.
        </CardDescription>
      </CardHeader>

      {pode && (
        <form onSubmit={convidar} className="mb-5 flex flex-col gap-3 rounded-2xl border border-border-subtle bg-surface-2/50 p-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Label htmlFor="convite-email">Convidar por e-mail</Label>
            <Input id="convite-email" type="email" value={email} placeholder="pessoa@empresa.com" onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="sm:w-[200px]">
            <Label htmlFor="convite-papel">Papel</Label>
            <Select id="convite-papel" value={papelConvite} onChange={(e) => setPapelConvite(e.target.value)}>
              {sistema
                .filter((s) => s.value !== "owner" || souDono)
                .map((s) => (
                  <option key={s.value} value={`sis:${s.value}`}>
                    {s.label}
                  </option>
                ))}
              {personalizados.map((p) => (
                <option key={p.id} value={`pp:${p.id}`}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" disabled={!email.trim() || convidando} className="shrink-0">
            <UserPlus size={15} /> {convidando ? "Convidando..." : "Convidar"}
          </Button>
        </form>
      )}

      {erro && <p className="mb-3 text-[13px] text-danger">{erro}</p>}
      {aviso && <p className="mb-3 text-[13px] text-emerald-400">{aviso}</p>}

      <div className="flex flex-col gap-2">
        {membros.map((m) => {
          const travado = !pode || m.isMe || (m.role === "owner" && !souDono);
          return (
            <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface-2 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[14px] font-medium text-text-primary">{m.name}</span>
                  {m.isMe && <Badge>você</Badge>}
                  {m.status === "convidado" && <Badge variant="accent">convidado</Badge>}
                </div>
                <div className="truncate text-[12px] text-text-tertiary">{m.email}</div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Multiplo
                  rotulo="Equipes"
                  opcoes={equipes}
                  marcados={m.teamIds}
                  desabilitado={!pode}
                  aoMudar={(ids) => enviar("PATCH", { userId: m.id, teamIds: ids })}
                />
                <Multiplo
                  rotulo="Grupos"
                  opcoes={grupos}
                  marcados={m.groupIds}
                  desabilitado={travado}
                  aoMudar={(ids) => enviar("PATCH", { userId: m.id, groupIds: ids })}
                />
                {travado ? (
                  <span className="inline-flex items-center gap-1.5 text-[13px] text-text-secondary">
                    <ShieldCheck size={14} className="text-text-tertiary" />
                    {m.roleId
                      ? personalizados.find((p) => p.id === m.roleId)?.name ?? "Papel personalizado"
                      : sistema.find((s) => s.value === m.role)?.label ?? m.role}
                  </span>
                ) : (
                  <Select
                    className="h-9 w-[180px] text-[13px]"
                    value={valorDoPapel(m)}
                    onChange={(e) => enviar("PATCH", { userId: m.id, ...papelDoSelect(e.target.value) })}
                    aria-label={`Papel de ${m.name}`}
                  >
                    {sistema
                      .filter((s) => s.value !== "owner" || souDono)
                      .map((s) => (
                        <option key={s.value} value={`sis:${s.value}`}>
                          {s.label}
                        </option>
                      ))}
                    {personalizados.map((p) => (
                      <option key={p.id} value={`pp:${p.id}`}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                )}
                {!travado && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Tirar ${m.name} deste contrato? O que ela criou continua aqui.`)) {
                        enviar("DELETE", undefined, `?userId=${encodeURIComponent(m.id)}`);
                      }
                    }}
                    aria-label={`Remover ${m.name}`}
                    title="Remover do contrato"
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-text-tertiary hover:bg-surface-3 hover:text-danger"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
