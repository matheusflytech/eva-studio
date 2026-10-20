"use client";

import * as React from "react";
import { Copy, MoreHorizontal, Pencil, Star, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal, ModalContent } from "@/components/ui/modal";
import { Notice } from "@/components/ui/notice";
import { Badge } from "@/components/ui/badge";
import { ViewTabs, type ViewTab } from "@/components/ui/view-tabs";
import { useToast } from "@/components/ui/toast";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { EntidadeCrm } from "@/lib/filtro-crm";
import {
  diferencasDaBase,
  ID_DE_VISAO_SALVA,
  type EstadoDaLista,
  type FiltroDaBarra,
  type PadraoDaLista,
} from "@/lib/listas/estado-da-lista";
import {
  ROTULO_DA_VISIBILIDADE,
  VISIBILIDADES,
  estadoDaConfig,
  type ConfigDaVisao,
  type VisaoSalva,
  type Visibilidade,
} from "@/lib/visoes/visoes";

// ---------------------------------------------------------------------------
// Visões salvas nas abas das listas (fase L4): visões de sistema (fixas) +
// as salvas que a pessoa enxerga, com contagem, "+" que cria a partir do que
// está na tela, menu da aba (renomear, duplicar, visibilidade, padrão,
// apagar) e o marcador "não salvo" com Salvar / Salvar como nova / Descartar.
// Sem a tabela no banco, ficam só as de sistema e um aviso discreto.
// ---------------------------------------------------------------------------

export interface VisaoDeSistema {
  id: string;
  label: string;
}

export interface VisoesDaLista {
  carregado: boolean;
  disponivel: boolean;
  visoes: VisaoSalva[];
  /** Visão padrão da pessoa (salva ou de sistema). */
  padrao: string;
  salva: (id: string) => VisaoSalva | undefined;
  /** Estado guardado da visão salva (a base da URL). */
  baseDaVisao: (id: string) => EstadoDaLista | undefined;
  /** Visão de sistema que dá as condições ("meus"...) para a aba atual. */
  visaoBase: (id: string) => string;
  criar: (dados: { nome: string; visibilidade: Visibilidade; teamId: string | null; config: ConfigDaVisao }) => Promise<VisaoSalva | null>;
  alterar: (id: string, dados: Partial<{ nome: string; visibilidade: Visibilidade; teamId: string | null; config: ConfigDaVisao }>) => Promise<VisaoSalva | null>;
  apagar: (id: string) => Promise<boolean>;
  definirPadrao: (id: string) => Promise<void>;
}

async function pedir<T>(url: string, init?: RequestInit): Promise<{ ok: true; dados: T } | { ok: false; erro: string }> {
  try {
    const r = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, erro: d.error ?? "Não foi possível salvar a visão." };
    return { ok: true, dados: d as T };
  } catch {
    return { ok: false, erro: "Sem conexão. Tente de novo." };
  }
}

