"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { Modal, ModalContent } from "@/components/ui/modal";
import { Notice } from "@/components/ui/notice";
import { cn } from "@/lib/utils";
import { CATEGORY_CLASSES } from "@/lib/design-system/category-classes";
import { MODELOS } from "@/lib/automacoes/modelos";
import { gatilhosDoObjeto, NOMES_DOS_OBJETOS } from "@/lib/automacoes/catalogo";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { fraseDaAutomacao } from "@/lib/automacoes/frase";
import { OBJETOS, type Objeto } from "@/lib/automacoes/tipos";
import { ICONE_DO_OBJETO, IconeDoPasso, visualDoPasso } from "./comum";

// Como começar uma automação: do zero (escolhe sobre o que ela roda e monta
// tudo no canvas) ou por um modelo pronto (o que depende do contrato fica
// para escolher no editor). "Nova automação" abre em "Do zero"; "Modelos", nos modelos.
type Aba = "zero" | "modelos";

export function Galeria({
  aberta,
  aba: abaInicial = "zero",
  fechar,
  criar,
}: {
  aberta: boolean;
  aba?: Aba;
  fechar: () => void;
  criar: (p: { modeloId?: string; objeto?: Objeto }) => Promise<void>;
}) {
  const [aba, setAba] = React.useState<Aba>(abaInicial);
  React.useEffect(() => {
    if (aberta) setAba(abaInicial);
  }, [aberta, abaInicial]);
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
      <ModalContent size="lg" title="Nova automação" description="Monte do zero ou comece por um modelo pronto.">
        <div className="flex flex-col gap-5 overflow-y-auto px-5 pb-5">
          <SegmentedControl
            label="Como começar"
            value={aba}
            onChange={setAba}
            options={[
              { value: "zero", label: "Do zero" },
              { value: "modelos", label: "Modelos" },
            ]}
            className="self-start"
          />
          {erro && <Notice tone="danger">{erro}</Notice>}
          {aba === "zero" && (
            <section className="flex flex-col gap-3">
              <p className="text-small text-text-secondary">Sobre o que ela roda? Depois você escolhe o gatilho e monta os passos no canvas.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {OBJETOS.map((o) => {
                  const Icone = ICONE_DO_OBJETO[o];
                  const exemplos = gatilhosDoObjeto(o).slice(0, 3).map((g) => g.nome);
                  return (
                    <button
                      key={o}
                      type="button"
                      disabled={!!ocupado}
                      onClick={() => void escolher(`branco:${o}`, { objeto: o })}
                      className={cn(
                        "flex gap-3 rounded-[14px] border border-border-subtle bg-panel p-3 text-left transition-colors hover:bg-raised disabled:opacity-60",
                        ocupado === `branco:${o}` && "border-accent-solid ring-1 ring-accent-solid"
                      )}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-raised text-text-secondary">
                        <Icone size={16} aria-hidden="true" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-small font-medium text-text-primary">{NOMES_DOS_OBJETOS[o].plural}</span>
                        <span className="mt-0.5 block text-caption text-text-tertiary">{exemplos.join(" · ")}{exemplos.length ? "…" : ""}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
          {aba === "modelos" && categorias.map((cat) => (
            <section key={cat}>
              <p className="mb-2 font-mono text-caption text-text-tertiary">{cat}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {MODELOS.filter((m) => m.categoria === cat).map((m) => {
                  const d = m.definicao();
                  const primeiro = d.inicio ? d.nos[d.inicio] : null;
                  const v = visualDoPasso(primeiro?.tipo ?? "gatilho", primeiro?.tipo === "acao" ? primeiro.acao : undefined);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      disabled={!!ocupado}
                      onClick={() => void escolher(m.id, { modeloId: m.id })}
                      className={cn(
                        "flex gap-3 rounded-[14px] border border-border-subtle bg-panel p-3 text-left transition-colors hover:bg-raised disabled:opacity-60",
                        ocupado === m.id && "border-accent-solid ring-1 ring-accent-solid"
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]",
                          v.marca ? "border border-border-subtle bg-raised" : [CATEGORY_CLASSES[v.cor].subtle, CATEGORY_CLASSES[v.cor].fg]
                        )}
                      >
                        <IconeDoPasso visual={v} tamanho={16} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-small font-medium text-text-primary">{m.nome}</span>
                        <span className="mt-0.5 block text-caption text-text-secondary">{m.descricao}</span>
                        <span className="mt-1 block truncate font-mono text-caption text-text-tertiary" title={fraseDaAutomacao(d)}>
                          {NOMES_DOS_OBJETOS[m.objeto].plural} · {fraseDaAutomacao(d)}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
          {aba === "modelos" && (
            <p className="flex items-start gap-1.5 text-caption text-text-tertiary">
              <Plus size={12} aria-hidden="true" className="mt-0.5 shrink-0" /> O que o modelo não sabe do seu contrato (etapa, pessoas, modelo aprovado) fica marcado para você escolher antes de ligar.
            </p>
          )}
        </div>
      </ModalContent>
    </Modal>
  );
}
