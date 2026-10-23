"use client";

import { useTelaLarga } from "@/lib/use-tela-larga";
import * as React from "react";
import Link from "@/components/contrato/link";
import { ArrowLeft, Building2, ChevronRight, Clock, Globe, Link2, Loader2, MoreHorizontal, Phone, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input, Textarea, Field } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Notice } from "@/components/ui/notice";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { focusRing } from "@/components/ui/styles";
import { useToast } from "@/components/ui/toast";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DealDrawer } from "@/components/crm/deal-drawer";
import { useConcluirTarefa } from "@/components/tarefas/concluir";
import { useApagarComDesfazer } from "@/components/crm/lixeira/use-apagar-com-desfazer";
import { useRegistroEmFoco, type RegistroEmFoco } from "@/components/busca/registro-em-foco";
import { subtituloDaEmpresa } from "@/lib/busca/resultado";
import { useRouter } from "@/lib/contrato/navegacao";
import { pulsar, avisarNaIlha } from "@/lib/fundo/eventos";
import { initials } from "@/lib/design-system/format";
import { cn, formatRelativeDate } from "@/lib/utils";
import { HistoricoDoRegistro } from "@/components/historico/historico-do-registro";
import { FotoDaPessoa, LogoDaEmpresa, cidadeUf, formatCnpj, money, normalizeUrl, siglaDe } from "./pecas";

interface Company {
  id: string; name: string; cnpj: string; sector: string; size: number | null;
  website: string; phone: string; linkedinUrl: string; address: string;
  city: string; uf: string; zipcode: string; description: string; revenue: string;
  owner: { id: string; name: string } | null;
  createdAt: string;
}
interface Totals { openCount: number; openCents: number; wonCents: number }
interface ContactRow { id: string; name: string; jobTitle: string; email: string; phone: string }
interface DealRow {
  id: string; name: string; amountCents: number; probability: number;
  stage: string; stageType: string; pipeline: string; closedAt: string | null; updatedAt: string;
}
interface TaskRow {
  type: string;
  id: string; text: string; dueAt: string | null; doneAt: string | null;
  contact: { id: string; name: string } | null; deal: { id: string; name: string } | null;
}
interface NoteRow {
  id: string; text: string; createdAt: string;
  contact: { id: string; name: string } | null; deal: { id: string; name: string } | null;
}

interface Payload {
  company: Company; totals: Totals;
  contacts: ContactRow[]; deals: DealRow[]; tasks: TaskRow[]; notes: NoteRow[];
}

type AbaDaPagina = "resumo" | "pessoas" | "negocios" | "dados";

