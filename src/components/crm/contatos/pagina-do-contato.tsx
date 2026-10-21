"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { ArrowLeft, Building2, Mail, Phone, RefreshCw, Trash2, TriangleAlert, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/notice";
import { EmptyState } from "@/components/ui/empty-state";
import { PhoneNumber } from "@/components/ui/phone-number";
import { LogoDaMarca } from "@/components/ui/marca";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRouter } from "@/lib/contrato/navegacao";
import { linkDoWhatsAppWeb } from "@/lib/telefone";
import { ContactActivity } from "@/components/crm/contact-activity";
import { LinhaDoTempoView, NovaNota } from "@/components/crm/negocio/atividade";
import { IconeDoCanal, dataLonga } from "@/components/crm/negocio/pecas";
import { rotuloDoCanal, rotuloDoStatus, type LinhaDoTempo } from "@/components/crm/negocio/linha-do-tempo";
import { useApagarComDesfazer } from "@/components/crm/lixeira/use-apagar-com-desfazer";
import { useRegistroEmFoco, type RegistroEmFoco } from "@/components/busca/registro-em-foco";
import { CHANNEL_LABEL, nomeDoContato, type Contact, type TagRow } from "./tipos";
import { DadosDoContato } from "./dados-do-contato";

interface NegocioDoContato {
  id: string;
  name: string;
  amountCents: number;
  stage: string;
  stageType: string;
  pipeline: string;
  closedAt: string | null;
}
interface ConversaDoContato {
  id: string;
  channel: string;
  status: string;
  updatedAt: string;
}
interface ReguaDoContato {
  id: string;
  sequenceName: string;
  status: string;
}
interface Ficha {
  contact: Contact;
  deals: NegocioDoContato[];
  conversations: ConversaDoContato[];
  enrollments: ReguaDoContato[];
}

const reais = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

