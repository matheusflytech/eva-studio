"use client";

import * as React from "react";
import { Bell, Copy, Inbox, Mail, MoreHorizontal, Pencil, Plus, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Field, Input, Label, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Modal, ModalClose, ModalContent, ModalTrigger } from "@/components/ui/modal";
import { Drawer, DrawerClose, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardDescription, CardHeader, CardTitle, Panel } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Toolbar } from "@/components/ui/toolbar";
import { FilterButton } from "@/components/ui/filter-button";
import { ViewTabs } from "@/components/ui/view-tabs";
import { DataTable } from "@/components/ui/data-table";
import { Pagination } from "@/components/ui/pagination";
import { Stat } from "@/components/ui/stat";
import { KanbanCard, KanbanColumn } from "@/components/ui/kanban-column";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle, useTheme } from "@/components/ui/theme";
import { cn } from "@/lib/utils";
import { contrastLevel, contrastRatio, formatRatio } from "@/lib/design-system/contrast";
import {
  CONTRAST_PAIRS,
  MOTION,
  RADII,
  SEMANTIC_TOKENS,
  SPACING,
  THEMES,
  TYPE_SCALE,
  type ThemeName,
} from "@/lib/design-system/tokens";
import type { ThemePreference } from "@/lib/design-system/theme";
import { ExemploContatos } from "./exemplo-contatos";
import { ExemploNegocios } from "./exemplo-negocios";

/* Página viva do design system. Só leitura, dados fictícios. */

const SECOES = [
  ["cores", "Cores"],
  ["contraste", "Contraste"],
  ["tipografia", "Tipografia"],
  ["espacamento", "Espaçamento, raios e movimento"],
  ["componentes", "Componentes"],
  ["lista", "Componentes de lista"],
  ["exemplo-contatos", "Exemplo: contatos"],
  ["exemplo-negocios", "Exemplo: negócios"],
] as const;

