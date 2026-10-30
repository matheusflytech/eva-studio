import "server-only";
import { prisma } from "@/lib/db/prisma";
import { decryptSecret } from "@/lib/server/crypto";
import { LLM_PROVIDERS, type LlmProvider } from "@/lib/llm-providers";

// ---------------------------------------------------------------------------
// Qual IA responde os pedidos do CRM (dashboard, e o que vier depois).
//
// Mesmo mecanismo que o resto da plataforma já usa:
//   1. Credencial de IA cadastrada pela organização em Integrações (tabela
//      Credential, `type` = provedor, segredo cifrado) — é a chave do cliente.
//   2. Sem nenhuma, a GROQ_API_KEY do ambiente — a mesma chave de plataforma
//      que a transcrição de áudio (transcribe.ts) já usa como reserva.
// Sem as duas, devolve null e a tela explica como ligar.
//
// Com várias credenciais, vale a ordem abaixo (modelos melhores em seguir um
// formato estrito primeiro); dentro do mesmo provedor, a mais recente.
// ---------------------------------------------------------------------------

export const ORDEM_DE_PROVEDORES: LlmProvider[] = ["anthropic", "openai", "google", "groq", "openrouter", "deepseek", "xai"];

/** Modelo usado por provedor: rápido o bastante para uma barra de busca, bom em JSON. Todos existem em LLM_PROVIDERS. */
export const MODELO_POR_PROVEDOR: Record<LlmProvider, string> = {
  anthropic: "claude-sonnet-5",
  openai: "gpt-5.2-mini",
  google: "gemini-2.5-flash",
  groq: "openai/gpt-oss-120b",
  openrouter: "meta-llama/llama-3.3-70b-instruct",
  deepseek: "deepseek-chat",
  xai: "grok-4",
};

export interface ProvedorDeIa {
  provider: LlmProvider;
  apiKey: string;
  model: string;
  origem: "organizacao" | "plataforma";
  /** Credencial escolhida; vazio = chave da plataforma. */
  credentialId?: string;
}

export async function escolherProvedorDeIa(orgId: string): Promise<ProvedorDeIa | null> {
  const tipos = LLM_PROVIDERS.map((p) => p.credentialType);
  const credenciais = await prisma.credential.findMany({
    where: { orgId, type: { in: tipos } },
    select: { id: true, type: true, secretEnc: true },
    orderBy: { createdAt: "desc" },
  });

  for (const provider of ORDEM_DE_PROVEDORES) {
    const info = LLM_PROVIDERS.find((p) => p.id === provider);
    if (!info) continue;
    for (const cred of credenciais.filter((c) => c.type === info.credentialType)) {
      try {
        const apiKey = decryptSecret(cred.secretEnc);
        if (apiKey) return { provider, apiKey, model: MODELO_POR_PROVEDOR[provider], origem: "organizacao", credentialId: cred.id };
      } catch {
        // Credencial que não decifra (chave de cifra trocada): tenta a próxima.
      }
    }
  }

  const daPlataforma = process.env.GROQ_API_KEY;
  if (daPlataforma) return { provider: "groq", apiKey: daPlataforma, model: MODELO_POR_PROVEDOR.groq, origem: "plataforma" };
  return null;
}
