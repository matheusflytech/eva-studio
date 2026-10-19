"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { useSearchParams } from "@/lib/contrato/navegacao";
import { useAgentsStore } from "@/lib/stores/agents-store";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Notice } from "@/components/ui/notice";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ListaDeContatos } from "@/components/crm/contatos/lista-de-contatos";
import { FichaDoContato } from "@/components/crm/contatos/ficha-do-contato";
import { ImportarContatos, NovoContato } from "@/components/crm/contatos/modais";
import { SegmentsTab, TagsTab } from "@/components/crm/contatos/etiquetas-e-segmentos";
import { useOpcoesDoCrm } from "@/components/crm/listas/use-opcoes-do-crm";
import type { Contact, SegmentRow, TagRow } from "@/components/crm/contatos/tipos";

// Contatos: a lista (abas de visão, filtros, tabela paginada no servidor), a
// ficha em gaveta, criar e importar, e as abas Etiquetas e Segmentos.

function ContatosConteudo() {
  const { agents, isLoaded, load } = useAgentsStore();
  const agentId = agents[0]?.id ?? null;
  const opcoes = useOpcoesDoCrm("contatos");
  const [tags, setTags] = React.useState<TagRow[]>([]);
  const [segments, setSegments] = React.useState<SegmentRow[]>([]);
  const [selected, setSelected] = React.useState<Contact | null>(null);
  const [versao, setVersao] = React.useState(0);
  const [criando, setCriando] = React.useState(false);
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

  // Link vindo de outra tela (a caixa de entrada abre a ficha completa daqui).
  const abrir = useSearchParams().get("abrir");
  React.useEffect(() => {
    if (!abrir) return;
    fetch(`/api/contacts/${abrir}`)
      .then((r) => r.json())
      .then((d) => d.contact && setSelected(d.contact as Contact))
      .catch(() => {});
  }, [abrir]);

  const mudou = React.useCallback(() => {
    setVersao((v) => v + 1);
    refreshTags();
  }, [refreshTags]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Contatos"
        actions={
          <Button variant="primary" onClick={() => setCriando(true)}>
            <Plus size={14} aria-hidden="true" />
            Criar contato
          </Button>
        }
      />

      {error && (
        <Notice tone="danger" onDismiss={() => setError(null)}>
          {error}
        </Notice>
      )}

      <Tabs defaultValue="contatos">
        <TabsList>
          <TabsTrigger value="contatos">Contatos</TabsTrigger>
          <TabsTrigger value="etiquetas">Etiquetas</TabsTrigger>
          <TabsTrigger value="segmentos">Segmentos</TabsTrigger>
        </TabsList>

        <TabsContent value="contatos" className="mt-3">
          <ListaDeContatos
            opcoes={opcoes}
            versao={versao}
            onAbrir={setSelected}
            onCriar={() => setCriando(true)}
            onImportar={() => setImportando(true)}
          />
        </TabsContent>

        <TabsContent value="etiquetas" className="mt-4">
          <TagsTab
            tags={tags}
            onChanged={() => {
              refreshTags();
              opcoes.recarregar();
            }}
            onError={setError}
          />
        </TabsContent>

        <TabsContent value="segmentos" className="mt-4">
          <SegmentsTab segments={segments} tags={tags} onChanged={refreshSegments} onError={setError} />
        </TabsContent>
      </Tabs>

      {selected && (
        <FichaDoContato
          contact={selected}
          tags={tags}
          onClose={() => setSelected(null)}
          onChanged={(updated) => {
            setSelected(updated);
            mudou();
          }}
          onDeleted={() => {
            setSelected(null);
            mudou();
          }}
        />
      )}

      {criando && (
        <NovoContato
          agentId={agentId}
          onClose={() => setCriando(false)}
          onCreated={() => {
            setCriando(false);
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
