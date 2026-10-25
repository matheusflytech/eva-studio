"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { ExternalLink, AlertTriangle } from "lucide-react";
import { Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

interface McpTool {
  name: string;
  description?: string;
}

interface McpServerRow {
  id: string;
  name: string;
  url: string;
  active: boolean;
  tools: McpTool[];
  lastError: string | null;
}

/**
 * Escolha do servidor MCP e de quais ferramentas dele o agente enxerga.
 *
 * Nenhuma marcada = todas, que é o padrão certo: o ponto do MCP é o servidor
 * anunciar o que sabe fazer, e ficar marcando caixa a cada ferramenta nova
 * do outro lado anularia isso. A seleção existe pra quando o servidor expõe
 * coisa demais e você quer restringir.
 */
export function McpToolPicker({
  serverId,
  selectedTools,
  onChange,
}: {
  serverId: string | undefined;
  selectedTools: string[];
  onChange: (patch: { mcpServerId?: string; mcpTools?: string[] }) => void;
}) {
  const [servers, setServers] = React.useState<McpServerRow[] | null>(null);

  React.useEffect(() => {
    fetch("/api/mcp-servers")
      .then((r) => r.json())
      .then((d) => setServers(d.servers ?? []))
      .catch(() => setServers([]));
  }, []);

  const selected = servers?.find((s) => s.id === serverId);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <Label htmlFor="node-mcp-server">Servidor MCP</Label>
        <Select
          id="node-mcp-server"
          value={serverId ?? ""}
          onChange={(e) => onChange({ mcpServerId: e.target.value, mcpTools: [] })}
        >
          <option value="">Selecione…</option>
          {(servers ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}{s.active ? "" : " — fora do ar"}
            </option>
          ))}
        </Select>
        {servers && servers.length === 0 && (
          <p className="mt-1.5 inline-flex items-center gap-1.5 text-caption text-text-tertiary">
            Nenhum servidor cadastrado. Cadastre em{" "}
            <Link href="/integrations" className="inline-flex items-center gap-1 text-accent-fg hover:underline">
              Integrações <ExternalLink size={11} />
            </Link>
          </p>
        )}
      </div>

      {selected && !selected.active && (
        <p className="inline-flex items-start gap-1.5 rounded-xl bg-danger-subtle px-3 py-2 text-caption text-danger">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          {selected.lastError ?? "O servidor não respondeu na última verificação."}
        </p>
      )}

      {selected && selected.tools.length > 0 && (
        <div>
          <Label>Ferramentas disponíveis</Label>
          <p className="mb-2 text-caption text-text-tertiary">
            Nenhuma marcada = o agente enxerga todas ({selected.tools.length}).
          </p>
          <div className="flex max-h-[220px] flex-col gap-1.5 overflow-y-auto rounded-[14px] bg-raised p-3">
            {selected.tools.map((tool) => {
              const checked = selectedTools.includes(tool.name);
              return (
                <label key={tool.name} className="flex cursor-pointer items-start gap-2.5 text-small">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(value) => {
                      const next = value
                        ? [...selectedTools, tool.name]
                        : selectedTools.filter((t) => t !== tool.name);
                      onChange({ mcpTools: next });
                    }}
                  />
                  <span className="min-w-0">
                    <span className="block font-medium text-text-primary">{tool.name}</span>
                    {tool.description && (
                      <span className="block truncate text-caption text-text-tertiary">{tool.description}</span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