export function Vitrine() {
  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-12 px-6 py-6">
      <PageHeader
        meta="Eva Studio"
        title="Design system"
        description="Tokens, componentes e exemplos de tela. Dados fictícios."
        actions={<SeletorDeTema />}
      />
      <nav aria-label="Seções" className="-mt-8 flex flex-wrap gap-x-4 gap-y-1 border-b border-border-subtle pb-3 text-small">
        {SECOES.map(([id, nome]) => (
          <a key={id} href={`#${id}`} className="text-text-secondary hover:text-text-primary hover:underline">
            {nome}
          </a>
        ))}
      </nav>

      <Secao id="cores" titulo="Cores" descricao="Tokens semânticos nos dois temas. Componente usa o nome, nunca o hex.">
        <div className="grid gap-4 lg:grid-cols-2">
          <PaletaDoTema tema="light" />
          <PaletaDoTema tema="dark" />
        </div>
      </Secao>

      <Secao id="contraste" titulo="Contraste" descricao="Pares obrigatórios, calculados pela fórmula WCAG 2.x. Mínimo 4,5 para texto e 3 para foco.">
        <TabelaDeContraste />
      </Secao>

      <Secao id="tipografia" titulo="Tipografia" descricao="Inter em toda a interface. Hierarquia por tamanho e peso, não por cor.">
        <Panel flush>
          <ul className="divide-y divide-border-subtle">
            {TYPE_SCALE.map((t) => (
              <li key={t.nome} className="grid grid-cols-[140px_1fr] items-baseline gap-4 px-4 py-3 md:grid-cols-[140px_1fr_260px]">
                <code className="font-mono text-caption text-text-secondary">text-{t.nome}</code>
                <span className="truncate text-text-primary" style={{ fontSize: t.px, lineHeight: `${t.lineHeight}px`, fontWeight: t.peso }}>
                  Proposta enviada para Acme · R$ 12.400
                </span>
                <span className="hidden text-caption text-text-tertiary md:block">
                  {t.px}/{t.lineHeight} · {t.peso} — {t.uso}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
        <p className="mt-2 text-small text-text-secondary">
          Números em tabela, Stat e totais usam <code className="font-mono text-caption">tabular-nums</code>: 1.111 e 8.888 ocupam a mesma largura.
        </p>
      </Secao>

      <Secao id="espacamento" titulo="Espaçamento, raios e movimento">
        <div className="grid gap-4 lg:grid-cols-3">
          <Panel title="Espaçamento (base 4)">
            <ul className="flex flex-col gap-1.5">
              {SPACING.map((s) => (
                <li key={s} className="flex items-center gap-3 text-small">
                  <code className="w-10 font-mono text-caption text-text-secondary">{s}</code>
                  <span className="h-3 rounded-sm bg-accent-solid" style={{ width: s * 4 }} />
                  <span className="text-text-tertiary tabular-nums">{s * 4}px</span>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Raios">
            <ul className="flex flex-col gap-3">
              {RADII.map((r) => (
                <li key={r.classe} className="flex items-center gap-3 text-small">
                  <span className="h-10 w-10 shrink-0 border border-border-strong bg-raised" style={{ borderRadius: r.px }} />
                  <span>
                    <code className="font-mono text-caption text-text-primary">{r.classe}</code>{" "}
                    <span className="text-text-tertiary">{r.px}px</span>
                    <span className="block text-caption text-text-secondary">{r.uso}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Sombra e movimento">
            <div className="mb-4 rounded-lg border border-border-default bg-overlay p-3 text-small shadow-overlay">
              <code className="font-mono text-caption">shadow-overlay</code> — só em menu, modal, gaveta e toast.
            </div>
            <ul className="flex flex-col gap-1 text-small">
              {MOTION.map((m) => (
                <li key={m.nome} className="flex justify-between gap-2">
                  <span>
                    {m.nome} <span className="tabular-nums text-text-tertiary">{m.ms}ms</span>
                  </span>
                  <span className="text-right text-caption text-text-secondary">{m.uso}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-caption text-text-tertiary">Com “reduzir movimento” ligado no sistema, toda animação é desligada.</p>
          </Panel>
        </div>
      </Secao>

      <Secao id="componentes" titulo="Componentes">
        <div className="grid gap-4 lg:grid-cols-2">
          <DemoBotoes />
          <DemoCampos />
          <DemoSelecao />
          <DemoBadges />
          <DemoOverlays />
          <DemoAbas />
          <DemoCards />
          <DemoVazioEsqueleto />
        </div>
      </Secao>

      <Secao id="lista" titulo="Componentes de lista" descricao="PageHeader, ViewTabs, Toolbar + FilterButton, DataTable, Pagination, Stat e KanbanColumn.">
        <DemoLista />
      </Secao>

      <Secao id="exemplo-contatos" titulo="Exemplo: lista de contatos">
        <Moldura>
          <ExemploContatos />
        </Moldura>
      </Secao>

      <Secao id="exemplo-negocios" titulo="Exemplo: quadro de negócios">
        <Moldura>
          <ExemploNegocios />
        </Moldura>
      </Secao>
    </div>
  );
}

function Secao({ id, titulo, descricao, children }: { id: string; titulo: string; descricao?: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className="scroll-mt-6">
      <h2 id={`${id}-titulo`} className="text-title text-text-primary">
        {titulo}
      </h2>
      {descricao && <p className="mt-0.5 text-body text-text-secondary">{descricao}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Área de "tela" dentro da página, para os exemplos parecerem a tela real. */
function Moldura({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-border-default bg-page p-5">{children}</div>;
}

function SeletorDeTema() {
  const { preference, setPreference } = useTheme();
  const opcoes: [ThemePreference, string][] = [
    ["system", "Sistema"],
    ["light", "Claro"],
    ["dark", "Escuro"],
  ];
  return (
    <div className="flex items-center gap-2">
      <div role="radiogroup" aria-label="Tema" className="inline-flex h-8 items-center rounded-md border border-border-default bg-panel p-0.5">
        {opcoes.map(([v, nome]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={preference === v}
            onClick={() => setPreference(v)}
            className={cn(
              "h-full rounded-sm px-2.5 text-small transition-colors duration-120",
              preference === v ? "bg-hover font-medium text-text-primary" : "text-text-secondary hover:text-text-primary"
            )}
          >
            {nome}
          </button>
        ))}
      </div>
      <ThemeToggle />
    </div>
  );
}

const GRUPOS: [string, string[]][] = [
  ["Superfícies", SEMANTIC_TOKENS.filter((t) => t.startsWith("surface-"))],
  ["Bordas", SEMANTIC_TOKENS.filter((t) => t.startsWith("border-"))],
  ["Texto", SEMANTIC_TOKENS.filter((t) => t.startsWith("text-"))],
  ["Acento", SEMANTIC_TOKENS.filter((t) => t.startsWith("accent-"))],
  ["Status", SEMANTIC_TOKENS.filter((t) => /^(success|warning|danger|info)-/.test(t))],
  ["Foco e inverso", ["focus-ring", "inverse-bg", "inverse-fg"]],
];

function PaletaDoTema({ tema }: { tema: ThemeName }) {
  const valores = THEMES[tema];
  return (
    // data-theme no contêiner: as amostras usam as variáveis daquele tema,
    // independente do tema da página.
    <div data-theme={tema} className="rounded-lg border border-border-default bg-page p-4">
      <h3 className="mb-3 text-body font-semibold">{tema === "light" ? "Tema claro" : "Tema escuro"}</h3>
      <div className="flex flex-col gap-4">
        {GRUPOS.map(([grupo, tokens]) => (
          <div key={grupo}>
            <p className="mb-1.5 text-caption font-medium text-text-tertiary">{grupo}</p>
            <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {tokens.map((t) => {
                const hex = valores[t as keyof typeof valores];
                const ehTexto = t.startsWith("text-") || t.endsWith("-fg");
                const ratio = ehTexto ? contrastRatio(hex, valores["surface-panel"]) : null;
                return (
                  <li key={t} className="flex items-center gap-2 rounded-md border border-border-subtle bg-panel p-1.5">
                    <span className="h-7 w-7 shrink-0 rounded-sm border border-border-subtle" style={{ background: `var(--${t})` }} />
                    <span className="min-w-0">
                      <code className="block truncate font-mono text-caption text-text-primary">{t}</code>
                      <span className="text-caption tabular-nums text-text-tertiary">
                        {hex}
                        {ratio !== null && ` · ${formatRatio(ratio)}`}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function TabelaDeContraste() {
  const linhas = CONTRAST_PAIRS.map((p, i) => {
    const claro = contrastRatio(THEMES.light[p.fg], THEMES.light[p.bg]);
    const escuro = contrastRatio(THEMES.dark[p.fg], THEMES.dark[p.bg]);
    return { id: String(i), ...p, claro, escuro };
  });
  const celula = (ratio: number, min: number) => (
    <span className={cn("tabular-nums", ratio < min && "font-medium text-danger")}>
      {formatRatio(ratio)} <span className="text-text-tertiary">{contrastLevel(ratio)}</span>
    </span>
  );
  return (
    <div className="overflow-hidden rounded-lg border border-border-subtle bg-panel">
      <DataTable
        caption="Contraste dos pares de tokens"
        className="max-h-[420px]"
        rows={linhas}
        getRowKey={(l) => l.id}
        columns={[
          { key: "fg", header: "Texto / frente", cell: (l) => <code className="font-mono text-caption">{l.fg}</code> },
          { key: "bg", header: "Fundo", cell: (l) => <code className="font-mono text-caption">{l.bg}</code> },
          { key: "uso", header: "Uso", cell: (l) => <span className="text-text-secondary">{l.uso}</span> },
          { key: "min", header: "Mínimo", numeric: true, cell: (l) => formatRatio(l.min) },
          { key: "claro", header: "Claro", numeric: true, cell: (l) => celula(l.claro, l.min) },
          { key: "escuro", header: "Escuro", numeric: true, cell: (l) => celula(l.escuro, l.min) },
        ]}
      />
    </div>
  );
}

function Demo({ titulo, children, className }: { titulo: string; children: React.ReactNode; className?: string }) {
  return (
    <Panel title={titulo} className={className}>
      <div className="flex flex-col gap-4">{children}</div>
    </Panel>
  );
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-caption text-text-tertiary">{rotulo}</span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function DemoBotoes() {
  return (
    <Demo titulo="Button e IconButton">
      <Linha rotulo="Variantes (md)">
        <Button variant="primary">Salvar</Button>
        <Button variant="secondary">Cancelar</Button>
        <Button variant="ghost">Ver mais</Button>
        <Button variant="danger">Excluir</Button>
      </Linha>
      <Linha rotulo="Tamanho sm, com ícone, carregando, desabilitado">
        <Button size="sm" variant="secondary">
          <Plus size={14} aria-hidden="true" /> Adicionar
        </Button>
        <Button size="sm" loading>
          Salvando
        </Button>
        <Button size="sm" variant="secondary" disabled>
          Desabilitado
        </Button>
      </Linha>
      <Linha rotulo="IconButton (aria-label obrigatório)">
        <IconButton aria-label="Editar" tooltip>
          <Pencil />
        </IconButton>
        <IconButton aria-label="Copiar" tooltip variant="secondary">
          <Copy />
        </IconButton>
        <IconButton aria-label="Excluir" tooltip size="sm">
          <Trash2 />
        </IconButton>
      </Linha>
    </Demo>
  );
}

function DemoCampos() {
  return (
    <Demo titulo="Input, Textarea, Select, Field">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nome" hint="Como aparece nas mensagens.">
          <Input placeholder="Ana Souza" />
        </Field>
        <Field label="E-mail" error="Informe um e-mail válido." required>
          <Input defaultValue="ana@" />
        </Field>
        <div>
          <Label htmlFor="ds-etapa">Etapa</Label>
          <Select id="ds-etapa" defaultValue="qualificado">
            <option value="lead">Lead</option>
            <option value="qualificado">Qualificado</option>
            <option value="cliente">Cliente</option>
          </Select>
        </div>
        <Field label="Desabilitado">
          <Input disabled defaultValue="Somente leitura" />
        </Field>
        <Field label="Observação" className="sm:col-span-2">
          <Textarea placeholder="Contexto para a equipe" />
        </Field>
      </div>
    </Demo>
  );
}

function DemoSelecao() {
  const [ligado, setLigado] = React.useState(true);
  return (
    <Demo titulo="Checkbox e Switch">
      <Linha rotulo="Checkbox: vazio, marcado, parcial, desabilitado">
        <Checkbox aria-label="Exemplo vazio" />
        <Checkbox aria-label="Exemplo marcado" defaultChecked />
        <Checkbox aria-label="Exemplo parcial" checked="indeterminate" />
        <Checkbox aria-label="Exemplo desabilitado" disabled />
      </Linha>
      <label className="flex items-center gap-2 text-body">
        <Checkbox defaultChecked /> Receber resumo diário por e-mail
      </label>
      <label className="flex items-center justify-between gap-4 text-body">
        <span>
          Distribuição automática de leads
          <span className="block text-small text-text-secondary">Efeito imediato, sem botão Salvar.</span>
        </span>
        <Switch checked={ligado} onCheckedChange={setLigado} />
      </label>
    </Demo>
  );
}

function DemoBadges() {
  return (
    <Demo titulo="Badge e Avatar">
      <Linha rotulo="Badge: neutral, info, success, warning, danger">
        <Badge>Lead</Badge>
        <Badge variant="info">Qualificado</Badge>
        <Badge variant="success">Ganho</Badge>
        <Badge variant="warning">Vence hoje</Badge>
        <Badge variant="danger">Atrasado</Badge>
        <Badge variant="success" dot>
          Ativo
        </Badge>
      </Linha>
      <Linha rotulo="Avatar: iniciais em cinza, sm/md/lg">
        <Avatar name="Ana Souza" size="sm" />
        <Avatar name="Bruno Lima" size="md" />
        <Avatar name="Carla Dias" size="lg" />
      </Linha>
    </Demo>
  );
}

function DemoOverlays() {
  const toast = useToast();
  return (
    <Demo titulo="Modal, Drawer, DropdownMenu, Tooltip, Toast">
      <div className="flex flex-wrap items-center gap-2">
        <Modal>
          <ModalTrigger asChild>
            <Button variant="secondary">Abrir modal</Button>
          </ModalTrigger>
          <ModalContent
            title="Excluir 3 contatos?"
            description="Os negócios ligados a eles continuam existindo."
            size="sm"
            footer={
              <>
                <ModalClose asChild>
                  <Button variant="secondary">Cancelar</Button>
                </ModalClose>
                <ModalClose asChild>
                  <Button variant="danger">Excluir</Button>
                </ModalClose>
              </>
            }
          >
            <p className="text-body text-text-secondary">Esta ação não pode ser desfeita.</p>
          </ModalContent>
        </Modal>

        <Drawer>
          <DrawerTrigger asChild>
            <Button variant="secondary">Abrir gaveta</Button>
          </DrawerTrigger>
          <DrawerContent
            title="Ana Souza"
            description="Contato · Acme Logística"
            footer={
              <>
                <DrawerClose asChild>
                  <Button variant="secondary">Fechar</Button>
                </DrawerClose>
                <Button variant="primary">Salvar</Button>
              </>
            }
          >
            <div className="flex flex-col gap-3">
              <Field label="E-mail">
                <Input defaultValue="ana.souza@exemplo.com.br" />
              </Field>
              <Field label="Telefone">
                <Input defaultValue="(11) 91234-5678" />
              </Field>
            </div>
          </DrawerContent>
        </Drawer>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary">
              Mais <MoreHorizontal size={14} aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Contato</DropdownMenuLabel>
            <DropdownMenuItem>
              <Mail /> Enviar e-mail
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Users /> Atribuir proprietário
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem tone="danger">
              <Trash2 /> Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost">Passe o mouse</Button>
          </TooltipTrigger>
          <TooltipContent>Texto curto de apoio</TooltipContent>
        </Tooltip>

        <Button
          variant="secondary"
          onClick={() => toast({ title: "Contato salvo", tone: "success", action: { label: "Desfazer", onClick: () => undefined } })}
        >
          <Bell size={14} aria-hidden="true" /> Mostrar toast
        </Button>
        <Button variant="ghost" onClick={() => toast({ title: "Não foi possível salvar", description: "Verifique a conexão e tente de novo.", tone: "danger" })}>
          Toast de erro
        </Button>
      </div>
    </Demo>
  );
}

function DemoAbas() {
  return (
    <Demo titulo="Tabs">
      <Tabs defaultValue="atividades">
        <TabsList>
          <TabsTrigger value="atividades">Atividades</TabsTrigger>
          <TabsTrigger value="negocios">Negócios</TabsTrigger>
          <TabsTrigger value="arquivos">Arquivos</TabsTrigger>
          <TabsTrigger value="off" disabled>
            Desabilitada
          </TabsTrigger>
        </TabsList>
        <TabsContent value="atividades" className="pt-3 text-body text-text-secondary">
          Linha do tempo de atividades.
        </TabsContent>
        <TabsContent value="negocios" className="pt-3 text-body text-text-secondary">
          Negócios do contato.
        </TabsContent>
        <TabsContent value="arquivos" className="pt-3 text-body text-text-secondary">
          Arquivos anexados.
        </TabsContent>
      </Tabs>
    </Demo>
  );
}

function DemoCards() {
  return (
    <Demo titulo="Card, Panel e Stat">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Negócios abertos" value="184" delta={12.4} />
        <Stat label="Receita prevista" value="R$ 482 mil" delta={-3.1} />
        <Stat label="Churn do mês" value="2,1%" delta={0.4} inverse />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Card</CardTitle>
          <CardDescription>API antiga, agora painel com borda fina.</CardDescription>
        </CardHeader>
        <p className="text-body text-text-secondary">Sem blur, sem sombra, sem borda colorida.</p>
      </Card>
      <Panel title="Panel com ações" actions={<Button size="sm" variant="ghost">Editar</Button>}>
        <p className="text-body text-text-secondary">Cabeçalho com linha divisória; corpo com 16px de respiro.</p>
      </Panel>
    </Demo>
  );
}

function DemoVazioEsqueleto() {
  return (
    <Demo titulo="EmptyState e Skeleton">
      <EmptyState
        compact
        icon={<Inbox />}
        title="Nenhum contato nesta visão"
        description="Mude os filtros ou crie o primeiro contato."
        action={<Button size="sm">Criar contato</Button>}
      />
      <div className="flex flex-col gap-2" aria-label="Carregando" role="status">
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </Demo>
  );
}

function DemoLista() {
  const [estado, setEstado] = React.useState<"dados" | "carregando" | "vazio">("dados");
  const [pagina, setPagina] = React.useState(3);
  const [tamanho, setTamanho] = React.useState(25);
  const [visao, setVisao] = React.useState("a");
  const [sel, setSel] = React.useState<string[]>(["Ana Souza", "Bruno Lima"]);
  const [colapsada, setColapsada] = React.useState(false);
  const linhas = [
    { id: "1", nome: "Plano Pro anual", etapa: "Proposta", valor: 12400 },
    { id: "2", nome: "Implantação", etapa: "Negociação", valor: 8900 },
    { id: "3", nome: "Consultoria", etapa: "Novo", valor: 3200 },
  ];
  return (
    <div className="flex flex-col gap-4">
      <Panel title="ViewTabs, Toolbar e FilterButton">
        <div className="flex flex-col gap-3">
          <ViewTabs
            value={visao}
            onChange={setVisao}
            onAdd={() => undefined}
            views={[
              { id: "a", label: "Todos", count: 24752 },
              { id: "b", label: "Meus", count: 312 },
            ]}
          />
          <Toolbar label="Filtros de exemplo" end={<Button size="sm" variant="ghost">Salvar visão</Button>}>
            <FilterButton
              label="Proprietário"
              searchable
              options={["Ana Souza", "Bruno Lima", "Carla Dias", "Diego Nunes", "Elisa Gomes"].map((n) => ({ value: n, label: n, hint: String(n.length * 13) }))}
              selected={sel}
              onChange={setSel}
            />
            <FilterButton label="Etapa" options={[{ value: "a", label: "Lead" }, { value: "b", label: "Cliente" }]} selected={[]} onChange={() => undefined} />
          </Toolbar>
        </div>
      </Panel>

      <Panel
        title="DataTable e Pagination"
        flush
        actions={
          <div role="radiogroup" aria-label="Estado da tabela" className="flex gap-1">
            {(["dados", "carregando", "vazio"] as const).map((e) => (
              <Button key={e} size="sm" variant={estado === e ? "secondary" : "ghost"} role="radio" aria-checked={estado === e} onClick={() => setEstado(e)}>
                {e[0].toUpperCase() + e.slice(1)}
              </Button>
            ))}
          </div>
        }
      >
        <DataTable
          caption="Exemplo de tabela"
          rows={estado === "vazio" ? [] : linhas}
          loading={estado === "carregando"}
          loadingRows={3}
          getRowKey={(l) => l.id}
          columns={[
            { key: "nome", header: "Negócio", cell: (l) => l.nome },
            { key: "etapa", header: "Etapa", cell: (l) => l.etapa },
            { key: "valor", header: "Valor", numeric: true, cell: (l) => l.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) },
          ]}
          empty={<EmptyState compact icon={<Inbox />} title="Nenhum negócio" description="Nada corresponde aos filtros." />}
        />
        <Pagination className="border-t border-border-subtle px-3 py-2" page={pagina} pageSize={tamanho} total={24752} onPageChange={setPagina} onPageSizeChange={setTamanho} />
      </Panel>

      <Panel title="KanbanColumn">
        <div className="flex gap-2 overflow-x-auto">
          <KanbanColumn title="Proposta enviada" count={2} total={21300} weighted={10650} collapsed={colapsada} onCollapsedChange={setColapsada}>
            <KanbanCard title="Plano Pro anual — Acme" subtitle="Acme Logística" value={12400} meta={<Avatar name="Ana Souza" />} />
            <KanbanCard title="Implantação — Delta" subtitle="Delta Engenharia" value={8900} meta={<Avatar name="Bruno Lima" />} />
          </KanbanColumn>
          <KanbanColumn title="Vazia" count={0} total={0} weighted={0}>
            <p className="px-2 py-6 text-center text-caption text-text-tertiary">Arraste um negócio para cá</p>
          </KanbanColumn>
        </div>
      </Panel>
    </div>
  );
}
