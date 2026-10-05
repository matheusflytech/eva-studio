"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Modal, ModalContent } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

// Confirmação de exclusão. Quando o que se apaga tem negócios dentro, pede
// pra onde eles vão: nunca apaga negócio por tabela.

export function ConfirmarExclusao({
  titulo,
  descricao,
  destinos,
  rotuloDestino = "Mover os negócios para",
  extra,
  onCancelar,
  onConfirmar,
}: {
  titulo: string;
  descricao: string;
  /** Se informado, é obrigatório escolher um destino. */
  destinos?: { id: string; nome: string }[];
  rotuloDestino?: string;
  extra?: React.ReactNode;
  onCancelar: () => void;
  onConfirmar: (destinoId: string) => Promise<string | null>;
}) {
  const [destino, setDestino] = React.useState(destinos?.[0]?.id ?? "");
  const [busy, setBusy] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  async function confirmar() {
    setBusy(true);
    setErro(null);
    const e = await onConfirmar(destino);
    setBusy(false);
    if (e) setErro(e);
  }

  return (
    <Modal open onOpenChange={(o) => !o && onCancelar()}>
      <ModalContent title={titulo} description={descricao}>
        <div className="flex flex-col gap-4">
          {destinos && (
            <div>
              <Label htmlFor="destino">{rotuloDestino}</Label>
              <Select id="destino" value={destino} onChange={(e) => setDestino(e.target.value)}>
                {destinos.map((d) => (
                  <option key={d.id} value={d.id}>{d.nome}</option>
                ))}
              </Select>
            </div>
          )}
          {extra}
          {erro && <p className="text-[13px] text-danger">{erro}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onCancelar}>Cancelar</Button>
            <Button onClick={confirmar} disabled={busy || (!!destinos && !destino)} className="bg-danger text-white hover:bg-danger/90">
              {busy && <Loader2 size={15} className="animate-spin" />} Excluir
            </Button>
          </div>
        </div>
      </ModalContent>
    </Modal>
  );
}
