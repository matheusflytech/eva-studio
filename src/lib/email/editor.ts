// ---------------------------------------------------------------------------
// Corpo do e-mail: do editor simples (ou do HTML avançado) para o HTML que sai.
//
// Editor simples, uma regra por linha, de propósito pequena:
//   parágrafo        texto comum; linha em branco separa parágrafos
//   **negrito**      negrito
//   [texto](url)     link
//   - item           lista
//   [[Texto|url]]    botão (linha sozinha)
//
// O resultado vai dentro de um layout de e-mail compatível (tabela, estilos
// inline, largura 600px) com o rodapé de descadastro sempre no fim: é o que
// Gmail e Outlook pedem e o que segura a entregabilidade. Puro: a prévia do
// editor usa a mesma função que o envio.
// ---------------------------------------------------------------------------

export type ModoDoCorpo = "simples" | "html";

export function escaparHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Só http(s) e mailto: nada de javascript: num link de e-mail. */
function urlSegura(url: string): string | null {
  const u = url.trim();
  return /^(https?:\/\/|mailto:)/i.test(u) ? u : null;
}

const COR = "#308ce8";

function emLinha(texto: string): string {
  let s = escaparHtml(texto);
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, rotulo: string, url: string) => {
    const seguro = urlSegura(url.replace(/&amp;/g, "&"));
    return seguro ? `<a href="${escaparHtml(seguro)}" style="color:${COR};">${rotulo}</a>` : rotulo;
  });
  return s;
}

function botao(rotulo: string, url: string): string {
  const seguro = urlSegura(url);
  if (!seguro) return `<p style="margin:0 0 16px;">${escaparHtml(rotulo)}</p>`;
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;"><tr>` +
    `<td style="border-radius:8px;background:${COR};">` +
    `<a href="${escaparHtml(seguro)}" style="display:inline-block;padding:12px 22px;color:#ffffff;font-weight:600;text-decoration:none;border-radius:8px;">${escaparHtml(rotulo)}</a>` +
    `</td></tr></table>`
  );
}

/** Editor simples → HTML do miolo (sem layout). */
export function simplesParaHtml(fonte: string): string {
  const blocos = fonte.replace(/\r\n/g, "\n").split(/\n\s*\n/);
  const partes: string[] = [];
  for (const bloco of blocos) {
    const linhas = bloco.split("\n").map((l) => l.trimEnd()).filter((l) => l.trim() !== "");
    if (linhas.length === 0) continue;
    const b = linhas.length === 1 ? linhas[0].trim().match(/^\[\[(.+?)\|(.+?)\]\]$/) : null;
    if (b) {
      partes.push(botao(b[1].trim(), b[2].trim()));
      continue;
    }
    if (linhas.every((l) => /^\s*-\s+/.test(l))) {
      partes.push(
        `<ul style="margin:0 0 16px;padding-left:20px;">` +
          linhas.map((l) => `<li style="margin:0 0 6px;">${emLinha(l.replace(/^\s*-\s+/, ""))}</li>`).join("") +
          `</ul>`
      );
      continue;
    }
    partes.push(`<p style="margin:0 0 16px;">${linhas.map(emLinha).join("<br>")}</p>`);
  }
  return partes.join("\n");
}

/** Editor simples → texto puro (a versão "text/plain" que acompanha o HTML). */
export function simplesParaTexto(fonte: string): string {
  return fonte
    .replace(/\r\n/g, "\n")
    .replace(/^\[\[(.+?)\|(.+?)\]\]$/gm, "$1: $2")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, "$1 ($2)")
    .trim();
}

/** HTML → texto puro, para o e-mail feito no modo HTML. */
export function htmlParaTexto(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface Rodape {
  /** Nome de quem envia (o contrato). */
  remetente: string;
  /** Link de descadastro (obrigatório em todo e-mail que sai). */
  linkDeDescadastro: string;
}

/** Miolo (simples já convertido, ou HTML avançado) dentro do layout com rodapé. */
export function montarHtml(miolo: string, rodape: Rodape, assunto = ""): string {
  const link = escaparHtml(rodape.linkDeDescadastro);
  return (
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1"><title>${escaparHtml(assunto)}</title></head>` +
    `<body style="margin:0;padding:0;background:#f4f6f9;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;"><tr><td align="center" style="padding:24px 12px;">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;">` +
    `<tr><td style="padding:28px 28px 12px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#1f2a37;">${miolo}</td></tr>` +
    `</table>` +
    `<p style="max-width:600px;margin:16px auto 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#6b7280;">` +
    `Você recebeu este e-mail de ${escaparHtml(rodape.remetente)}. ` +
    `<a href="${link}" style="color:#6b7280;">Não quero mais receber e-mails</a>.</p>` +
    `</td></tr></table></body></html>`
  );
}
