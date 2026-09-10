"use client";

import * as React from "react";
import { Upload, FileText, X, Loader2, AlertTriangle } from "lucide-react";
import { formatBytes } from "@/lib/utils";
import type { KnowledgeDoc } from "@/lib/data/types";

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
}

export function KnowledgeBaseUploader({
  agentId,
  docs,
  onChange,
}: {
  agentId: string;
  docs: KnowledgeDoc[];
  onChange: (docs: KnowledgeDoc[]) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [uploadingNames, setUploadingNames] = React.useState<string[]>([]);
  const [isDragging, setIsDragging] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    setError(null);
    setUploadingNames((prev) => [...prev, ...files.map((f) => f.name)]);

    for (const file of files) {
      try {
        const dataBase64 = await toBase64(file);
        const res = await fetch(`/api/agents/${agentId}/knowledge`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: file.name, mimeType: file.type, dataBase64 }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Falha no upload.");
        onChange([...docs, data.doc]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Não consegui enviar esse arquivo.");
      } finally {
        setUploadingNames((prev) => prev.filter((n) => n !== file.name));
      }
    }
  }

  async function removeDoc(id: string) {
    const previous = docs;
    onChange(docs.filter((d) => d.id !== id));
    const res = await fetch(`/api/agents/${agentId}/knowledge/${id}`, { method: "DELETE" });
    if (!res.ok) {
      onChange(previous); // desfaz se a remoção falhar de verdade no servidor
      setError("Não consegui remover esse documento.");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={`flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
          isDragging ? "border-accent-500 bg-accent-soft" : "border-border-default bg-surface-2 hover:border-border-strong"
        }`}
      >
        <Upload size={20} className="text-text-tertiary" />
        <p className="text-[13px] font-medium text-text-secondary">
          Arraste arquivos aqui ou clique para selecionar
        </p>
        <p className="text-[12px] text-text-tertiary">PDF, DOCX, TXT — até 20MB cada</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.txt"
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </button>

      {error && (
        <p className="flex items-center gap-1.5 text-[12.5px] text-danger">
          <AlertTriangle size={13} /> {error}
        </p>
      )}

      {(docs.length > 0 || uploadingNames.length > 0) && (
        <ul className="flex flex-col gap-2">
          {docs.map((doc) => (
            <li
              key={doc.id}
              className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-2 px-3.5 py-2.5"
            >
              <FileText size={16} className="shrink-0 text-text-secondary" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-text-primary">{doc.fileName}</p>
                <p className="text-[11.5px] text-text-tertiary">{formatBytes(doc.sizeBytes)}</p>
              </div>
              <button
                type="button"
                onClick={() => removeDoc(doc.id)}
                className="shrink-0 rounded-lg p-1 text-text-tertiary hover:bg-surface-3 hover:text-danger"
              >
                <X size={14} />
              </button>
            </li>
          ))}
          {uploadingNames.map((name) => (
            <li
              key={name}
              className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-2 px-3.5 py-2.5 opacity-70"
            >
              <Loader2 size={16} className="shrink-0 animate-spin text-text-secondary" />
              <p className="truncate text-[13px] text-text-secondary">Enviando {name}...</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