// ---------------------------------------------------------------------------
// Página completa do contato (/contatos/<id>), no molde da ficha do negócio:
// à esquerda todos os campos (editam no lugar), no centro a história inteira
// (linha do tempo com notas, tarefas, conversas e o caminho de cada negócio
// dele) e à direita com o que ele está ligado. A gaveta da lista continua
// para o ajuste rápido; o link desta página é o que se manda para alguém.
// ---------------------------------------------------------------------------
export function PaginaDoContato({ contactId }: { contactId: string }) {
  const router = useRouter();
  const [estado, setEstado] = React.useState<"carregando" | "ok" | "nao_encontrado" | "erro">("carregando");
  const [ficha, setFicha] = React.useState<Ficha | null>(null);
  const [tags, setTags] = React.useState<TagRow[]>([]);
  const [linha, setLinha] = React.useState<LinhaDoTempo>({ itens: [], conversas: [] });
  const [linhaFalhou, setLinhaFalhou] = React.useState(false);
  const [aba, setAba] = React.useState("historia");
  const [erro, setErro] = React.useState<string | null>(null);
  // "Agora" estável por carga: os rótulos "Hoje"/"Ontem" não pulam a cada render.
  const [agora, setAgora] = React.useState(() => new Date());

  const carregar = React.useCallback(async () => {
    try {
      const [rf, rl] = await Promise.all([fetch(`/api/contacts/${contactId}`), fetch(`/api/contacts/${contactId}/linha-do-tempo`)]);
      if (rf.status === 404) {
        setEstado("nao_encontrado");
        return;
      }
      if (!rf.ok) {
        setEstado("erro");
        return;
      }
      setFicha(await rf.json());
      if (rl.ok) {
        setLinha(await rl.json());
        setLinhaFalhou(false);
      } else setLinhaFalhou(true);
      setAgora(new Date());
      setEstado("ok");
    } catch {
      setEstado("erro");
    }
  }, [contactId]);

  React.useEffect(() => {
    let vivo = true;
    void (async () => {
      if (vivo) await carregar();
    })();
    void fetch("/api/tags")
      .then((r) => r.json())
      .then((d) => {
        if (vivo) setTags(d.tags ?? []);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [carregar]);

  // Tarefa criada ou concluída na aba "Tarefas e notas": a história recarrega.
  // Estável e só quando o número muda (o efeito do ContactActivity roda a cada
  // função nova; uma seta solta aqui viraria laço de recarga).
  const tarefasAbertas = React.useRef<number | null>(null);
  const aoMudarTarefas = React.useCallback(
    (n: number) => {
      if (tarefasAbertas.current !== null && tarefasAbertas.current !== n) void carregar();
      tarefasAbertas.current = n;
    },
    [carregar]
  );

  const contato = ficha?.contact;
  // Busca global (⌘K): ações deste contato primeiro, como na gaveta.
  const registro = React.useMemo<RegistroEmFoco | null>(() => {
    if (!contato) return null;
    return {
      tipo: "contato",
      id: contato.id,
      titulo: contato.name || contato.phone || contato.email || "Contato sem nome",
      caminho: `/contatos/${contato.id}`,
      subtitulo: [contato.phone, contato.email].filter(Boolean).join(" · "),
      whatsapp: { nome: contato.name || "o contato", telefone: contato.phone },
      tarefa: { contactId: contato.id },
    };
  }, [contato]);
  useRegistroEmFoco(registro);

  const apagarComDesfazer = useApagarComDesfazer();
  async function apagar() {
    if (!contato) return;
    setErro(null);
    const r = await apagarComDesfazer({
      url: `/api/contacts/${contato.id}`,
      titulo: "Contato apagado",
      perguntaSemLixeira: `A lixeira ainda não está ativada: apagar ${nomeDoContato(contato)} leva junto tarefas, notas e etiquetas e não tem volta. Apagar mesmo assim?`,
      aoRestaurar: () => router.push(`/contatos/${contato.id}`),
    });
    if (r.ok) router.push("/contatos");
    else if (r.erro) setErro(r.erro);
  }

  if (estado === "carregando") return <Esqueleto />;
  if (estado === "nao_encontrado") {
    return (
      <EmptyState
        icon={<UserRound size={40} className="text-text-tertiary" aria-hidden />}
        title="Contato não encontrado"
        description="Ele pode ter sido apagado, estar fora do que você vê, ou o link é de outro contrato."
        action={<VoltarParaContatos />}
      />
    );
  }
  if (estado === "erro" || !ficha || !contato) {
    return (
      <EmptyState
        icon={<TriangleAlert size={40} className="text-danger" aria-hidden />}
        title="Não foi possível abrir o contato"
        description="Verifique a conexão e tente de novo."
        action={
          <div className="flex gap-2">
            <VoltarParaContatos />
            <Button onClick={() => void carregar()}>
              <RefreshCw size={15} aria-hidden /> Tentar de novo
            </Button>
          </div>
        }
      />
    );
  }

  const nome = nomeDoContato(contato);
  const whatsapp = linkDoWhatsAppWeb(contato.phone);
  const abertos = ficha.deals.filter((d) => d.stageType === "open");
  const fechados = ficha.deals.filter((d) => d.stageType !== "open");

  return (
    <div className="flex flex-col gap-4 pb-6">
      <Link href="/contatos" className="inline-flex w-fit items-center gap-1.5 text-[13px] font-medium text-text-secondary hover:text-text-primary">
        <ArrowLeft size={15} aria-hidden /> Contatos
      </Link>

      <header className="flex flex-wrap items-start gap-4">
        <Avatar name={nome} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-xl font-semibold text-text-primary">{nome}</h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-text-secondary">
            {contato.company ? (
              <span className="inline-flex items-center gap-1">
                <Building2 size={13} aria-hidden /> {contato.company.name}
              </span>
            ) : (
              <span className="text-text-tertiary">Sem empresa</span>
            )}
            {contato.phone && <PhoneNumber value={contato.phone} />}
            {contato.email && <span className="truncate">{contato.email}</span>}
            <span className="text-text-tertiary">Desde {dataLonga(contato.createdAt)}</span>
          </p>
          {(contato.tags.length > 0 || contato.channels.length > 0) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {contato.tags.map((t) => (
                <Badge key={t.id}>{t.name}</Badge>
              ))}
              {contato.channels.map((ch) => (
                <Badge key={ch.id} variant="info">{CHANNEL_LABEL[ch.channel] ?? ch.channel}</Badge>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {whatsapp && (
            <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-default bg-panel px-3 text-body font-medium text-text-primary hover:bg-raised">
              <LogoDaMarca marca="whatsapp" solto tamanho={15} /> WhatsApp Web
            </a>
          )}
          {contato.phone && (
            <a href={`tel:${contato.phone.replace(/[^\d+]/g, "")}`} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-default bg-panel px-3 text-body font-medium text-text-primary hover:bg-raised">
              <Phone size={14} aria-hidden /> Ligar
            </a>
          )}
          {contato.email && (
            <a href={`mailto:${contato.email}`} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-default bg-panel px-3 text-body font-medium text-text-primary hover:bg-raised">
              <Mail size={14} aria-hidden /> E-mail
            </a>
          )}
          <Button variant="ghost" className="text-danger hover:text-danger" onClick={() => void apagar()}>
            <Trash2 size={14} aria-hidden /> Apagar
          </Button>
        </div>
      </header>

      {erro && <Notice tone="danger">{erro}</Notice>}

      {/* Mesma grade da ficha do negócio: no celular empilha (dados, ligações, história). */}
      <div
        className={
          "grid items-start gap-4 [grid-template-areas:'dados'_'ligacoes'_'historia'] " +
          "lg:grid-cols-[320px_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:[grid-template-areas:'dados_historia'_'ligacoes_historia'] " +
          "xl:grid-cols-[320px_minmax(0,1fr)_300px] xl:grid-rows-[auto] xl:[grid-template-areas:'dados_historia_ligacoes']"
        }
      >
        <section aria-label="Dados do contato" className="min-w-0 rounded-2xl border border-border-subtle bg-surface-1 p-4 [grid-area:dados]">
          <h2 className="mb-3 text-[13px] font-semibold text-text-primary">Dados</h2>
          <DadosDoContato
            contact={contato}
            tags={tags}
            onChanged={(c) => setFicha((f) => (f ? { ...f, contact: c } : f))}
          />
        </section>

        <section aria-label="História do contato" className="min-w-0 rounded-2xl border border-border-subtle bg-surface-1 p-4 [grid-area:historia]">
          <Tabs value={aba} onValueChange={setAba}>
            <TabsList aria-label="Seções">
              <TabsTrigger value="historia">História</TabsTrigger>
              <TabsTrigger value="tarefas">Tarefas e notas</TabsTrigger>
            </TabsList>
            <TabsContent value="historia" className="mt-4 outline-none">
              <NovaNota vinculo={{ contactId: contato.id }} onCriada={carregar} compacto />
              <LinhaDoTempoView itens={linha.itens} falhou={linhaFalhou} agora={agora} rotulos={{ etapas: "Negócios" }} />
            </TabsContent>
            <TabsContent value="tarefas" className="mt-4 outline-none">
              <ContactActivity contactId={contato.id} onCountsChange={aoMudarTarefas} />
            </TabsContent>
          </Tabs>
        </section>

        <div className="flex min-w-0 flex-col gap-4 [grid-area:ligacoes]">
          <section aria-label="Negócios" className="rounded-2xl border border-border-subtle bg-surface-1 p-4">
            <h2 className="mb-2 text-[13px] font-semibold text-text-primary">Negócios</h2>
            {ficha.deals.length === 0 ? (
              <p className="text-[12.5px] text-text-tertiary">Nenhum negócio com este contato.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {[...abertos, ...fechados].map((d) => (
                  <li key={d.id}>
                    <Link href={`/negocios/${d.id}`} className="block rounded-xl border border-border-subtle px-3 py-2 hover:border-border-default">
                      <p className="truncate text-[13px] font-medium text-text-primary">{d.name || "Negócio sem nome"}</p>
                      <p className="mt-0.5 flex items-center justify-between gap-2 text-[12px] text-text-tertiary">
                        <span className="truncate">
                          {d.pipeline} ·{" "}
                          <span className={d.stageType === "won" ? "text-success" : d.stageType === "lost" ? "text-danger" : "text-text-secondary"}>
                            {d.stage}
                          </span>
                        </span>
                        <span className="tabular-nums">{reais(d.amountCents)}</span>
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-label="Conversas" className="rounded-2xl border border-border-subtle bg-surface-1 p-4">
            <h2 className="mb-2 text-[13px] font-semibold text-text-primary">Conversas</h2>
            {ficha.conversations.length === 0 ? (
              <p className="text-[12.5px] text-text-tertiary">Nenhuma conversa ainda.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {ficha.conversations.map((c) => (
                  <li key={c.id}>
                    <Link href={`/conversas?c=${c.id}`} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-hover">
                      <IconeDoCanal canal={c.channel} tamanho={15} />
                      <span className="min-w-0 flex-1 truncate text-[13px] text-text-primary">{rotuloDoCanal(c.channel)}</span>
                      <span className="text-[11.5px] text-text-tertiary">{rotuloDoStatus(c.status)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {ficha.enrollments.length > 0 && (
            <section aria-label="Réguas" className="rounded-2xl border border-border-subtle bg-surface-1 p-4">
              <h2 className="mb-2 text-[13px] font-semibold text-text-primary">Réguas</h2>
              <ul className="flex flex-col gap-1.5">
                {ficha.enrollments.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-2 text-[13px]">
                    <span className="truncate text-text-primary">{e.sequenceName}</span>
                    <Badge variant={e.status === "active" ? "success" : "neutral"}>{e.status === "active" ? "Ativa" : "Parada"}</Badge>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function VoltarParaContatos() {
  return (
    <Link href="/contatos" className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-medium text-text-secondary hover:bg-surface-2 hover:text-text-primary">
      <ArrowLeft size={15} aria-hidden /> Contatos
    </Link>
  );
}

function Esqueleto() {
  const bloco = (c: string) => <span aria-hidden className={`block animate-pulse rounded-lg bg-surface-2 motion-reduce:animate-none ${c}`} />;
  return (
    <div className="flex flex-col gap-4" role="status" aria-label="Carregando contato">
      {bloco("h-4 w-24")}
      {bloco("h-12 w-80 max-w-full")}
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)_300px]">
        {bloco("h-[420px] rounded-2xl")}
        {bloco("h-[520px] rounded-2xl")}
        {bloco("hidden h-[300px] rounded-2xl xl:block")}
      </div>
      <span className="sr-only">Carregando...</span>
    </div>
  );
}
