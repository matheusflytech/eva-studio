"use client";

import * as React from "react";
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
          <option value="">Selecione...</option>
          {(servers ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}{s.active ? "" : " — fora do ar"}
            </option>
          ))}
        </Select>
        {servers && servers.length === 0 && (
          <p className="mt-1.5 inline-flex items-center gap-1.5 text-[11.5px] text-text-tertiary">
            Nenhum servidor cadastrado. Cadastre em{" "}
            <a href="/integracoes" className="inline-flex items-center gap-1 text-accent-400 hover:underline">
              Integrações <ExternalLink size={11} />
            </a>
          </p>
        )}
      </div>

      {selected && !selected.active && (
        <p className="inline-flex items-start gap-1.5 rounded-xl bg-danger/10 px-3 py-2 text-[12px] text-danger">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          {selected.lastError ?? "O servidor não respondeu na última verificação."}
        </p>
      )}

      {selected && selected.tools.length > 0 && (
        <div>
          <Label>Ferramentas disponíveis</Label>
          <p className="mb-2 text-[11.5px] text-text-tertiary">
            Nenhuma marcada = o agente enxerga todas ({selected.tools.length}).
          </p>
          <div className="flex max-h-[220px] flex-col gap-1.5 overflow-y-auto rounded-xl bg-surface-2 p-3">
            {selected.tools.map((tool) => {
              const checked = selectedTools.includes(tool.name);
              return (
                <label key={tool.name} className="flex cursor-pointer items-start gap-2.5 text-[12.5px]">
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
                      <span className="block truncate text-[11.5px] text-text-tertiary">{tool.description}</span>
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
