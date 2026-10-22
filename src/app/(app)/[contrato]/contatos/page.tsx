"use client";

import * as React from "react";
import { Upload } from "lucide-react";
import { useContrato, useSearchParams } from "@/lib/contrato/navegacao";
import { useAgentsStore } from "@/lib/stores/agents-store";
import { Notice } from "@/components/ui/notice";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { ListaDeContatos, type VistaDaLista } from "@/components/crm/contatos/lista-de-contatos";
import { FichaDoContato } from "@/components/crm/contatos/ficha-do-contato";
import { PainelDeContatos, ProximasAtividades } from "@/components/crm/contatos/painel";
import { CabecalhoDeContatos, type AbaDeContatos } from "@/components/crm/contatos/cabecalho";
import { ImportarContatos, NovoContato } from "@/components/crm/contatos/modais";
import { SegmentsTab, TagsTab } from "@/components/crm/contatos/etiquetas-e-segmentos";
import { useOpcoesDoCrm } from "@/components/crm/listas/use-opcoes-do-crm";
import { useListaSalva } from "@/components/crm/listas/use-lista-salva";
import type { Contact, SegmentRow, TagRow } from "@/components/crm/contatos/tipos";

// Contatos: a lista (visões, filtros, Lista com painel ou Tabela paginada no
// servidor), a ficha (no painel da Lista; em gaveta na Tabela e no celular),
// criar e importar, e as seções Etiquetas e Segmentos.

// A forma de ver (Lista | Tabela) fica no navegador, por contrato.
const validarVista = (bruto: string | null): string[] => {
  try {
    const v = JSON.parse(bruto ?? "null");
    return Array.isArray(v) && v[0] === "tabela" ? ["tabela"] : ["lista"];
  } catch {
    return ["lista"];
  }
};

// O painel da direita só existe a partir de lg (1024px); abaixo, gaveta.
const TELA_LARGA = "(min-width: 1024px)";
function assinarTela(avisar: () => void) {
  const m = window.matchMedia(TELA_LARGA);
  m.addEventListener("change", avisar);
  return () => m.removeEventListener("change", avisar);
}
function useTelaLarga(): boolean {
  return React.useSyncExternalStore(
    assinarTela,
    () => window.matchMedia(TELA_LARGA).matches,
    () => true
  );
}

