"use client";

import * as React from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Field, Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { Toolbar } from "@/components/ui/toolbar";
import { SearchInput } from "@/components/ui/search-input";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal, ModalContent } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { formatRelativeDate } from "@/lib/utils";
import { DIAS_NA_LIXEIRA, ROTULO_DA_ENTIDADE, diasRestantes, ehEntidadeDaLixeira, textoDeExpiracao } from "@/lib/lixeira";
import { restaurarItem } from "@/components/crm/lixeira/use-apagar-com-desfazer";

interface Item {
  id: string;
  entidade: string;
  entityId: string;
  nome: string;
  detalhe: string;
  apagadoPor: string;
  apagadoEm: string;
  expiraEm: string;
}

interface Resposta {
  disponivel: boolean;
  tipos: string[];
  podeApagarParaSempre: boolean;
  itens: Item[];
}

const PALAVRA = "apagar";

// Configurações → Lixeira: o que foi apagado nos últimos 30 dias (negócios,
// contatos, empresas), com Restaurar e, para dono/admin, "Apagar para
// sempre". Cada pessoa vê os tipos que pode apagar, no escopo do papel.
export function AbaLixeira() {
  const toast = useToast();
  const [dados, setDados] = React.useState<Resposta | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const [busca, setBusca] = React.useState("");
  const [tipo, setTipo] = React.useState("");
  const [ocupado, setOcupado] = React.useState<string | null>(null);
  const [apagando, setApagando] = React.useState<Item | null>(null);

  const carregar = React.useCallback(async (b: string, t: string) => {
    const p = new URLSearchParams();
    if (b.trim()) p.set("busca", b.trim());
    if (t) p.set("tipo", t);
    try {
      const res = await fetch(`/api/lixeira?${p.toString()}`);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(d.error ?? "Não foi possível abrir a lixeira.");
        return;
      }
      setErro(null);
      setDados(d);
    } catch {
      setErro("Sem conexão. Tente de novo.");
    }
  }, []);

  // Busca espera a pessoa parar de digitar.
  React.useEffect(() => {
    const t = window.setTimeout(() => void carregar(busca, tipo), busca ? 250 : 0);
    return () => window.clearTimeout(t);
  }, [busca, tipo, carregar]);

  async function restaurar(item: Item) {
    setOcupado(item.id);
    const r = await restaurarItem(item.id);
    setOcupado(null);
    if (!r.ok) {
      toast({ title: "Não foi possível restaurar", description: r.erro, tone: "danger" });
      return;
    }
    toast({
      title: `${item.nome} restaurado`,
      description: r.avisos.length ? r.avisos.join(" ") : undefined,
      tone: r.avisos.length ? "info" : "success",
      durationMs: r.avisos.length ? 10_000 : undefined,
    });
    void carregar(busca, tipo);
  }

  const podeApagar = !!dados?.podeApagarParaSempre;
  const colunas: DataTableColumn<Item>[] = [
    {
      key: "nome",
      header: "Registro",
      cell: (i) => (
        <div className="min-w-0">
          <p className="truncate text-small font-medium text-text-primary">{i.nome || "Sem nome"}</p>
          {i.detalhe && <p className="truncate text-caption text-text-tertiary">{i.detalhe}</p>}
        </div>
      ),
    },
    {
      key: "tipo",
      header: "Tipo",
      width: "110px",
      cell: (i) => <Badge>{ehEntidadeDaLixeira(i.entidade) ? ROTULO_DA_ENTIDADE[i.entidade] : i.entidade}</Badge>,
    },
    {
      key: "quem",
      header: "Apagado por",
      width: "180px",
      cell: (i) => (
        <div className="min-w-0 text-small">
          <p className="truncate text-text-primary">{i.apagadoPor || "—"}</p>
          <p className="text-caption text-text-tertiary" title={new Date(i.apagadoEm).toLocaleString("pt-BR")}>
            {formatRelativeDate(i.apagadoEm)}
          </p>
        </div>
      ),
    },
    {
      key: "expira",
      header: "Expira",
      width: "140px",
      cell: (i) =>
        diasRestantes(i.expiraEm) <= 3 ? (
          <Badge variant="warning">{textoDeExpiracao(i.expiraEm)}</Badge>
        ) : (
          <span className="text-small text-text-secondary" title={new Date(i.expiraEm).toLocaleDateString("pt-BR")}>
            {textoDeExpiracao(i.expiraEm)}
          </span>
        ),
    },
    {
      key: "acoes",
      header: "Ações",
      hideHeader: true,
      width: podeApagar ? "250px" : "120px",
      cell: (i) => (
        <div className="flex justify-end gap-1">
          <Button variant="secondary" size="sm" loading={ocupado === i.id} disabled={!!ocupado} onClick={() => void restaurar(i)}>
            {ocupado !== i.id && <RotateCcw size={14} aria-hidden="true" />} Restaurar
          </Button>
          {podeApagar && (
            <Button variant="ghost" size="sm" disabled={!!ocupado} onClick={() => setApagando(i)} className="text-danger hover:text-danger">
              <Trash2 size={14} aria-hidden="true" /> Apagar para sempre
            </Button>
          )}
        </div>
      ),
    },
  ];

  const tipos = (dados?.tipos ?? []).filter(ehEntidadeDaLixeira);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-title-sm text-text-primary">Lixeira</h2>
        <p className="mt-0.5 text-small text-text-secondary">
          Negócios, contatos e empresas apagados ficam aqui por {DIAS_NA_LIXEIRA} dias, com tarefas, notas e vínculos. Depois disso somem de vez.
        </p>
      </div>

      {dados && !dados.disponivel && (
        <Notice tone="warning">A lixeira ainda não está ativada neste contrato. Até lá, apagar é definitivo (a tela pede confirmação).</Notice>
      )}
      {erro && <Notice tone="danger">{erro}</Notice>}

      <Toolbar
        label="Filtros da lixeira"
        end={
          <SearchInput aria-label="Buscar na lixeira" placeholder="Buscar pelo nome" value={busca} onValueChange={setBusca} className="w-56" />
        }
      >
        <Select aria-label="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} className="w-40">
          <option value="">Todos os tipos</option>
          {tipos.map((t) => (
            <option key={t} value={t}>
              {ROTULO_DA_ENTIDADE[t]}
            </option>
          ))}
        </Select>
      </Toolbar>

      <DataTable
        caption="Itens na lixeira"
        columns={colunas}
        rows={dados?.itens ?? []}
        getRowKey={(i) => i.id}
        loading={!dados && !erro}
        loadingRows={4}
        empty={
          <EmptyState
            compact
            icon={<Trash2 size={18} aria-hidden="true" className="text-text-tertiary" />}
            title={busca || tipo ? "Nada encontrado" : "A lixeira está vazia"}
            description={busca || tipo ? "Tente outro nome ou tipo." : "O que for apagado aparece aqui e pode ser restaurado."}
          />
        }
      />

      {apagando && (
        <ApagarParaSempre
          item={apagando}
          onFechar={() => setApagando(null)}
          onApagado={() => {
            setApagando(null);
            toast({ title: `${apagando.nome || "Item"} apagado para sempre` });
            void carregar(busca, tipo);
          }}
        />
      )}
    </div>
  );
}

