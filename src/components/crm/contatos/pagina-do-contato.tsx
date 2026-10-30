"use client";

import { useTelaLarga } from "@/lib/use-tela-larga";
import * as React from "react";
import Link from "@/components/contrato/link";
import { ArrowLeft, CalendarDays, ChevronRight, Link2, ListTodo, Mail, MapPin, MoreHorizontal, Phone, RefreshCw, Trash2, TriangleAlert, UserRound } from "lucide-react";
import { LogoOficial } from "@/components/ui/logo-oficial";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Notice } from "@/components/ui/notice";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { focusRing } from "@/components/ui/styles";
import { useToast } from "@/components/ui/toast";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useRouter } from "@/lib/contrato/navegacao";
import { linkDoWhatsAppWeb } from "@/lib/telefone";
import { cn } from "@/lib/utils";
import { ContactActivity } from "@/components/crm/contact-activity";
import { LinhaDoTempoView, NovaNota } from "@/components/crm/negocio/atividade";
import { dataLonga } from "@/components/crm/negocio/pecas";
import type { LinhaDoTempo } from "@/components/crm/negocio/linha-do-tempo";
import { useApagarComDesfazer } from "@/components/crm/lixeira/use-apagar-com-desfazer";
import { useRegistroEmFoco, type RegistroEmFoco } from "@/components/busca/registro-em-foco";
import { CHANNEL_LABEL, nomeDoContato, type Contact, type TagRow } from "./tipos";
import { DadosDoContato } from "./dados-do-contato";
import { EtiquetasDoContato } from "./etiquetas-do-contato";
import { OrigemDeMarketing } from "@/components/marketing/origem";
import { FotoDoContato } from "./foto-do-contato";
import { TrocarFoto } from "@/components/crm/trocar-foto";
import { Bloco, cidadeDo, linkDeLigar } from "./ficha-do-contato";

interface Ficha {
  contact: Contact;
}

type AbaDaPagina = "resumo" | "atividade" | "dados";

