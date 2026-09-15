import "server-only";
import crypto from "node:crypto";

// Comparação de strings em tempo constante — pra segredos (X-Internal-Secret).
// Um `===` normal retorna assim que acha o primeiro byte diferente, o que em
// teoria vaza o tamanho do prefixo correto por timing. timingSafeEqual evita
// isso. Retorna false direto se algum lado faltar ou os tamanhos diferirem.
export function timingSafeEqualStr(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