/** Visões salvas da lista (e do funil, em negócios). */
export function useVisoesDaLista(entidade: EntidadeCrm, sistema: readonly VisaoDeSistema[], padraoDaLista: PadraoDaLista, pipelineId?: string): VisoesDaLista {
  const toast = useToast();
  const [estado, setEstado] = React.useState<{ carregado: boolean; disponivel: boolean; visoes: VisaoSalva[]; padrao: string | null }>({
    carregado: false,
    disponivel: true,
    visoes: [],
    padrao: null,
  });

  React.useEffect(() => {
    if (entidade === "negocios" && !pipelineId) return;
    let vivo = true;
    const q = new URLSearchParams({ entidade, ...(pipelineId ? { pipeline: pipelineId } : {}) });
    fetch(`/api/visoes?${q}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!vivo) return;
        setEstado({ carregado: true, disponivel: d?.disponivel !== false && !!d, visoes: d?.visoes ?? [], padrao: d?.padrao ?? null });
      })
      .catch(() => vivo && setEstado((e) => ({ ...e, carregado: true, disponivel: false })));
    return () => {
      vivo = false;
    };
  }, [entidade, pipelineId]);

  const porId = React.useMemo(() => new Map(estado.visoes.map((v) => [v.id, v])), [estado.visoes]);
  const salva = React.useCallback((id: string) => porId.get(id), [porId]);
  const baseDaVisao = React.useCallback(
    (id: string) => {
      const v = porId.get(id);
      return v ? estadoDaConfig(v.config, padraoDaLista, v.id) : undefined;
    },
    // padraoDaLista é constante da tela
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [porId]
  );
  const visaoBase = React.useCallback(
    (id: string) => porId.get(id)?.config.visaoBase ?? (sistema.some((s) => s.id === id) ? id : (sistema[0]?.id ?? "todos")),
    [porId, sistema]
  );

  const criar: VisoesDaLista["criar"] = async (dados) => {
    const r = await pedir<{ visao: VisaoSalva }>("/api/visoes", {
      method: "POST",
      body: JSON.stringify({ entidade, pipelineId: entidade === "negocios" ? pipelineId : undefined, ...dados }),
    });
    if (!r.ok) {
      toast({ title: r.erro, tone: "danger" });
      return null;
    }
    setEstado((e) => ({ ...e, visoes: [...e.visoes, r.dados.visao] }));
    return r.dados.visao;
  };
  const alterar: VisoesDaLista["alterar"] = async (id, dados) => {
    const r = await pedir<{ visao: VisaoSalva }>(`/api/visoes/${id}`, { method: "PATCH", body: JSON.stringify(dados) });
    if (!r.ok) {
      toast({ title: r.erro, tone: "danger" });
      return null;
    }
    setEstado((e) => ({ ...e, visoes: e.visoes.map((v) => (v.id === id ? r.dados.visao : v)) }));
    return r.dados.visao;
  };
  const apagar: VisoesDaLista["apagar"] = async (id) => {
    const r = await pedir<{ ok: boolean }>(`/api/visoes/${id}`, { method: "DELETE" });
    if (!r.ok) {
      toast({ title: r.erro, tone: "danger" });
      return false;
    }
    setEstado((e) => ({ ...e, visoes: e.visoes.filter((v) => v.id !== id), padrao: e.padrao === id ? null : e.padrao }));
    return true;
  };
  const definirPadrao: VisoesDaLista["definirPadrao"] = async (id) => {
    const r = await pedir<{ padrao: string }>("/api/visoes/padrao", { method: "PUT", body: JSON.stringify({ entidade, visao: id }) });
    if (!r.ok) {
      toast({ title: r.erro, tone: "danger" });
      return;
    }
    setEstado((e) => ({ ...e, padrao: r.dados.padrao }));
    toast({ title: "Visão padrão definida", description: "É a que abre quando você entra nesta lista.", tone: "success" });
  };

  return {
    carregado: estado.carregado,
    disponivel: estado.disponivel,
    visoes: estado.visoes,
    padrao: estado.padrao ?? padraoDaLista.visao,
    salva,
    baseDaVisao,
    visaoBase,
    criar,
    alterar,
    apagar,
    definirPadrao,
  };
}


type Dialogo =
  | { tipo: "criar"; titulo: string; nome: string; config: ConfigDaVisao }
  | { tipo: "renomear"; visao: VisaoSalva }
  | { tipo: "visibilidade"; visao: VisaoSalva }
  | { tipo: "apagar"; visao: VisaoSalva };

/** Abas de visão + menu + marcador "não salvo". */
export function AbasDeVisoes({
  rotulo,
  sistema,
  visoes,
  estado,
  onEstado,
  barra,
  contagens,
  configAtual,
  equipes,
  padraoDaLista,
}: {
  rotulo: string;
  sistema: readonly VisaoDeSistema[];
  visoes: VisoesDaLista;
  estado: EstadoDaLista;
  onEstado: (e: EstadoDaLista) => void;
  barra: FiltroDaBarra[];
  contagens: Record<string, number>;
  /** Config do que está na tela (para "+", Salvar e Salvar como nova). */
  configAtual: () => ConfigDaVisao;
  equipes: { id: string; name: string }[];
  padraoDaLista: PadraoDaLista;
}) {
  const toast = useToast();
  const [dialogo, setDialogo] = React.useState<Dialogo | null>(null);
  const atual = visoes.salva(estado.visao);
  const base = atual ? visoes.baseDaVisao(atual.id) : undefined;
  const mudancas = atual && base ? diferencasDaBase(estado, base, barra) : [];
  const sumiu = visoes.carregado && ID_DE_VISAO_SALVA.test(estado.visao) && !atual;

  function trocar(id: string) {
    const nova = visoes.baseDaVisao(id);
    if (nova) return onEstado({ ...nova, pagina: 1 });
    // Sistema: de outra de sistema mantém os filtros (como antes); de uma
    // salva, começa limpo (os filtros eram dela).
    if (atual || sumiu) return onEstado({ ...estadoVazioDe(padraoDaLista, estado.tamanho), visao: id });
    onEstado({ ...estado, visao: id, pagina: 1 });
  }

  function novaVisao(titulo: string, nome: string) {
    if (!visoes.disponivel) {
      toast({ title: "Salvar visões ainda não está ativado neste contrato.", description: "Falta aplicar o SQL das visões salvas.", tone: "info" });
      return;
    }
    setDialogo({ tipo: "criar", titulo, nome, config: configAtual() });
  }

  async function salvarAlteracoes() {
    if (!atual) return;
    const v = await visoes.alterar(atual.id, { config: configAtual() });
    if (v) {
      onEstado({ ...estadoDaConfig(v.config, padraoDaLista, v.id), pagina: estado.pagina });
      toast({ title: "Visão salva", tone: "success" });
    }
  }

  const menuDaAba = (id: string): React.ReactNode => {
    const v = visoes.salva(id);
    const ehPadrao = visoes.padrao === id;
    if (!visoes.disponivel) return null;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton aria-label="Opções da visão" size="sm">
            <MoreHorizontal />
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {v?.podeEditar && (
            <DropdownMenuItem onSelect={() => setDialogo({ tipo: "renomear", visao: v })}>
              <Pencil aria-hidden="true" /> Renomear
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => novaVisao("Duplicar visão", `${v?.nome ?? sistema.find((s) => s.id === id)?.label ?? "Visão"} (cópia)`)}>
            <Copy aria-hidden="true" /> Duplicar
          </DropdownMenuItem>
          {v?.podeEditar && (
            <DropdownMenuItem onSelect={() => setDialogo({ tipo: "visibilidade", visao: v })}>
              <Users aria-hidden="true" /> Mudar visibilidade
            </DropdownMenuItem>
          )}
          <DropdownMenuItem disabled={ehPadrao} onSelect={() => visoes.definirPadrao(id)}>
            <Star aria-hidden="true" /> {ehPadrao ? "É a sua visão padrão" : "Definir como padrão"}
          </DropdownMenuItem>
          {v?.podeEditar && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem tone="danger" onSelect={() => setDialogo({ tipo: "apagar", visao: v })}>
                <Trash2 aria-hidden="true" /> Apagar
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const abas: ViewTab[] = [
    ...sistema.map((s) => ({ id: s.id, label: s.label, count: contagens[s.id], menu: menuDaAba(s.id) })),
    ...visoes.visoes.map((v) => ({
      id: v.id,
      label: v.nome,
      count: contagens[v.id],
      dirty: v.id === estado.visao && mudancas.length > 0,
      hint: dicaDaVisao(v, equipes),
      menu: menuDaAba(v.id),
    })),
  ];

  return (
    <div className="flex flex-col gap-2">
      <ViewTabs label={rotulo} value={estado.visao} onChange={trocar} views={abas} onAdd={() => novaVisao("Nova visão", "")} addLabel="Salvar o que está na tela como visão" />

      {!visoes.disponivel && visoes.carregado && (
        <p className="text-caption text-text-tertiary">Visões salvas ainda não estão ativadas neste contrato; colunas ficam guardadas só neste navegador.</p>
      )}
      {sumiu && (
        <Notice tone="warning">Esta visão não existe mais ou não foi compartilhada com você. Os filtros do link continuam aplicados.</Notice>
      )}
      {atual && mudancas.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-raised px-3 py-1.5 text-small" role="status">
          <span className="size-1.5 rounded-full bg-accent-solid" aria-hidden="true" />
          <span className="text-text-secondary">
            Alterações não salvas em <span className="text-text-primary">{mudancas.join(", ")}</span>
            {!atual.podeEditar && " (a visão é de outra pessoa)"}
          </span>
          <span className="ml-auto flex items-center gap-1">
            {atual.podeEditar && (
              <Button size="sm" variant="primary" onClick={salvarAlteracoes}>
                Salvar
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={() => novaVisao("Salvar como nova visão", `${atual.nome} (minha)`)}>
              Salvar como nova
            </Button>
            <Button size="sm" variant="ghost" onClick={() => base && onEstado({ ...base, pagina: 1 })}>
              Descartar
            </Button>
          </span>
        </div>
      )}

      {dialogo && (
        <DialogoDaVisao
          dialogo={dialogo}
          equipes={equipes}
          onFechar={() => setDialogo(null)}
          onCriar={async (nome, visibilidade, teamId) => {
            if (dialogo.tipo !== "criar") return;
            const v = await visoes.criar({ nome, visibilidade, teamId, config: dialogo.config });
            if (!v) return;
            setDialogo(null);
            onEstado({ ...estadoDaConfig(v.config, padraoDaLista, v.id), pagina: 1 });
            toast({ title: `Visão “${v.nome}” criada`, tone: "success" });
          }}
          onRenomear={async (nome) => {
            if (dialogo.tipo !== "renomear") return;
            if (await visoes.alterar(dialogo.visao.id, { nome })) setDialogo(null);
          }}
          onVisibilidade={async (visibilidade, teamId) => {
            if (dialogo.tipo !== "visibilidade") return;
            if (await visoes.alterar(dialogo.visao.id, { visibilidade, teamId })) setDialogo(null);
          }}
          onApagar={async () => {
            if (dialogo.tipo !== "apagar") return;
            const id = dialogo.visao.id;
            if (!(await visoes.apagar(id))) return;
            setDialogo(null);
            if (estado.visao === id) onEstado({ ...estadoVazioDe(padraoDaLista, estado.tamanho), visao: sistema[0]?.id ?? "todos" });
            toast({ title: `Visão “${dialogo.visao.nome}” apagada`, tone: "neutral" });
          }}
        />
      )}
    </div>
  );
}

function estadoVazioDe(padrao: PadraoDaLista, tamanho: number): EstadoDaLista {
  return { visao: padrao.visao, busca: "", listas: {}, datas: {}, avancado: { logica: "e", grupos: [] }, ordem: null, pagina: 1, tamanho };
}

function dicaDaVisao(v: VisaoSalva, equipes: { id: string; name: string }[]): string {
  const vis =
    v.visibilidade === "equipe"
      ? `Equipe ${equipes.find((e) => e.id === v.teamId)?.name ?? ""}`.trim()
      : ROTULO_DA_VISIBILIDADE[v.visibilidade];
  return `${vis}${v.donoNome ? ` · de ${v.donoNome}` : ""}`;
}

function DialogoDaVisao({
  dialogo,
  equipes,
  onFechar,
  onCriar,
  onRenomear,
  onVisibilidade,
  onApagar,
}: {
  dialogo: Dialogo;
  equipes: { id: string; name: string }[];
  onFechar: () => void;
  onCriar: (nome: string, v: Visibilidade, teamId: string | null) => Promise<void>;
  onRenomear: (nome: string) => Promise<void>;
  onVisibilidade: (v: Visibilidade, teamId: string | null) => Promise<void>;
  onApagar: () => Promise<void>;
}) {
  const inicial = dialogo.tipo === "criar" ? dialogo.nome : dialogo.visao.nome;
  const [nome, setNome] = React.useState(inicial);
  const [vis, setVis] = React.useState<Visibilidade>(dialogo.tipo === "visibilidade" ? dialogo.visao.visibilidade : "pessoal");
  const [teamId, setTeamId] = React.useState<string>((dialogo.tipo === "visibilidade" ? dialogo.visao.teamId : null) ?? equipes[0]?.id ?? "");
  const [enviando, setEnviando] = React.useState(false);
  const comNome = dialogo.tipo === "criar" || dialogo.tipo === "renomear";
  const comVisibilidade = dialogo.tipo === "criar" || dialogo.tipo === "visibilidade";
  const pode = (!comNome || !!nome.trim()) && (!comVisibilidade || vis !== "equipe" || !!teamId) && !enviando;

  const titulo =
    dialogo.tipo === "criar" ? dialogo.titulo : dialogo.tipo === "renomear" ? "Renomear visão" : dialogo.tipo === "visibilidade" ? "Quem vê esta visão" : "Apagar visão";

  async function enviar() {
    if (!pode) return;
    setEnviando(true);
    const t = vis === "equipe" ? teamId || null : null;
    if (dialogo.tipo === "criar") await onCriar(nome.trim(), vis, t);
    else if (dialogo.tipo === "renomear") await onRenomear(nome.trim());
    else if (dialogo.tipo === "visibilidade") await onVisibilidade(vis, t);
    else await onApagar();
    setEnviando(false);
  }

  return (
    <Modal open onOpenChange={(v) => !v && onFechar()}>
      <ModalContent
        size="sm"
        title={titulo}
        description={
          dialogo.tipo === "apagar"
            ? `“${dialogo.visao.nome}” some das abas de todos que a enxergam. Os registros não são apagados.`
            : dialogo.tipo === "criar"
              ? "Guarda os filtros, a busca, a ordem e as colunas que estão na tela."
              : undefined
        }
        footer={
          <>
            <Button variant="ghost" onClick={onFechar}>
              Cancelar
            </Button>
            <Button variant={dialogo.tipo === "apagar" ? "danger" : "primary"} disabled={!pode} loading={enviando} onClick={enviar}>
              {dialogo.tipo === "apagar" ? "Apagar visão" : "Salvar"}
            </Button>
          </>
        }
      >
        {dialogo.tipo !== "apagar" && (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void enviar();
            }}
          >
            {comNome && (
              <Field label="Nome" required>
                <Input value={nome} maxLength={80} onChange={(e) => setNome(e.target.value)} autoFocus />
              </Field>
            )}
            {comVisibilidade && (
              <Field label="Quem vê" hint="Ajustes de quem não é dono nunca mudam a visão compartilhada: viram “Salvar como nova”.">
                <Select value={vis} onChange={(e) => setVis(e.target.value as Visibilidade)}>
                  {VISIBILIDADES.map((v) => (
                    <option key={v} value={v} disabled={v === "equipe" && equipes.length === 0}>
                      {ROTULO_DA_VISIBILIDADE[v]}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {comVisibilidade && vis === "equipe" && (
              <Field label="Equipe" required>
                <Select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                  {equipes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {vis === "contrato" && comVisibilidade && (
              <p className="text-caption text-text-tertiary">
                <Badge>Todo o contrato</Badge> só quem administra o contrato compartilha com todos.
              </p>
            )}
          </form>
        )}
      </ModalContent>
    </Modal>
  );
}

/** Chips "campo removido" (o motor já ignora a condição) + tirar do filtro. */
export function CamposRemovidos({ removidos, onTirar }: { removidos: { campo: string; rotulo: string }[]; onTirar: () => void }) {
  return (
    <Notice tone="danger">
      <span className="flex flex-wrap items-center gap-1.5">
        Filtro ignorado:
        {removidos.map((r) => (
          <Badge key={r.campo} variant="danger">
            {r.rotulo}
          </Badge>
        ))}
        <button type="button" onClick={onTirar} className="ml-1 font-medium underline">
          Tirar do filtro
        </button>
      </span>
    </Notice>
  );
}
