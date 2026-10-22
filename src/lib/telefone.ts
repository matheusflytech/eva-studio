// ---------------------------------------------------------------------------
// Telefone para exibir: DDI → país → bandeira e o número formatado
// ("+55 21 98171-0669"). Função pura, sem dependência: a ficha grava só
// dígitos com DDI ("5521981710669"), e registro antigo pode ter só DDD +
// número (sem o 55) ou máscara. A bandeira é um SVG local em
// public/bandeiras/<iso>.svg (ver BANDEIRAS).
// ---------------------------------------------------------------------------

export interface PaisDoTelefone {
  /** Código ISO 3166-1 alfa-2 em minúsculas (nome do arquivo da bandeira). */
  iso: string;
  nome: string;
  ddi: string;
}

/** Países com bandeira desenhada em public/bandeiras. */
export const PAISES_DO_TELEFONE: PaisDoTelefone[] = [
  { iso: "br", nome: "Brasil", ddi: "55" },
  { iso: "us", nome: "Estados Unidos", ddi: "1" },
  { iso: "pt", nome: "Portugal", ddi: "351" },
  { iso: "ar", nome: "Argentina", ddi: "54" },
  { iso: "mx", nome: "México", ddi: "52" },
  { iso: "co", nome: "Colômbia", ddi: "57" },
  { iso: "cl", nome: "Chile", ddi: "56" },
  { iso: "pe", nome: "Peru", ddi: "51" },
  { iso: "uy", nome: "Uruguai", ddi: "598" },
  { iso: "py", nome: "Paraguai", ddi: "595" },
  { iso: "es", nome: "Espanha", ddi: "34" },
  { iso: "fr", nome: "França", ddi: "33" },
  { iso: "de", nome: "Alemanha", ddi: "49" },
  { iso: "it", nome: "Itália", ddi: "39" },
  { iso: "gb", nome: "Reino Unido", ddi: "44" },
];

/** isos com arquivo em public/bandeiras (o teste confere que existem). */
export const BANDEIRAS = PAISES_DO_TELEFONE.map((p) => p.iso);

// DDI mais longo primeiro: "598" (Uruguai) não pode virar "59…".
const POR_DDI = [...PAISES_DO_TELEFONE].sort((a, b) => b.ddi.length - a.ddi.length);

export interface TelefoneFormatado {
  /** Texto para mostrar ("+55 21 98171-0669"). */
  texto: string;
  /** Só dígitos, com DDI quando se sabe (para link tel:/wa.me). */
  digitos: string;
  pais: PaisDoTelefone | null;
}

/** "981710669" → "98171-0669"; "31710669" → "3171-0669". */
function numeroBR(n: string): string {
  return n.length > 4 ? `${n.slice(0, n.length - 4)}-${n.slice(-4)}` : n;
}

/**
 * Agrupa de 3 em 3; o resto vira grupos de 4 no fim, para nunca sobrar um ou
 * dois dígitos sozinhos ("912 345 678", "312 345 678 9" não: "312 345 6789").
 */
function emGrupos(n: string): string {
  if (n.length <= 4) return n;
  const resto = n.length % 3;
  const finais = resto === 0 ? 0 : resto === 1 ? 1 : n.length >= 8 ? 2 : 0;
  const corte = n.length - finais * 4;
  const grupos: string[] = [];
  for (let i = 0; i < corte; i += 3) grupos.push(n.slice(i, i + 3));
  for (let i = corte; i < n.length; i += 4) grupos.push(n.slice(i, i + 4));
  return grupos.join(" ");
}

function formatarNacional(pais: PaisDoTelefone, nacional: string): string {
  if (pais.ddi === "55" && (nacional.length === 10 || nacional.length === 11)) {
    return `${nacional.slice(0, 2)} ${numeroBR(nacional.slice(2))}`;
  }
  if (pais.ddi === "1" && nacional.length === 10) {
    return `${nacional.slice(0, 3)} ${nacional.slice(3, 6)} ${nacional.slice(6)}`;
  }
  return emGrupos(nacional);
}

/**
 * Telefone gravado → texto, dígitos e país. null quando não há telefone.
 * Sem "+" e com 10–11 dígitos = Brasil sem DDI (registro antigo). DDI
 * desconhecido mostra "+<dígitos>" agrupado, sem país.
 */
export function formatarTelefone(bruto: string | null | undefined): TelefoneFormatado | null {
  const texto = (bruto ?? "").trim();
  if (!texto) return null;
  const digitos = texto.replace(/\D/g, "");
  if (!digitos) return { texto, digitos: "", pais: null };

  const internacional = texto.startsWith("+") || texto.startsWith("00") || digitos.length > 11;
  const semZeros = texto.startsWith("00") ? digitos.slice(2) : digitos;

  if (!internacional) {
    if (digitos.length === 10 || digitos.length === 11) {
      const br = POR_DDI.find((p) => p.ddi === "55")!;
      return { texto: `+55 ${formatarNacional(br, digitos)}`, digitos: `55${digitos}`, pais: br };
    }
    // Ramal, número curto ou lixo: mostra como veio.
    return { texto, digitos, pais: null };
  }

  const pais = POR_DDI.find((p) => semZeros.startsWith(p.ddi) && semZeros.length - p.ddi.length >= 6) ?? null;
  if (!pais) return { texto: `+${emGrupos(semZeros)}`, digitos: semZeros, pais: null };
  return { texto: `+${pais.ddi} ${formatarNacional(pais, semZeros.slice(pais.ddi.length))}`, digitos: semZeros, pais };
}

/**
 * Link para abrir a conversa no WhatsApp Web. Só com número completo (DDI +
 * número, 10 a 15 dígitos, padrão E.164); sem isso, null e a tela não mostra o
 * botão. Brasil sem DDI ganha o 55, como em formatarTelefone.
 */
export function linkDoWhatsAppWeb(bruto: string | null | undefined): string | null {
  const t = formatarTelefone(bruto);
  if (!t || t.digitos.length < 10 || t.digitos.length > 15) return null;
  if (!t.pais && !(bruto ?? "").trim().startsWith("+")) return null;
  return `https://web.whatsapp.com/send?phone=${t.digitos}`;
}