function ContatosConteudo() {
  const { agents, isLoaded, load } = useAgentsStore();
  const agentId = agents[0]?.id ?? null;
  const contrato = useContrato();
  const opcoes = useOpcoesDoCrm("contatos");
  const [tags, setTags] = React.useState<TagRow[]>([]);
  const [segments, setSegments] = React.useState<SegmentRow[]>([]);
  const [selected, setSelected] = React.useState<Contact | null>(null);
  const [versao, setVersao] = React.useState(0);
  const [criando, setCriando] = React.useState(false);
  const [aba, setAba] = React.useState<AbaDeContatos>("contatos");
  const [vistaSalva, gravarVista] = useListaSalva(`eva:contatos:vista:${contrato}`, validarVista);
  const vista = vistaSalva[0] as VistaDaLista;
  const telaLarga = useTelaLarga();
  // Na Lista em tela larga a ficha mora no painel; senão, na gaveta.
  const fichaNoPainel = aba === "contatos" && vista === "lista" && telaLarga;
  // "Criar contato" da busca global: /contatos?novo=<carimbo>, uma vez por carimbo.
  const sp = useSearchParams();
  const pedidoDeNovo = sp.get("novo");
  const [pedidoAtendido, setPedidoAtendido] = React.useState<string | null>(null);
  if (pedidoDeNovo && pedidoDeNovo !== pedidoAtendido) {
    setPedidoAtendido(pedidoDeNovo);
    setCriando(true);
  }
  const fecharNovo = React.useCallback(() => {
    setCriando(false);
    // Recarregar a página não reabre o formulário.
    const q = new URLSearchParams(window.location.search);
    if (!q.has("novo")) return;
    q.delete("novo");
    const qs = q.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, []);
  const [importando, setImportando] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isLoaded) load();
  }, [isLoaded, load]);

  const refreshTags = React.useCallback(() => {
    fetch(`/api/tags`)
      .then((r) => r.json())
      .then((d) => setTags(d.tags ?? []))
      .catch(() => undefined);
  }, []);
  const refreshSegments = React.useCallback(() => {
    fetch(`/api/segments`)
      .then((r) => r.json())
      .then((d) => setSegments(d.segments ?? []))
      .catch(() => undefined);
  }, []);
  React.useEffect(() => {
    refreshTags();
    refreshSegments();
  }, [refreshTags, refreshSegments]);

  // Abrir pelo id: link vindo de outra tela (?abrir=) e o nome nas próximas atividades.
  const abrirPorId = React.useCallback((id: string) => {
    fetch(`/api/contacts/${id}`)
      .then((r) => r.json())
      .then((d) => d.contact && setSelected(d.contact as Contact))
      .catch(() => {});
  }, []);
  const abrir = sp.get("abrir");
  React.useEffect(() => {
    if (abrir) abrirPorId(abrir);
  }, [abrir, abrirPorId]);

  const mudou = React.useCallback(() => {
    setVersao((v) => v + 1);
    refreshTags();
  }, [refreshTags]);

  // Mudança que chega depois (o "Desfazer" da etiqueta na ilha) não reabre
  // uma ficha que a pessoa já fechou ou trocou.
  const aoMudarContato = React.useCallback(
    (updated: Contact) => {
      setSelected((s) => (s && s.id === updated.id ? updated : s));
      mudou();
    },
    [mudou]
  );

  const ficha = (modo: "painel" | "gaveta") =>
    selected && (
      <FichaDoContato
        key={selected.id}
        contact={selected}
        tags={tags}
        modo={modo}
        onClose={() => setSelected(null)}
        onChanged={aoMudarContato}
        onDeleted={() => {
          setSelected(null);
          mudou();
        }}
        onRestored={mudou}
      />
    );

  const menuSemLista = (
    <DropdownMenuItem onSelect={() => setImportando(true)}>
      <Upload aria-hidden="true" /> Importar
    </DropdownMenuItem>
  );

  return (
    <div className={`flex flex-1 flex-col gap-4 px-4 pb-4 pt-2 lg:px-6 ${aba === "contatos" && vista === "lista" ? "min-h-0" : ""}`}>
      {error && (
        <Notice tone="danger" onDismiss={() => setError(null)}>
          {error}
        </Notice>
      )}

      {aba === "contatos" && (
        <ListaDeContatos
          opcoes={opcoes}
          versao={versao}
          onAbrir={setSelected}
          onCriar={() => setCriando(true)}
          onImportar={() => setImportando(true)}
          aba={aba}
          onAba={setAba}
          vista={vista}
          onVista={(v) => gravarVista([v])}
          abertoId={selected?.id ?? null}
          painel={
            <PainelDeContatos chave={selected?.id ?? "agenda"}>
              {selected ? ficha("painel") : <ProximasAtividades versao={versao} onAbrirContato={abrirPorId} />}
            </PainelDeContatos>
          }
        />
      )}

      {aba === "etiquetas" && (
        <>
          <CabecalhoDeContatos
            rotulo={`${tags.length} ${tags.length === 1 ? "etiqueta" : "etiquetas"}`}
            aba={aba}
            onAba={setAba}
            onNovo={() => setCriando(true)}
            menu={menuSemLista}
          />
          <TagsTab
            tags={tags}
            onChanged={() => {
              refreshTags();
              opcoes.recarregar();
            }}
            onError={setError}
          />
        </>
      )}

      {aba === "segmentos" && (
        <>
          <CabecalhoDeContatos
            rotulo={`${segments.length} ${segments.length === 1 ? "segmento" : "segmentos"}`}
            aba={aba}
            onAba={setAba}
            onNovo={() => setCriando(true)}
            menu={menuSemLista}
          />
          <SegmentsTab segments={segments} tags={tags} onChanged={refreshSegments} onError={setError} />
        </>
      )}

      {!fichaNoPainel && ficha("gaveta")}

      {criando && (
        <NovoContato
          agentId={agentId}
          onClose={fecharNovo}
          onCreated={() => {
            fecharNovo();
            mudou();
          }}
        />
      )}
      {importando && (
        <ImportarContatos
          agentId={agentId}
          tags={tags}
          onClose={() => setImportando(false)}
          onDone={() => {
            setImportando(false);
            mudou();
          }}
        />
      )}
    </div>
  );
}

export default function ContatosPage() {
  // useSearchParams exige Suspense: sem ele o Next recusa gerar a página.
  return (
    <React.Suspense fallback={<div className="flex-1" />}>
      <ContatosConteudo />
    </React.Suspense>
  );
}
