// Personalização do disparo: {firstname} / {primeiro_nome}, nome achado pelo
// telefone e nome digitado na lista ("5511999998888 Maria"). Puro.

/** "MARIA DA SILVA" -> "Maria". Vazio fica vazio. */
export function primeiroNome(nome: string | null | undefined): string {
  const p = String(nome ?? "").trim().split(/\s+/)[0] ?? "";
  if (!p || /\d/.test(p)) return "";
  return p.charAt(0).toLocaleUpperCase("pt-BR") + p.slice(1).toLocaleLowerCase("pt-BR");
}

/**
 * Troca {campo} pelo valor. Campo vazio leva junto o espaço/vírgula de antes,
 * então "Olá, {firstname}," sem nome vira "Olá," e não "Olá, ,".
 */
export function interpolar(texto: string, valores: Record<string, unknown>): string {
  return texto.replace(/([ \t]*,?[ \t]*)\{(\w+)\}/g, (_, antes: string, chave: string) => {
    const v = valores[chave];
    const s = v === undefined || v === null ? "" : String(v).trim();
    return s ? antes + s : "";
  });
}

/** Telefones como podem estar gravados na ficha (com/sem 55, com/sem nono dígito). */
export function telefonesPossiveis(destino: string): string[] {
  const d = destino.split("@")[0].replace(/\D/g, "");
  const com55 = d.length === 10 || d.length === 11 ? "55" + d : d;
  const out = new Set([d, com55]);
  if (com55.startsWith("55") && com55.length === 13) out.add(com55.slice(0, 4) + com55.slice(5));
  if (com55.startsWith("55") && com55.length === 12) out.add(com55.slice(0, 4) + "9" + com55.slice(4));
  for (const t of [...out]) if (t.startsWith("55")) out.add(t.slice(2));
  return [...out].filter((t) => t.length >= 10);
}

export interface LinhaDeContato {
  numero: string;
  nome: string;
}

/**
 * Lista digitada: uma pessoa por linha, número e (opcional) nome, em qualquer
 * ordem: "5511999998888 Maria", "Maria; 5511999998888". Linha só com números
 * separados por vírgula vale como vários números. Grupo/jid (com @) passa igual.
 */
export function lerContatos(texto: string): LinhaDeContato[] {
  const out: LinhaDeContato[] = [];
  for (const linha of texto.split(/\r?\n/)) {
    const l = linha.trim();
    if (!l) continue;
    if (l.includes("@")) {
      out.push({ numero: l, nome: "" });
      continue;
    }
    const nome = l.replace(/[+\d()\-.\s;,\t]+/g, " ").trim();
    if (!nome) {
      for (const n of l.split(",").map((c) => c.trim()).filter(Boolean)) out.push({ numero: n, nome: "" });
      continue;
    }
    const numero = (l.match(/\+?[\d()\-.\s]{10,}/) ?? [""])[0].trim();
    if (numero) out.push({ numero, nome });
  }
  return out;
}
