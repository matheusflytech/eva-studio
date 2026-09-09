"use client";

import * as React from "react";
import { Upload, FileText, X, Loader2 } from "lucide-react";
import { generateId, formatBytes } from "@/lib/utils";
import type { KnowledgeDoc } from "@/lib/data/types";

export function KnowledgeBaseUploader({
  docs,
  onChange,
}: {
  docs: KnowledgeDoc[];
  onChange: (docs: KnowledgeDoc[]) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [uploadingNames, setUploadingNames] = React.useState<string[]>([]);
  const [isDragging, setIsDragging] = React.useState(false);

  function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    setUploadingNames(files.map((f) => f.name));

    // Simulated upload delay for perceived robustness — no file content is read or stored.
    setTimeout(() => {
      const newDocs: KnowledgeDoc[] = files.map((file) => ({
        id: generateId(),
        fileName: file.name,
        sizeBytes: file.size,
        mimeType: file.type || "application/octet-stream",
        uploadedAt: new Date().toISOString(),
      }));
      onChange([...docs, ...newDocs]);
      setUploadingNames([]);
    }, 650);
  }

  function removeDoc(id: string) {
    onChange(docs.filter((d) => d.id !== id));
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
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </button>

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