/** Confirmação forte: digitar "apagar". É a única ação sem volta da lixeira. */
function ApagarParaSempre({ item, onFechar, onApagado }: { item: Item; onFechar: () => void; onApagado: () => void }) {
  const [texto, setTexto] = React.useState("");
  const [enviando, setEnviando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const confere = texto.trim().toLowerCase() === PALAVRA;

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    if (!confere) return;
    setEnviando(true);
    setErro(null);
    try {
      const res = await fetch("/api/lixeira", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "apagar_para_sempre", id: item.id }),
      });
      if (!res.ok) {
        setErro((await res.json().catch(() => ({}))).error ?? "Não foi possível apagar.");
        setEnviando(false);
        return;
      }
      onApagado();
    } catch {
      setErro("Sem conexão. Tente de novo.");
      setEnviando(false);
    }
  }

  const tipo = ehEntidadeDaLixeira(item.entidade) ? ROTULO_DA_ENTIDADE[item.entidade].toLowerCase() : "registro";
  return (
    <Modal open onOpenChange={(v) => !v && onFechar()}>
      <ModalContent
        title="Apagar para sempre?"
        description={`O ${tipo} "${item.nome || "Sem nome"}" e tudo o que foi junto (${item.detalhe || "tarefas, notas e vínculos"}) somem de vez. Não dá para desfazer.`}
        footer={
          <>
            <Button variant="ghost" onClick={onFechar}>
              Cancelar
            </Button>
            <Button variant="danger" type="submit" form="form-apagar-para-sempre" disabled={!confere} loading={enviando}>
              Apagar para sempre
            </Button>
          </>
        }
      >
        <form id="form-apagar-para-sempre" onSubmit={confirmar} className="flex flex-col gap-3">
          {erro && <Notice tone="danger">{erro}</Notice>}
          <Field label={`Digite "${PALAVRA}" para confirmar`}>
            <Input id="confirmar-apagar" autoComplete="off" value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus />
          </Field>
        </form>
      </ModalContent>
    </Modal>
  );
}
