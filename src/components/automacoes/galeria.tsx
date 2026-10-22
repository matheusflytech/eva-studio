"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { Modal, ModalContent } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { cn } from "@/lib/utils";
import { CATEGORY_CLASSES } from "@/lib/design-system/category-classes";
import { MODELOS } from "@/lib/automacoes/modelos";
import { NOMES_DOS_OBJETOS } from "@/lib/automacoes/catalogo";
import { fraseDaAutomacao } from "@/lib/automacoes/frase";
import { OBJETOS, type Objeto } from "@/lib/automacoes/tipos";
import { ICONE_DO_OBJETO, visualDoPasso } from "./comum";

// Galeria antes da tela em branco: modelos prontos (o que depende do contrato
// fica para escolher no editor) ou "Em branco" escolhendo o tipo de registro.
export function Galeria({ aberta, fechar, criar }: { aberta: boolean; fechar: () => void; criar: (p: { modeloId?: string; objeto?: Objeto }) => Promise<void> }) {
  const [ocupado, setOcupado] = React.useState<string | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const categorias = [...new Set(MODELOS.map((m) => m.categoria))];

  async function escolher(chave: string, p: { modeloId?: string; objeto?: Objeto }) {
    setOcupado(chave);
    setErro(null);
    try {
      await criar(p);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não deu certo.");
      setOcupado(null);
    }
  }

  return (
    <Modal open={aberta} onOpenChange={(v) => !v && fechar()}>
      <ModalContent size="lg" title="Nova automação" description="Comece por um modelo pronto ou em branco.">
        <div className="flex flex-col gap-5 overflow-y-auto px-5 pb-5">
          {erro && <Notice tone="danger">{erro}</Notice>}
          <section>
            <p className="eyebrow mb-2">Em branco</p>
            <div className="flex flex-wrap gap-2">
              {OBJETOS.map((o) => {
                const Icone = ICONE_DO_OBJETO[o];
                return (
                  <Button key={o} type="button" variant="secondary" size="sm" disabled={!!ocupado} onClick={() => void escolher(`branco:${o}`, { objeto: o })}>
                    <Icone size={14} /> {NOMES_DOS_OBJETOS[o].plural}
                  </Button>
                );
              })}
            </div>
          </section>
          {categorias.map((cat) => (
            <section key={cat}>
              <p className="eyebrow mb-2">{cat}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {MODELOS.filter((m) => m.categoria === cat).map((m) => {
                  const d = m.definicao();
                  const primeiro = d.inicio ? d.nos[d.inicio] : null;
                  const v = visualDoPasso(primeiro?.tipo ?? "gatilho", primeiro?.tipo === "acao" ? primeiro.acao : undefined);
                  const Icone = v.icone;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      disabled={!!ocupado}
                      onClick={() => void escolher(m.id, { modeloId: m.id })}
                      className={cn(
                        "flex gap-3 rounded-xl border border-border-default bg-panel p-3 text-left transition-colors hover:border-border-strong hover:bg-raised disabled:opacity-60",
                        ocupado === m.id && "border-accent-solid"
                      )}
                    >
                      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", CATEGORY_CLASSES[v.cor].subtle, CATEGORY_CLASSES[v.cor].fg)}>
                        <Icone size={17} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[13px] font-medium text-text-primary">{m.nome}</span>
                        <span className="mt-0.5 block text-[12px] leading-snug text-text-secondary">{m.descricao}</span>
                        <span className="mt-1 block truncate text-[11px] text-text-tertiary" title={fraseDaAutomacao(d)}>
                          {NOMES_DOS_OBJETOS[m.objeto].plural} · {fraseDaAutomacao(d)}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
          <p className="flex items-center gap-1.5 text-[12px] text-text-tertiary">
            <Plus size={12} /> O que o modelo não sabe do seu contrato (etapa, pessoas, modelo aprovado) fica marcado para você escolher antes de ligar.
          </p>
        </div>
      </ModalContent>
    </Modal>
  );
}
