"use client";

import * as React from "react";
import { Users, ShieldCheck } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

interface Member {
  id: string;
  name: string;
  email: string;
  role: string;
  isMe: boolean;
}

interface RoleOption {
  value: string;
  label: string;
  description: string;
}

/**
 * Membros da organização e o que cada um pode fazer.
 *
 * A checagem de verdade é no servidor (src/lib/server/permissions.ts) — esta
 * tela só mostra e muda o papel. Esconder botão no navegador nunca foi
 * segurança; aqui é conveniência.
 */
export function MembersPanel() {
  const [members, setMembers] = React.useState<Member[]>([]);
  const [roles, setRoles] = React.useState<RoleOption[]>([]);
  const [myRole, setMyRole] = React.useState<string>("viewer");
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    const res = await fetch("/api/members");
    if (!res.ok) return;
    const data = await res.json();
    setMembers(data.members ?? []);
    setRoles(data.roles ?? []);
    setMyRole(data.me?.role ?? "viewer");
  }, []);

  React.useEffect(() => { refresh(); }, [refresh]);

  async function changeRole(userId: string, role: string) {
    setError(null);
    const res = await fetch("/api/members", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role }),
    });
    if (!res.ok) {
      setError((await res.json()).error ?? "Não foi possível alterar o papel.");
      return;
    }
    refresh();
  }

  const canManage = myRole === "owner";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users size={16} className="text-text-tertiary" /> Membros e permissões
        </CardTitle>
        <CardDescription>
          Quem participa da organização e até onde cada um vai. Só o dono muda papéis.
        </CardDescription>
      </CardHeader>

      {error && <p className="mb-3 text-[13px] text-danger">{error}</p>}

      <div className="flex flex-col gap-2">
        {members.map((m) => (
          <div key={m.id} className="flex items-center justify-between gap-4 rounded-2xl bg-surface-2 px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-[14px] font-medium text-text-primary">{m.name}</span>
                {m.isMe && <Badge>você</Badge>}
              </div>
              <div className="truncate text-[12px] text-text-tertiary">{m.email}</div>
            </div>

            {canManage && !m.isMe ? (
              <Select
                className="w-[190px]"
                value={m.role}
                onChange={(e) => changeRole(m.id, e.target.value)}
                aria-label={`Papel de ${m.name}`}
              >
                {roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </Select>
            ) : (
              <span className="inline-flex shrink-0 items-center gap-1.5 text-[13px] text-text-secondary">
                <ShieldCheck size={14} className="text-text-tertiary" />
                {roles.find((r) => r.value === m.role)?.label ?? m.role}
              </span>
            )}
          </div>
        ))}
      </div>

      {roles.length > 0 && (
        <dl className="mt-4 flex flex-col gap-1.5 border-t border-border-subtle pt-4 text-[12px]">
          {roles.map((r) => (
            <div key={r.value} className="flex gap-2">
              <dt className="w-[110px] shrink-0 text-text-secondary">{r.label}</dt>
              <dd className="text-text-tertiary">{r.description}</dd>
            </div>
          ))}
        </dl>
      )}
    </Card>
  );
}
