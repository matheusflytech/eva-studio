"use client";

import * as React from "react";
import { UserPlus, Trash2, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { IconButton } from "@/components/ui/icon-button";
import { Notice } from "@/components/ui/notice";
import { focusRing } from "@/components/ui/styles";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { TrocarFoto } from "@/components/crm/trocar-foto";
import { urlDoAvatar } from "@/lib/avatar";
import { CabecalhoDaSecao, EsqueletoDeLista, ItemDeConfig, LinhaDeConfig, ListaDeConfig, RotuloDeGrupo } from "./secao";

interface Membro {
  id: string;
  name: string;
  email: string;
  avatarPath?: string | null;
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

/** "Maria Silva" → "MS" (círculo da linha). */
function iniciaisDe(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] ?? "") + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase() || "?";
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
    return <span className="max-w-[160px] truncate text-caption text-text-tertiary">{nomes.join(", ") || "—"}</span>;
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`${rotulo}: ${nomes.length ? nomes.join(", ") : "nenhum"}`}
          className={cn(
            "h-8 max-w-[160px] truncate rounded-full border border-border-subtle bg-raised px-3 text-left text-caption text-text-secondary hover:bg-hover hover:text-text-primary",
            focusRing
          )}
        >
          {nomes.length ? nomes.join(", ") : `Sem ${rotulo.toLowerCase()}`}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[220px] p-2">
        {opcoes.length === 0 && <p className="px-2 py-1 text-caption text-text-tertiary">Nenhum(a) criado(a) ainda.</p>}
        {opcoes.map((o) => (
          <label key={o.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-small text-text-secondary hover:bg-hover">
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
  const eu = membros.find((m) => m.isMe);
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
  const [carregado, setCarregado] = React.useState(false);

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
    setCarregado(true);
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
    <div>
      <CabecalhoDaSecao
        titulo="Membros"
        descricao="Quem participa deste contrato. A mesma pessoa pode estar em vários contratos, com um papel diferente em cada."
      />

      {pode && (
        <form onSubmit={convidar}>
          <LinhaDeConfig rotulo="Convidar por e-mail" descricao="A pessoa recebe o link por e-mail. Quem já tem conta passa a ver o contrato no seletor.">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="convite-email"
                type="email"
                aria-label="E-mail de quem vai entrar"
                value={email}
                placeholder="pessoa@empresa.com"
                onChange={(e) => setEmail(e.target.value)}
                className="sm:flex-1"
              />
              <div className="sm:w-[180px]">
                <Select id="convite-papel" aria-label="Papel no convite" value={papelConvite} onChange={(e) => setPapelConvite(e.target.value)}>
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
                <UserPlus size={14} aria-hidden="true" /> {convidando ? "Convidando..." : "Convidar"}
              </Button>
            </div>
          </LinhaDeConfig>
        </form>
      )}

      {erro && (
        <Notice tone="danger" className="mb-3">
          {erro}
        </Notice>
      )}
      {aviso && (
        <Notice tone="info" className="mb-3">
          {aviso}
        </Notice>
      )}

      <div className={pode ? "border-t border-border-subtle pt-5" : undefined}>
        {eu && (
          <div className="mb-5 flex items-center gap-3">
            <TrocarFoto endpoint="/api/me/foto" temFoto={!!eu.avatarPath} rotulo="você" onMudou={() => void carregar()}>
              <Avatar name={eu.name || eu.email} src={urlDoAvatar(eu.avatarPath)} size="lg" />
            </TrocarFoto>
            <div className="min-w-0">
              <p className="text-body font-semibold text-text-primary">Sua foto</p>
              <p className="text-small text-text-tertiary">Aparece para a equipe no quadro, nas listas e nas fichas.</p>
            </div>
          </div>
        )}
        <RotuloDeGrupo contagem={carregado ? membros.length : undefined}>Pessoas no contrato</RotuloDeGrupo>
        {!carregado ? (
          <EsqueletoDeLista />
        ) : (
          <ListaDeConfig>
            {membros.map((m) => {
              const travado = !pode || m.isMe || (m.role === "owner" && !souDono);
              return (
                <ItemDeConfig
                  key={m.id}
                  icone={
                    m.avatarPath ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={urlDoAvatar(m.avatarPath) ?? undefined} alt="" className="size-full rounded-[10px] object-cover" />
                    ) : (
                      <span className="text-caption font-semibold">{iniciaisDe(m.name || m.email)}</span>
                    )
                  }
                  titulo={
                    <span className="flex items-center gap-2">
                      <span className="truncate">{m.name}</span>
                      {m.isMe && <Badge>você</Badge>}
                      {m.status === "convidado" && <Badge variant="info">convidado</Badge>}
                    </span>
                  }
                  detalhe={m.email}
                  direita={
                    <>
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
                        <span className="inline-flex items-center gap-1.5 text-small text-text-secondary">
                          <ShieldCheck size={14} aria-hidden="true" className="text-text-tertiary" />
                          {m.roleId
                            ? personalizados.find((p) => p.id === m.roleId)?.name ?? "Papel personalizado"
                            : sistema.find((s) => s.value === m.role)?.label ?? m.role}
                        </span>
                      ) : (
                        <div className="w-[170px]">
                          <Select
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
                        </div>
                      )}
                      {!travado && (
                        <IconButton
                          aria-label={`Remover ${m.name}`}
                          tooltip="Remover do contrato"
                          className="hover:text-danger"
                          onClick={() => {
                            if (window.confirm(`Tirar ${m.name} deste contrato? O que ela criou continua aqui.`)) {
                              enviar("DELETE", undefined, `?userId=${encodeURIComponent(m.id)}`);
                            }
                          }}
                        >
                          <Trash2 />
                        </IconButton>
                      )}
                    </>
                  }
                />
              );
            })}
          </ListaDeConfig>
        )}
      </div>
    </div>
  );
}