// ---------------------------------------------------------------------------
// Página completa do contato (/contacts/<id>), no mesmo espírito da ficha da
// lista: foto grande, nome, cargo · empresa, etiquetas e quatro botões
// redondos (WhatsApp em destaque). Abaixo, três abas: Resumo (dados em
// blocos, tarefas, negócios, conversas e réguas), Atividade (nota + linha do
// tempo inteira, com os filtros por tipo) e Dados (os campos que editam no
// lugar). Copiar link e apagar ficam no "…". O link desta página é o que se
// manda para alguém.
// ---------------------------------------------------------------------------
export function PaginaDoContato({ contactId }: { contactId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [estado, setEstado] = React.useState<"carregando" | "ok" | "nao_encontrado" | "erro">("carregando");
  const [ficha, setFicha] = React.useState<Ficha | null>(null);
  const [tags, setTags] = React.useState<TagRow[]>([]);
  const [linha, setLinha] = React.useState<LinhaDoTempo>({ itens: [], conversas: [] });
  const [linhaFalhou, setLinhaFalhou] = React.useState(false);
  const [aba, setAba] = React.useState<AbaDaPagina>("resumo");
  const largo = useTelaLarga();
  // Botão redondo "Tarefa": vai ao Resumo e abre o campo de nova tarefa.
  const [pedidoDeTarefa, setPedidoDeTarefa] = React.useState(0);
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

  // Tarefa criada ou concluída no Resumo: a linha do tempo recarrega.
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
  // Busca global (⌘K): ações deste contato primeiro, como na ficha.
  const registro = React.useMemo<RegistroEmFoco | null>(() => {
    if (!contato) return null;
    return {
      tipo: "contato",
      id: contato.id,
      titulo: contato.name || contato.phone || contato.email || "Contato sem nome",
      caminho: `/contacts/${contato.id}`,
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
      aoRestaurar: () => router.push(`/contacts/${contato.id}`),
    });
    if (r.ok) router.push("/contacts");
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
  const cidade = cidadeDo(contato);
  const mudouContato = (c: Contact) => setFicha((f) => (f ? { ...f, contact: c } : f));
  const canais = [...new Set(contato.channels.map((ch) => CHANNEL_LABEL[ch.channel] ?? ch.channel))];
  const abas: { value: AbaDaPagina; label: string }[] = [
    { value: "resumo", label: "Resumo" },
    { value: "atividade", label: linha.itens.length > 0 ? `Atividade ${linha.itens.length}` : "Atividade" },
    ...(largo ? [] : [{ value: "dados" as const, label: "Dados" }]),
  ];
  // No desktop largo os dados ficam na coluna da direita, sempre à vista.
  const abaVisivel: AbaDaPagina = largo && aba === "dados" ? "resumo" : aba;

  return (
    <div className="flex flex-col gap-5 px-4 pb-8 pt-2 lg:px-6">
      <div className="flex items-center gap-2">
        <nav aria-label="Caminho" className="flex min-w-0 items-center gap-1 text-small">
          <Link href="/contacts" className={cn("rounded-full px-1 text-text-secondary hover:text-text-primary", focusRing)}>
            Contatos
          </Link>
          <ChevronRight size={14} aria-hidden className="shrink-0 text-text-tertiary" />
          <span className="truncate font-semibold text-text-primary" aria-current="page">
            {nome}
          </span>
        </nav>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton aria-label="Mais ações do contato" variant="secondary" className="ml-auto">
              <MoreHorizontal aria-hidden />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => void copiarLink()}>
              <Link2 aria-hidden /> Copiar link
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem tone="danger" onSelect={() => void apagar()}>
              <Trash2 aria-hidden /> Apagar contato
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="grid w-full gap-8 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-5">
        <header className="flex flex-wrap items-center gap-5">
          <TrocarFoto endpoint={`/api/contacts/${contato.id}/foto`} temFoto={!!contato.avatarPath} rotulo={nome} onMudou={() => void carregar()}>
            <FotoDoContato nome={nome} semente={contato.id} tamanho="xl" foto={contato.avatarPath} />
          </TrocarFoto>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h1 className="truncate text-heading font-semibold tracking-tight text-text-primary">{nome}</h1>
            <p className="truncate text-small text-text-tertiary">
              {contato.jobTitle && <>{contato.jobTitle} · </>}
              {contato.company ? (
                <Link href={`/companies/${contato.company.id}`} className="text-accent-fg hover:underline">
                  {contato.company.name}
                </Link>
              ) : (
                "Sem empresa"
              )}
            </p>
            <EtiquetasDoContato contact={contato} tags={tags} onChanged={mudouContato} className="mt-1.5" />
          </div>
          <div className="flex shrink-0 gap-3.5">
            {/* Sem o círculo de destaque (acento): o logo oficial já tem a cor dele. */}
            <AcaoRedonda rotulo="WhatsApp" href={whatsapp} externo>
              <LogoOficial marca="whatsapp" tamanho={16} />
            </AcaoRedonda>
            <AcaoRedonda rotulo="Ligar" href={contato.phone ? linkDeLigar(contato.phone) : null}>
              <Phone aria-hidden />
            </AcaoRedonda>
            <AcaoRedonda rotulo="E-mail" href={contato.email ? `mailto:${contato.email}` : null}>
              <Mail aria-hidden />
            </AcaoRedonda>
            <AcaoRedonda
              rotulo="Tarefa"
              onClick={() => {
                setAba("resumo");
                setPedidoDeTarefa((n) => n + 1);
              }}
            >
              <ListTodo aria-hidden />
            </AcaoRedonda>
          </div>
        </header>

        {erro && <Notice tone="danger">{erro}</Notice>}

        <SegmentedControl label="Seções do contato" options={abas} value={abaVisivel} onChange={setAba} className="self-start" />

        {abaVisivel === "resumo" && (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Bloco icone={<Phone aria-hidden />} vazio="Sem telefone" className="h-11.5">{contato.phone}</Bloco>
                <Bloco icone={<Mail aria-hidden />} vazio="Sem e-mail" className="h-11.5">{contato.email}</Bloco>
                {cidade ? (
                  <Bloco icone={<MapPin aria-hidden />} className="h-11.5">{cidade}</Bloco>
                ) : (
                  <Bloco icone={<CalendarDays aria-hidden />} className="h-11.5">Desde {dataLonga(contato.createdAt)}</Bloco>
                )}
                <Bloco icone={<UserRound aria-hidden />} className="h-11.5">{contato.owner?.name ? `Dono: ${contato.owner.name}` : "Sem proprietário"}</Bloco>
              </div>
              {canais.length > 0 && <p className="font-mono text-caption text-text-tertiary">Canais: {canais.join(" · ")}</p>}
            </div>
            <ContactActivity
              contactId={contato.id}
              secoes={["tarefas", "negocios", "conversas", "sequencias"]}
              pedidoDeTarefa={pedidoDeTarefa}
              onCountsChange={aoMudarTarefas}
            />
          </div>
        )}

        {abaVisivel === "atividade" && (
          <section aria-label="Linha do tempo do contato" className="flex flex-col gap-3">
            <NovaNota vinculo={{ contactId: contato.id }} onCriada={carregar} compacto />
            <LinhaDoTempoView itens={linha.itens} falhou={linhaFalhou} agora={agora} rotulos={{ etapas: "Negócios" }} />
          </section>
        )}

        {abaVisivel === "dados" && (
          <section aria-label="Dados do contato" className="flex flex-col gap-3">
            <DadosDoContato contact={contato} onChanged={mudouContato} />
            <OrigemDeMarketing contactId={contato.id} />
          </section>
        )}
      </div>
      {largo && (
        <aside aria-label="Dados do contato" className="flex flex-col gap-3 self-start xl:sticky xl:top-2">
          <h2 className="font-mono text-caption text-text-tertiary">Dados</h2>
          <div className="rounded-[18px] border border-border-subtle bg-panel p-4">
            <DadosDoContato contact={contato} onChanged={mudouContato} />
          </div>
          <OrigemDeMarketing contactId={contato.id} />
        </aside>
      )}
      </div>
    </div>
  );
}

/** Botão redondo grande com o nome embaixo (WhatsApp em destaque). */
function AcaoRedonda({
  rotulo,
  href,
  externo,
  destaque,
  onClick,
  children,
}: {
  rotulo: string;
  href?: string | null;
  externo?: boolean;
  destaque?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const circulo = cn(
    "grid size-10.5 place-items-center rounded-full transition-colors duration-120 [&_svg]:size-4",
    destaque ? "bg-accent-solid text-text-on-accent group-hover:bg-accent-solid-hover" : "bg-raised text-text-primary ring-1 ring-border-default group-hover:bg-hover"
  );
  const casca = cn("group flex flex-col items-center gap-1.5 rounded-xl text-caption", destaque ? "text-text-secondary" : "text-text-tertiary", focusRing);
  const conteudo = (
    <>
      <span className={circulo}>{children}</span>
      {rotulo}
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={casca}>
        {conteudo}
      </button>
    );
  }
  if (!href) {
    return (
      <span className={cn(casca, "cursor-not-allowed opacity-40")} title={`${rotulo}: sem dado no contato`} aria-disabled="true">
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

function VoltarParaContatos() {
  return (
    <Link href="/contacts" className={cn("inline-flex h-9 items-center gap-2 rounded-full px-4 text-body font-medium text-text-secondary hover:bg-hover hover:text-text-primary", focusRing)}>
      <ArrowLeft size={15} aria-hidden /> Contatos
    </Link>
  );
}

function Esqueleto() {
  const bloco = (c: string) => <span aria-hidden className={`block animate-pulse rounded-[14px] bg-raised motion-reduce:animate-none ${c}`} />;
  return (
    <div className="flex flex-col gap-5 px-4 pt-2 lg:px-6" role="status" aria-label="Carregando contato">
      {bloco("h-5 w-40")}
      <div className="mx-auto flex w-full max-w-[724px] flex-col gap-5">
        <div className="flex items-center gap-5">
          <span aria-hidden className="size-24 animate-pulse rounded-full bg-raised motion-reduce:animate-none" />
          <div className="flex flex-1 flex-col gap-2">
            {bloco("h-7 w-64 max-w-full")}
            {bloco("h-4 w-48 max-w-full")}
          </div>
        </div>
        {bloco("h-8 w-64")}
        <div className="grid grid-cols-2 gap-2">
          {bloco("h-11.5")}
          {bloco("h-11.5")}
          {bloco("h-11.5")}
          {bloco("h-11.5")}
        </div>
        {bloco("h-40")}
      </div>
      <span className="sr-only">Carregando...</span>
    </div>
  );
}