// ---------------------------------------------------------------------------
// Página da empresa (/empresas/<id>), irmã da página do contato: caminho
// "Empresas › Nome" com o "…" (copiar link, apagar), logo grande, nome que se
// edita no lugar, setor · cidade, botões redondos (site, ligar, LinkedIn).
// Embaixo, três números da conta (em conta B2B se pergunta quanto está
// aberto, quanto já fechou e quantas pessoas conheço lá dentro) e as abas
// Resumo (tarefas e notas), Pessoas, Negócios e Dados.
// ---------------------------------------------------------------------------
export function PaginaDaEmpresa({ companyId }: { companyId: string }) {
  const router = useRouter();
  const toast = useToast();

  const [data, setData] = React.useState<Payload | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const [naoEncontrada, setNaoEncontrada] = React.useState(false);
  const [salvando, setSalvando] = React.useState(false);
  const [dealAberto, setDealAberto] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<Partial<Company>>({});
  const [aba, setAba] = React.useState<AbaDaPagina>("resumo");
  const largo = useTelaLarga();

  const carregar = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/companies/${companyId}`);
      if (!res.ok) {
        setNaoEncontrada(res.status === 404);
        setErro(res.status === 404 ? "Empresa não encontrada." : "Não foi possível carregar.");
        return;
      }
      const d: Payload = await res.json();
      setData(d);
      setForm(d.company);
    } catch {
      setErro("Não foi possível carregar.");
    }
  }, [companyId]);

  React.useEffect(() => { carregar(); }, [carregar]);

  async function patch(body: Record<string, unknown>): Promise<boolean> {
    setSalvando(true);
    const res = await fetch(`/api/companies/${companyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSalvando(false);
    if (!res.ok) {
      setErro((await res.json()).error ?? "Não foi possível salvar.");
      return false;
    }
    setErro(null);
    carregar();
    return true;
  }

  // Concluir abre o diálogo (resultado + próximo passo obrigatório);
  // desmarcar reabre direto.
  const { abrir: abrirConclusao, dialogo: dialogoDeConclusao } = useConcluirTarefa(() => carregar());

  async function alternarTarefa(t: TaskRow, feita: boolean) {
    if (!feita) {
      abrirConclusao(t);
      return;
    }
    await fetch(`/api/tasks/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: false }),
    });
    carregar();
  }

  // Desvincular solta uma onda a partir da linha e, na ilha, o Desfazer
  // religa a pessoa (a mesma rota, com addContactId).
  async function desvincular(c: ContactRow, origem: HTMLElement | null) {
    const nomeDaPessoa = c.name || "Contato sem nome";
    // A onda sai antes do PATCH: depois dele a lista recarrega e a linha some.
    pulsar(origem, 1.2);
    const ok = await patch({ removeContactId: c.id });
    if (!ok) return;
    avisarNaIlha({
      titulo: "Contato desvinculado",
      detalhe: `${nomeDaPessoa} saiu de ${data?.company.name || "a empresa"}`,
      avatar: siglaDe(nomeDaPessoa),
      acao: { rotulo: "Desfazer", aoClicar: () => void patch({ addContactId: c.id }) },
    });
  }

  // Busca global (⌘K): a empresa aberta entra nos Recentes.
  const empresa = data?.company;
  const registro = React.useMemo<RegistroEmFoco | null>(
    () =>
      empresa
        ? {
            tipo: "empresa",
            id: empresa.id,
            titulo: empresa.name || "Empresa sem nome",
            caminho: `/empresas/${empresa.id}`,
            subtitulo: subtituloDaEmpresa(empresa),
          }
        : null,
    [empresa]
  );
  useRegistroEmFoco(registro);

  const apagarComDesfazer = useApagarComDesfazer();
  // Sem confirmação: vai para a lixeira (contatos e negócios ficam, sem
  // empresa) e o toast desfaz, religando quem estava ligado.
  async function apagar() {
    const r = await apagarComDesfazer({
      url: `/api/companies/${companyId}`,
      titulo: "Empresa apagada",
      perguntaSemLixeira: "A lixeira ainda não está ativada: apagar esta empresa não tem volta (contatos e negócios continuam, sem empresa). Apagar mesmo assim?",
      aoRestaurar: () => router.push(`/empresas/${companyId}`),
    });
    if (r.ok) router.push("/empresas");
    else if (r.erro) setErro(r.erro);
  }

  async function copiarLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast({ title: "Link copiado", tone: "success" });
    } catch {
      toast({ title: "Não foi possível copiar o link.", tone: "danger" });
    }
  }

  if (erro && !data) {
    return (
      <div className="flex flex-col gap-5 px-4 pb-8 pt-1 lg:px-6">
        <EmptyState
          icon={naoEncontrada ? <Building2 aria-hidden /> : <TriangleAlert aria-hidden className="text-danger" />}
          title={naoEncontrada ? "Empresa não encontrada" : "Não foi possível abrir a empresa"}
          description={naoEncontrada ? "Ela pode ter sido apagada, ou o link é de outro contrato." : "Verifique a conexão e tente de novo."}
          action={
            <div className="flex gap-2">
              <VoltarParaEmpresas />
              {!naoEncontrada && (
                <Button
                  variant="primary"
                  onClick={() => {
                    setErro(null);
                    void carregar();
                  }}
                >
                  <RefreshCw size={14} aria-hidden /> Tentar de novo
                </Button>
              )}
            </div>
          }
        />
      </div>
    );
  }

  if (!data) return <Esqueleto />;

  const { company, totals, contacts, deals, tasks, notes } = data;
  const nome = company.name || "Empresa sem nome";
  const tarefasAbertas = tasks.filter((t) => !t.doneAt).length;
  const linhaDeApoio = [company.sector, cidadeUf(company.city, company.uf)].filter(Boolean).join(" · ");
  const abas: { value: AbaDaPagina; label: string }[] = [
    { value: "resumo", label: "Resumo" },
    { value: "pessoas", label: contacts.length > 0 ? `Pessoas ${contacts.length}` : "Pessoas" },
    { value: "negocios", label: deals.length > 0 ? `Negócios ${deals.length}` : "Negócios" },
    ...(largo ? [] : [{ value: "dados" as const, label: "Dados" }]),
  ];
  // No desktop largo os dados ficam na coluna da direita, sempre à vista.
  const abaVisivel: AbaDaPagina = largo && aba === "dados" ? "resumo" : aba;
  const dadosDaEmpresa = (
          <section aria-label="Dados da empresa" className="grid gap-4 sm:grid-cols-2">
            <Campo label="CNPJ" value={form.cnpj ?? ""} onChange={(v) => setForm({ ...form, cnpj: v })} onSave={(v) => patch({ cnpj: v })} />
            <Campo label="Setor" value={form.sector ?? ""} onChange={(v) => setForm({ ...form, sector: v })} onSave={(v) => patch({ sector: v })} />
            <Campo label="Site" value={form.website ?? ""} onChange={(v) => setForm({ ...form, website: v })} onSave={(v) => patch({ website: v })} />
            <Campo label="Telefone" value={form.phone ?? ""} onChange={(v) => setForm({ ...form, phone: v })} onSave={(v) => patch({ phone: v })} />
            <Campo label="LinkedIn" value={form.linkedinUrl ?? ""} onChange={(v) => setForm({ ...form, linkedinUrl: v })} onSave={(v) => patch({ linkedinUrl: v })} />
            <Campo label="Faturamento" value={form.revenue ?? ""} onChange={(v) => setForm({ ...form, revenue: v })} onSave={(v) => patch({ revenue: v })} />
            <Campo label="Endereço" value={form.address ?? ""} onChange={(v) => setForm({ ...form, address: v })} onSave={(v) => patch({ address: v })} />
            <div className="grid grid-cols-[1fr_88px] gap-3">
              <Campo label="Cidade" value={form.city ?? ""} onChange={(v) => setForm({ ...form, city: v })} onSave={(v) => patch({ city: v })} />
              <Campo label="UF" value={form.uf ?? ""} onChange={(v) => setForm({ ...form, uf: v })} onSave={(v) => patch({ uf: v })} />
            </div>
            <Field label="Descrição" className="sm:col-span-2">
              <Textarea
                rows={4}
                value={form.description ?? ""}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                onBlur={() => form.description !== company.description && patch({ description: form.description })}
              />
            </Field>
            <p className="font-mono text-caption text-text-tertiary sm:col-span-2">
              Cadastrada {formatRelativeDate(company.createdAt)}
              {company.owner ? ` · responsável ${company.owner.name}` : ""}
            </p>
          </section>
  );

  return (
    <div className="flex flex-col gap-5 px-4 pb-8 pt-1 lg:px-6">
      <div className="flex items-center gap-2">
        <nav aria-label="Caminho" className="flex min-w-0 items-center gap-1 text-small">
          <Link href="/empresas" className={cn("rounded-full px-1 text-text-secondary hover:text-text-primary", focusRing)}>
            Empresas
          </Link>
          <ChevronRight size={14} aria-hidden className="shrink-0 text-text-tertiary" />
          <span className="truncate font-semibold text-text-primary" aria-current="page">
            {nome}
          </span>
        </nav>
        {salvando && <Loader2 size={14} aria-label="Salvando" className="ml-auto animate-spin text-text-tertiary" />}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton aria-label="Mais ações da empresa" variant="secondary" className={cn(!salvando && "ml-auto")}>
              <MoreHorizontal aria-hidden />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => void copiarLink()}>
              <Link2 aria-hidden /> Copiar link
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem tone="danger" onSelect={() => void apagar()}>
              <Trash2 aria-hidden /> Apagar empresa
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="grid w-full gap-8 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-5">
        <header className="flex flex-wrap items-center gap-5">
          <LogoDaEmpresa nome={nome} semente={company.id} tamanho="xl" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            {/* O nome se edita no lugar e salva ao sair, como o resto do CRM. */}
            <input
              aria-label="Nome da empresa"
              value={form.name ?? ""}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              onBlur={() => form.name !== company.name && patch({ name: form.name })}
              className={cn(
                "-mx-1.5 w-full min-w-0 truncate rounded-xl bg-transparent px-1.5 text-heading font-semibold tracking-tight text-text-primary outline-none transition-colors hover:bg-hover focus:bg-raised",
                focusRing
              )}
            />
            <p className="truncate text-small text-text-tertiary">{linhaDeApoio || "Sem setor nem cidade"}</p>
            {company.cnpj && <p className="font-mono text-caption tabular-nums text-text-tertiary">{formatCnpj(company.cnpj)}</p>}
          </div>
          <div className="flex shrink-0 gap-3.5">
            <AcaoRedonda rotulo="Site" href={company.website ? normalizeUrl(company.website) : null} externo>
              <Globe aria-hidden />
            </AcaoRedonda>
            <AcaoRedonda rotulo="Ligar" href={company.phone ? `tel:${company.phone.replace(/[^\d+]/g, "")}` : null}>
              <Phone aria-hidden />
            </AcaoRedonda>
            <AcaoRedonda rotulo="LinkedIn" href={company.linkedinUrl ? normalizeUrl(company.linkedinUrl) : null} externo>
              <Link2 aria-hidden />
            </AcaoRedonda>
          </div>
        </header>

        {erro && (
          <Notice tone="danger" onDismiss={() => setErro(null)}>
            {erro}
          </Notice>
        )}

        {/* Três números, não um painel de gráficos. */}
        <dl className="grid grid-cols-1 divide-y divide-border-subtle rounded-[18px] border border-border-subtle bg-panel sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <Numero rotulo="Em aberto" valor={money(totals.openCents)} apoio={`${totals.openCount} ${totals.openCount === 1 ? "negócio" : "negócios"}`} />
          <Numero rotulo="Já ganho" valor={money(totals.wonCents)} apoio="histórico da conta" tom="success" />
          <Numero
            rotulo="Pessoas"
            valor={String(contacts.length)}
            apoio={tarefasAbertas > 0 ? `${tarefasAbertas} ${tarefasAbertas === 1 ? "tarefa aberta" : "tarefas abertas"}` : "nenhuma tarefa aberta"}
          />
        </dl>

        <SegmentedControl label="Seções da empresa" options={abas} value={abaVisivel} onChange={setAba} className="self-start tabular-nums" />

        {abaVisivel === "resumo" && (
          <div className="grid gap-6 md:grid-cols-2">
            <section aria-labelledby="tarefas-da-conta" className="flex min-w-0 flex-col gap-2">
              <h2 id="tarefas-da-conta" className="font-mono text-caption uppercase tracking-wider text-text-tertiary">
                Tarefas da conta
              </h2>
              {tasks.length === 0 ? (
                <p className="text-small text-text-tertiary">Nenhuma tarefa ligada a esta empresa.</p>
              ) : (
                <ul className="flex flex-col">
                  {tasks.map((t) => {
                    const atrasada = !t.doneAt && !!t.dueAt && new Date(t.dueAt).getTime() < Date.now();
                    const apoio = [t.deal?.name, t.contact?.name].filter(Boolean).join(" · ");
                    return (
                      <li key={t.id} className="border-b border-border-subtle last:border-b-0">
                        <label className="flex cursor-pointer items-start gap-2.5 rounded-xl px-2 py-2.5 transition-colors hover:bg-raised">
                          <Checkbox checked={!!t.doneAt} onCheckedChange={() => alternarTarefa(t, !!t.doneAt)} className="mt-0.5" />
                          <span className="min-w-0 flex-1">
                            <span className={cn("block text-small", t.doneAt ? "text-text-tertiary line-through" : "text-text-primary")}>{t.text}</span>
                            {(t.dueAt && !t.doneAt) || apoio ? (
                              <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-caption text-text-tertiary">
                                {t.dueAt && !t.doneAt && (
                                  <span className={cn("inline-flex items-center gap-1", atrasada && "text-danger")}>
                                    <Clock size={11} aria-hidden /> {formatRelativeDate(t.dueAt)}
                                  </span>
                                )}
                                {apoio && <span className="truncate">{apoio}</span>}
                              </span>
                            ) : null}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section aria-labelledby="notas-da-conta" className="flex min-w-0 flex-col gap-2">
              <h2 id="notas-da-conta" className="font-mono text-caption uppercase tracking-wider text-text-tertiary">
                Últimas notas
              </h2>
              {notes.length === 0 ? (
                <p className="text-small text-text-tertiary">Nada registrado nas pessoas e negócios desta conta.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {notes.map((n) => (
                    <li key={n.id} className="rounded-[14px] bg-raised px-3.5 py-2.5">
                      <p className="whitespace-pre-wrap text-small text-text-secondary">{n.text}</p>
                      <p className="mt-1 font-mono text-caption text-text-tertiary">
                        {formatRelativeDate(n.createdAt)}
                        {n.deal ? ` · ${n.deal.name}` : n.contact ? ` · ${n.contact.name}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <div className="md:col-span-2">
              <HistoricoDoRegistro url={`/api/companies/${companyId}/historico`} versao={data} />
            </div>
          </div>
        )}

        {abaVisivel === "pessoas" &&
          (contacts.length === 0 ? (
            <p className="text-small text-text-tertiary">Nenhum contato nesta empresa. Vincule pela ficha do contato, na tela de Contatos.</p>
          ) : (
            <ul aria-label="Pessoas da empresa" className="flex flex-col">
              {contacts.map((c) => (
                <li key={c.id} className="flex h-14.5 items-center gap-3 border-b border-border-subtle px-2 last:border-b-0">
                  <FotoDaPessoa nome={c.name || "Sem nome"} semente={c.id} tamanho="md" />
                  <Link href={`/contatos/${c.id}`} className={cn("min-w-0 flex-1 rounded-lg", focusRing)}>
                    <span className="block truncate text-body font-medium text-text-primary hover:underline">{c.name || "Sem nome"}</span>
                    <span className="block truncate text-caption text-text-tertiary">
                      {[c.jobTitle, c.email || c.phone].filter(Boolean).join(" · ") || "—"}
                    </span>
                  </Link>
                  <Button variant="ghost" size="sm" onClick={(e) => void desvincular(c, e.currentTarget)}>
                    Desvincular
                  </Button>
                </li>
              ))}
            </ul>
          ))}

        {abaVisivel === "negocios" &&
          (deals.length === 0 ? (
            <p className="text-small text-text-tertiary">Nenhum negócio nesta conta ainda.</p>
          ) : (
            <ul aria-label="Negócios da empresa" className="flex flex-col">
              {deals.map((d) => (
                <li key={d.id} className="border-b border-border-subtle last:border-b-0">
                  <button
                    type="button"
                    onClick={() => setDealAberto(d.id)}
                    className={cn(
                      "group flex min-h-14.5 w-full items-center justify-between gap-3 rounded-xl px-2 py-2 text-left transition-colors duration-120 hover:bg-raised",
                      focusRing
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-body font-medium text-text-primary">{d.name}</span>
                      <span className="block truncate text-caption text-text-tertiary">
                        {d.pipeline} · {d.stage}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2.5">
                      {d.amountCents > 0 && <span className="text-small font-semibold tabular-nums text-text-primary">{money(d.amountCents)}</span>}
                      {d.stageType === "won" ? (
                        <Badge variant="success">Ganho</Badge>
                      ) : d.stageType === "lost" ? (
                        <Badge variant="danger">Perdido</Badge>
                      ) : (
                        <Badge className="tabular-nums">{d.probability}%</Badge>
                      )}
                      <ChevronRight size={15} aria-hidden className="text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100" />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ))}

        {abaVisivel === "dados" && dadosDaEmpresa}
      </div>
      {largo && (
        <aside aria-label="Dados da empresa" className="flex flex-col gap-3 self-start xl:sticky xl:top-2">
          <h2 className="font-mono text-caption text-text-tertiary">Dados</h2>
          <div className="rounded-[18px] border border-border-subtle bg-panel p-4 [&>section]:grid-cols-1 [&_.sm\:col-span-2]:col-span-1">{dadosDaEmpresa}</div>
        </aside>
      )}
      </div>

      {dealAberto && <DealDrawer dealId={dealAberto} onClose={() => setDealAberto(null)} onChanged={carregar} />}
      {dialogoDeConclusao}
    </div>
  );
}

/** Um número da conta: rótulo pequeno em cima, o número grande, a linha de apoio. */
function Numero({ rotulo, valor, apoio, tom }: { rotulo: string; valor: string; apoio: string; tom?: "success" }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 px-4 py-3.5">
      <dt className="font-mono text-caption uppercase tracking-wider text-text-tertiary">{rotulo}</dt>
      <dd className={cn("truncate text-heading tabular-nums md:text-display", tom === "success" ? "text-success" : "text-text-primary")} title={valor}>
        {valor}
      </dd>
      <dd className="text-caption text-text-tertiary">{apoio}</dd>
    </div>
  );
}

/** Botão redondo grande com o nome embaixo. Sem destino: fica apagado. */
function AcaoRedonda({ rotulo, href, externo, children }: { rotulo: string; href: string | null; externo?: boolean; children: React.ReactNode }) {
  const circulo =
    "grid size-10.5 place-items-center rounded-full bg-raised text-text-primary ring-1 ring-border-default transition-colors duration-120 group-hover:bg-hover [&_svg]:size-4";
  const casca = cn("group flex flex-col items-center gap-1.5 rounded-xl text-caption text-text-tertiary", focusRing);
  const conteudo = (
    <>
      <span className={circulo}>{children}</span>
      {rotulo}
    </>
  );
  if (!href) {
    return (
      <span className={cn(casca, "cursor-not-allowed opacity-40")} title={`${rotulo}: sem dado na empresa`} aria-disabled="true">
        {conteudo}
      </span>
    );
  }
  return (
    <a href={href} className={casca} {...(externo ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
      {conteudo}
    </a>
  );
}

/** Campo que salva ao sair, igual ao resto do CRM: não existe botão Salvar. */
function Campo({
  label, value, onChange, onSave,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onSave: (v: string) => void;
}) {
  const inicial = React.useRef(value);
  React.useEffect(() => { inicial.current = value; /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  return (
    <Field label={label}>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => { if (value !== inicial.current) { inicial.current = value; onSave(value); } }}
      />
    </Field>
  );
}

function VoltarParaEmpresas() {
  return (
    <Link
      href="/empresas"
      className={cn("inline-flex h-8 items-center gap-2 rounded-full px-3.5 text-small font-medium text-text-secondary hover:bg-hover hover:text-text-primary", focusRing)}
    >
      <ArrowLeft size={14} aria-hidden /> Empresas
    </Link>
  );
}

function Esqueleto() {
  const bloco = (c: string) => <span aria-hidden className={`block animate-pulse rounded-[14px] bg-raised motion-reduce:animate-none ${c}`} />;
  return (
    <div className="flex flex-col gap-5 px-4 pt-1 lg:px-6" role="status" aria-label="Carregando empresa">
      {bloco("h-5 w-40")}
      <div className="mx-auto flex w-full max-w-[724px] flex-col gap-5">
        <div className="flex items-center gap-5">
          <span aria-hidden className="size-24 animate-pulse rounded-[26px] bg-raised motion-reduce:animate-none" />
          <div className="flex flex-1 flex-col gap-2">
            {bloco("h-7 w-64 max-w-full")}
            {bloco("h-4 w-48 max-w-full")}
          </div>
        </div>
        {bloco("h-24")}
        {bloco("h-8 w-72 max-w-full")}
        {bloco("h-40")}
      </div>
      <span className="sr-only">Carregando...</span>
    </div>
  );
}
