"use client";

import * as React from "react";
import { Users } from "lucide-react";
import { Notice } from "@/components/ui/notice";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

type Modo = "mention" | "all" | "off";

interface Grupo {
  id: string;
  jid: string;
  subject: string;
  participantsCount: number;
  mode: Modo;
  present: boolean;
}

const MODOS: { valor: Modo; rotulo: string }[] = [
  { valor: "mention", rotulo: "Só quando marcado" },
  { valor: "all", rotulo: "Responder tudo" },
  { valor: "off", rotulo: "Não responder" },
];

/**
 * Grupos do número conectado por QR e, por grupo, quando o agente responde.
 * O worker traz a lista ao conectar; a mudança de modo vale em até 30 s.
 */
export function GruposDoCanal({ canalId }: { canalId: string }) {
  const [dados, setDados] = React.useState<{ available: boolean; groups: Grupo[] } | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);

  React.useEffect(() => {
    let vivo = true;
    void fetch(`/api/channels/${canalId}/groups`)
      .then((r) => r.json())
      .then((d) => {
        if (vivo && Array.isArray(d?.groups)) setDados({ available: d.available !== false, groups: d.groups });
      })
      .catch(() => vivo && setErro("Não deu para carregar os grupos."));
    return () => {
      vivo = false;
    };
  }, [canalId]);

  async function mudar(g: Grupo, mode: Modo) {
    setErro(null);
    const antes = g.mode;
    setDados((d) => d && { ...d, groups: d.groups.map((x) => (x.id === g.id ? { ...x, mode } : x)) });
    const res = await fetch(`/api/channels/${canalId}/groups`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: g.id, mode }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setErro(d.error ?? "Não deu para salvar.");
      setDados((x) => x && { ...x, groups: x.groups.map((y) => (y.id === g.id ? { ...y, mode: antes } : y)) });
    }
  }

  if (erro && !dados) return <Notice tone="danger">{erro}</Notice>;
  if (!dados) return <Skeleton className="h-16 w-full rounded-[14px]" />;
  if (!dados.available) {
    return <Notice tone="info">Os grupos ainda não foram ativados no banco deste ambiente. Peça para rodar o SQL 2026-11-07.</Notice>;
  }
  if (dados.groups.length === 0) {
    return (
      <p className="text-caption text-text-tertiary">
        Nenhum grupo ainda. Eles aparecem aqui assim que o número conecta (pode levar alguns segundos) e quando entrar em um grupo novo.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-2 text-small font-medium text-text-primary">
        <Users size={14} aria-hidden="true" /> Grupos deste número ({dados.groups.filter((g) => g.present).length})
      </p>
      {erro && <Notice tone="danger">{erro}</Notice>}
      <ul className="flex flex-col divide-y divide-border-subtle rounded-[14px] border border-border-subtle">
        {dados.groups.map((g) => (
          <li key={g.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5">
            <div className="min-w-[140px] flex-1">
              <p className="truncate text-small font-medium text-text-primary">{g.subject || "Grupo sem nome"}</p>
              <p className="truncate text-caption text-text-tertiary">
                {g.participantsCount} participantes{g.present ? "" : " · você saiu deste grupo"}
              </p>
            </div>
            <div className="w-[190px]">
              <Select value={g.mode} onChange={(e) => void mudar(g, e.target.value as Modo)} aria-label={`Quando o agente responde em ${g.subject || "grupo sem nome"}`} disabled={!g.present}>
                {MODOS.map((m) => (
                  <option key={m.valor} value={m.valor}>
                    {m.rotulo}
                  </option>
                ))}
              </Select>
            </div>
          </li>
        ))}
      </ul>
      <p className="text-caption text-text-tertiary">Vale em até 30 segundos. “Só quando marcado” é o padrão: o agente responde se marcarem o número ou responderem a ele.</p>
    </div>
  );
}
