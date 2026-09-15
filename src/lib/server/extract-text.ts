import "server-only";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";

// Extrai texto puro de um arquivo pra injetar como contexto no prompt do
// agente. Sem OCR (PDF escaneado como imagem não extrai nada) e sem chunking
// — ver docs/CHATBOT_ENGINE.md sobre essa escolha (poucos documentos
// pequenos, não é um pipeline de RAG com embeddings).
export async function extractText(buffer: Buffer, mimeType: string, fileName: string): Promise<string> {
  const lower = fileName.toLowerCase();

  if (mimeType === "application/pdf" || lower.endsWith(".pdf")) {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result.text ?? "";
    } finally {
      await parser.destroy();
    }
  }

  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lower.endsWith(".docx")
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value ?? "";
  }

  // .txt e qualquer outra coisa que não seja PDF/DOCX: assume UTF-8 puro.
  return buffer.toString("utf-8");
}
