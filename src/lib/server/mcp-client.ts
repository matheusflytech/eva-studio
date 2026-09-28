import "server-only";
import { safeFetch } from "@/lib/server/ssrf";

// ---------------------------------------------------------------------------
// Cliente MCP (Model Context Protocol) — transporte Streamable HTTP.
//
// MCP é o protocolo aberto que padroniza "aqui estão minhas ferramentas". Em
// vez de configurar uma chamada HTTP por integração (que é o que o bloco
// Ferramenta HTTP faz), o servidor se apresenta e o agente descobre sozinho
// o que dá pra fazer. Um servidor MCP de CRM, de calendário ou de banco de
// dados entra no fluxo sem escrever código novo aqui.
//
// Implementação própria, sem SDK, pelo mesmo motivo do resto do motor: é
// JSON-RPC 2.0 sobre HTTP, cabe em um arquivo, e evita somar dependência ao
// bundle serverless.
//
// Duas sutilezas do transporte que quebram quem implementa de primeira:
//   1. A resposta pode vir como JSON puro OU como SSE (text/event-stream),
//      dependendo do servidor. Os dois precisam ser aceitos.
//   2. O servidor pode devolver um Mcp-Session-Id no initialize que tem que
//      ser repetido em toda chamada seguinte.
//
// Toda chamada passa por safeFetch: a URL é digitada pelo usuário, então sem
// isso um servidor MCP apontando pra 169.254.169.254 leria metadados da nuvem.
// ---------------------------------------------------------------------------

const PROTOCOL_VERSION = "2025-06-18";
const CLIENT_INFO = { name: "eva-studio", version: "1.0.0" };

export interface McpToolDef {
  name: string;
  description?: string;
  inputSchema?: {
    type?: string;
    properties?: Record<string, { type?: string; description?: string }>;
    required?: string[];
  };
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id?: number | string;
  result?: unknown;
  error?: { code: number; message: string };
}

/**
 * Resposta pode ser `application/json` ou `text/event-stream`. No caso SSE, o
 * que interessa é o primeiro evento `data:` que carrega uma resposta JSON-RPC
 * com `id` (mensagens de notificação vêm sem `id` e são ignoradas).
 */
async function readRpcResponse(res: Response): Promise<JsonRpcResponse> {
  const contentType = res.headers.get("content-type") ?? "";
  const body = await res.text();

  if (!contentType.includes("text/event-stream")) {
    return JSON.parse(body) as JsonRpcResponse;
  }

  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      const parsed = JSON.parse(payload) as JsonRpcResponse;
      if (parsed.id !== undefined) return parsed;
    } catch {
      // Evento que não é JSON-RPC (keep-alive, comentário): ignora.
    }
  }
  throw new Error("Servidor MCP respondeu em SSE sem nenhuma resposta JSON-RPC.");
}

export class McpSession {
  private sessionId: string | null = null;
  private nextId = 1;

  constructor(
    private readonly url: string,
    private readonly authHeader: string
  ) {}

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      // Precisa aceitar os dois: o servidor escolhe.
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": PROTOCOL_VERSION,
    };
    if (this.authHeader) headers.Authorization = this.authHeader;
    if (this.sessionId) headers["Mcp-Session-Id"] = this.sessionId;
    return headers;
  }

  private async rpc(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const id = this.nextId++;
    const res = await safeFetch(this.url, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params: params ?? {} }),
    });

    if (!res.ok) throw new Error(`MCP ${res.status}: ${(await res.text()).slice(0, 200)}`);

    // O id de sessão só aparece na resposta do initialize.
    const session = res.headers.get("mcp-session-id");
    if (session) this.sessionId = session;

    const parsed = await readRpcResponse(res);
    if (parsed.error) throw new Error(`MCP ${parsed.error.code}: ${parsed.error.message}`);
    return parsed.result;
  }

  private async notify(method: string): Promise<void> {
    // Notificação não tem id e não espera resposta; falha aqui não é fatal.
    try {
      await safeFetch(this.url, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ jsonrpc: "2.0", method }),
      });
    } catch {
      /* servidor que não aceita a notificação segue funcionando */
    }
  }

  /** Handshake. Precisa rodar antes de tools/list e tools/call. */
  async initialize(): Promise<void> {
    await this.rpc("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: CLIENT_INFO,
    });
    await this.notify("notifications/initialized");
  }

  async listTools(): Promise<McpToolDef[]> {
    const result = (await this.rpc("tools/list")) as { tools?: McpToolDef[] };
    return result?.tools ?? [];
  }

  /** Chama uma ferramenta e devolve o texto do resultado, já achatado. */
  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const result = (await this.rpc("tools/call", { name, arguments: args })) as {
      content?: { type: string; text?: string }[];
      isError?: boolean;
      structuredContent?: unknown;
    };

    const text = (result?.content ?? [])
      .filter((c) => c.type === "text" && c.text)
      .map((c) => c.text)
      .join("\n")
      .trim();

    if (text) return result?.isError ? `Erro da ferramenta: ${text}` : text;
    // Alguns servidores só devolvem structuredContent.
    if (result?.structuredContent) return JSON.stringify(result.structuredContent);
    return "Ferramenta executada, sem retorno.";
  }
}

/** Abre a sessão já com handshake feito. */
export async function openMcpSession(url: string, authHeader: string): Promise<McpSession> {
  const session = new McpSession(url, authHeader);
  await session.initialize();
  return session;
}

/** Conecta, lista as ferramentas e desconecta. Usado pelo botão "Testar". */
export async function probeMcpServer(
  url: string,
  authHeader: string
): Promise<{ ok: true; tools: McpToolDef[] } | { ok: false; error: string }> {
  try {
    const session = await openMcpSession(url, authHeader);
    return { ok: true, tools: await session.listTools() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
