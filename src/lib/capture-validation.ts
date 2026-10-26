// Validação do que o cliente responde no bloco Captura. Puro e sem
// "server-only": o motor, a API de leads e a tela usam exatamente a mesma regra.
import { normalizarValor, type DefinicaoDeCampo } from "@/lib/custom-fields";

export type CaptureField = "text" | "name" | "email" | "phone" | "custom" | "location";

/** Id da porta "não respondeu certo" do bloco Captura. Mora aqui (e não em
 * flow-node.tsx, que é "use client") porque o motor no servidor também usa. */
export const SAIDA_INVALIDA = "invalido";

export const CAPTURE_FIELDS: { value: CaptureField; label: string }[] = [
  { value: "text", label: "Texto livre" },
  { value: "name", label: "Nome" },
  { value: "email", label: "E-mail" },
  { value: "phone", label: "Telefone / WhatsApp" },
  { value: "custom", label: "Campo do contato" },
  { value: "location", label: "Localização" },
];

export const MENSAGEM_DE_ERRO: Record<CaptureField, string> = {
  text: "Não entendi. Pode responder de novo?",
  name: "Pode me dizer seu nome?",
  email: "Esse e-mail não parece certo. Pode conferir e mandar de novo? Ex.: nome@empresa.com",
  phone: "Esse telefone não parece certo. Manda com DDD, por favor. Ex.: (11) 98765-4321",
  custom: "Não consegui entender essa resposta. Pode mandar de novo?",
  location: "Pode mandar a sua localização ou o endereço?",
};

/** Onde a resposta fica guardada. nome/email/telefone são os nomes que viram coluna do Contact. */
export function variavelDaCaptura(data: { captureField?: string; captureCustomKey?: string; variableName?: string }): string {
  switch (data.captureField) {
    case "name":
      return "nome";
    case "email":
      return "email";
    case "phone":
      return "telefone";
    case "custom":
      return data.captureCustomKey ?? "";
    case "location":
      return "localizacao";
    default:
      return data.variableName ?? "";
  }
}

const semAcento = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
const PULAR = new Set(["pular", "pula", "prefiro nao", "nao quero", "agora nao"]);

export function isSkip(text: string | undefined): boolean {
  return !!text && PULAR.has(semAcento(text));
}

export function validarNome(raw: string): string | null {
  const t = raw.replace(/\s+/g, " ").trim();
  if (t.length < 2 || t.length > 80) return null;
  if (!/\p{L}/u.test(t) || t.includes("@")) return null;
  return t;
}

export function validarEmail(raw: string): string | null {
  const t = raw.trim().toLowerCase();
  if (t.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t)) return null;
  return t;
}

export function normalizarTelefoneBR(raw: string): string | null {
  const t = (raw ?? "").trim();
  let d = t.replace(/\D/g, "");
  if (!d) return null;
  const internacional = t.startsWith("+") && !d.startsWith("55");
  if (internacional) return d.length >= 8 && d.length <= 15 ? `+${d}` : null;

  // "0" de interurbano antes do DDD: 0 + DDD + 8 ou 9 dígitos.
  if (d.startsWith("0") && (d.length === 11 || d.length === 12)) d = d.slice(1);
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return null;
  const ddd = Number(d.slice(0, 2));
  if (ddd < 11 || ddd > 99 || ddd % 10 === 0) return null;
  if (d.length === 11 && d[2] !== "9") return null;
  return `+55${d}`;
}

export type CaptureResult = { ok: true; value: unknown } | { ok: false };

export function validateCapture(
  field: CaptureField,
  raw: string,
  def?: Pick<DefinicaoDeCampo, "type" | "label" | "options">
): CaptureResult {
  const texto = (raw ?? "").trim();
  if (!texto) return { ok: false };
  switch (field) {
    case "name": {
      const v = validarNome(texto);
      return v ? { ok: true, value: v } : { ok: false };
    }
    case "email": {
      const v = validarEmail(texto);
      return v ? { ok: true, value: v } : { ok: false };
    }
    case "phone": {
      const v = normalizarTelefoneBR(texto);
      return v ? { ok: true, value: v } : { ok: false };
    }
    case "custom": {
      if (!def) return { ok: false };
      const r = normalizarValor(def, texto);
      return r.ok && r.valor !== null ? { ok: true, value: r.valor } : { ok: false };
    }
    default:
      return { ok: true, value: texto };
  }
}
