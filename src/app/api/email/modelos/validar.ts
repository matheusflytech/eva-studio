// Corpo de um modelo de e-mail vindo da tela ou da API. Não é rota: só a
// validação comum de POST e PATCH.

export interface ModeloLido {
  nome: string;
  assunto: string;
  modo: "simples" | "html";
  corpo: string;
}

const MAX_CORPO = 100_000;

export function lerModelo(body: unknown): ModeloLido | { error: string } {
  if (!body || typeof body !== "object") return { error: "Envie { nome, assunto, modo, corpo }." };
  const b = body as Record<string, unknown>;
  const nome = String(b.nome ?? "").trim().slice(0, 120);
  if (!nome) return { error: "Dê um nome para o modelo." };
  const assunto = String(b.assunto ?? "").trim().slice(0, 200);
  const modo = b.modo === "html" ? "html" : "simples";
  const corpo = String(b.corpo ?? "");
  if (corpo.length > MAX_CORPO) return { error: "O corpo passou de 100 mil caracteres." };
  return { nome, assunto, modo, corpo };
}
