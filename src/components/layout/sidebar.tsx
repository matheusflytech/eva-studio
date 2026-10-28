"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { usePathname } from "@/lib/contrato/navegacao";
import {
  Home,
  LayoutDashboard,
  ChartColumn,
  Aperture,
  CheckCheck,
  Send,
  LayoutGrid,
  BookOpen,
  Plug,
  MessageSquare,
  PlayCircle,
  Pin,
  PinOff,
  Users,
  Contact,
  Repeat,
  Workflow,
  Building2,
  Handshake,
  CheckSquare,
  ChevronDown,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSondagem } from "@/components/inbox/use-sondagem";
import { SidebarNavItem } from "./sidebar-nav-item";
import { OrgSwitcher } from "./org-switcher";
import { ThemeToggle } from "@/components/ui/theme";
import { useBuscaGlobal } from "@/components/busca/paleta-de-busca";
import { MarcaEva } from "@/components/layout/marca-eva";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  badge?: string;
  animated?: boolean;
}

interface NavGroup {
  label: string | null;
  items: NavItem[];
}

// O menu principal tem só o que se usa todo dia: atender, vender, acompanhar.
// O resto (réguas, disparos, integrações...) existe e funciona, mas mora em
// "Mais ferramentas": quem abre o app pela primeira vez não precisa decifrar
// quinze itens antes de responder o primeiro cliente.
const NAV_PRINCIPAL: NavGroup[] = [
  {
    label: null,
    items: [
      { href: "/home", label: "Início", icon: Home },
      { href: "/conversations", label: "Conversas", icon: MessageSquare },
      { href: "/deals", label: "Negócios", icon: Handshake },
      { href: "/contacts", label: "Contatos", icon: Contact },
      { href: "/tasks", label: "Tarefas", icon: CheckSquare },
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/agent-studio", label: "Eva Studio", icon: Aperture, animated: true },
    ],
  },
];

const NAV_AVANCADO: NavGroup[] = [
  {
    label: "Automação",
    items: [
      { href: "/automations", label: "Automações", icon: Workflow },
      { href: "/sequences", label: "Sequências", icon: Repeat },
      { href: "/broadcasts", label: "Disparos", icon: Send },
      { href: "/approvals", label: "Aprovações", icon: CheckCheck },
      { href: "/library", label: "Biblioteca", icon: BookOpen },
    ],
  },
  {
    label: "Dados",
    items: [
      { href: "/companies", label: "Empresas", icon: Building2 },
      { href: "/leads", label: "Leads", icon: Users },
      { href: "/reports", label: "Relatórios", icon: ChartColumn },
    ],
  },
  {
    label: "Ferramentas",
    items: [
      { href: "/integrations", label: "Integrações", icon: Plug },
      { href: "/playground", label: "Playground", icon: PlayCircle },
    ],
  },
];

const CHAVE_MAIS = "eva_menu_mais";
const CHAVE_FIXO = "eva_menu_fixo";

/** Abre a busca global; mostra o atalho da plataforma (⌘K no Mac, Ctrl K no resto). */
function BotaoBuscar({ collapsed }: { collapsed: boolean }) {
  const { abrir, mac } = useBuscaGlobal();
  return (
    <button
      type="button"
      onClick={abrir}
      title={`Buscar (${mac ? "⌘K" : "Ctrl+K"})`}
      aria-keyshortcuts={mac ? "Meta+K" : "Control+K"}
      className={cn(
        "mt-3 flex h-[34px] items-center gap-2 rounded-[10px] bg-raised px-2.5 text-small text-text-secondary transition-colors",
        "hover:bg-hover hover:text-text-primary",
        collapsed && "justify-center px-0"
      )}
    >
      <Search size={15} className="shrink-0" aria-hidden />
      {collapsed ? (
        <span className="sr-only">Buscar</span>
      ) : (
        <>
          <span>Buscar</span>
          <span className="ml-auto font-mono text-caption text-text-tertiary">{mac ? "⌘K" : "Ctrl K"}</span>
        </>
      )}
    </button>
  );
}

export function Sidebar({ mobile = false }: { mobile?: boolean }) {
  // Fica só nos ícones; passar o mouse (ou o Tab) abre por cima da tela, sem
  // empurrar o conteúdo. Quem prefere aberto o tempo todo fixa no alfinete.
  const [fixo, setFixo] = React.useState(false);
  const [aberto, setAberto] = React.useState(false);
  const fechar = React.useRef<ReturnType<typeof setTimeout>>(undefined);
  React.useEffect(() => {
    try {
      setFixo(localStorage.getItem(CHAVE_FIXO) === "1");
    } catch {
      /* navegação privada: segue solto */
    }
    return () => clearTimeout(fechar.current);
  }, []);
  // Na gaveta do celular não existe "recolher": ela ou está aberta, ou não existe.
  const collapsed = mobile ? false : !fixo && !aberto;
  const sobreposto = !mobile && !fixo && aberto;

  function alternarFixo() {
    const novo = !fixo;
    setFixo(novo);
    setAberto(false);
    try {
      localStorage.setItem(CHAVE_FIXO, novo ? "1" : "0");
    } catch {
      /* ignora */
    }
  }
  // Folga ao entrar e ao sair: passar o mouse de raspão pela borda não pisca o menu.
  const abrir = () => {
    clearTimeout(fechar.current);
    fechar.current = setTimeout(() => setAberto(true), 120);
  };
  const soltar = () => {
    clearTimeout(fechar.current);
    fechar.current = setTimeout(() => setAberto(false), 350);
  };
  const [naoLidas, setNaoLidas] = React.useState(0);
  const pathname = usePathname();

  // "Mais ferramentas" lembra se estava aberto. Começa fechado no servidor e lê
  // a escolha depois de montar, para não dar diferença entre o HTML do servidor
  // e o do navegador.
  const [maisAberto, setMaisAberto] = React.useState(false);
  React.useEffect(() => {
    try {
      setMaisAberto(localStorage.getItem(CHAVE_MAIS) === "1");
    } catch {
      /* navegação privada: segue fechado */
    }
  }, []);
  // Estando numa página do menu avançado, ele abre sozinho: some o item da
  // página atual do menu seria desorientador.
  const naPaginaAvancada = NAV_AVANCADO.some((g) => g.items.some((i) => pathname === i.href || pathname.startsWith(i.href + "/")));
  const mostrarMais = maisAberto || naPaginaAvancada;

  function alternarMais() {
    const novo = !mostrarMais;
    setMaisAberto(novo);
    try {
      localStorage.setItem(CHAVE_MAIS, novo ? "1" : "0");
    } catch {
      /* ignora */
    }
  }

  // O menu tinha um "+99" escrito à mão, igual pra todo mundo, o tempo todo.
  // Agora é quantas conversas estão esperando alguém olhar. A cada 20s e só com
  // a aba à vista: é um número de relance, não precisa ser instantâneo.
  useSondagem(async () => {
    const res = await fetch("/api/inbox/summary");
    if (res.ok) setNaoLidas((await res.json()).naoLidas ?? 0);
  }, 20_000);

  return (
    // O espaço reservado na tela é o do menu fixo (240) ou o da faixa de ícones (68).
    <div className={cn("relative h-full shrink-0", mobile ? "w-full" : fixo ? "w-[240px]" : "w-[68px]")}>
    <aside
      onMouseEnter={mobile || fixo ? undefined : abrir}
      onMouseLeave={mobile || fixo ? undefined : soltar}
      onFocus={mobile || fixo ? undefined : abrir}
      onBlur={
        mobile || fixo
          ? undefined
          : (e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) soltar();
            }
      }
      className={cn(
        "absolute inset-y-0 left-0 z-30 flex flex-col overflow-hidden border-r border-border-subtle bg-panel px-3 py-3.5 transition-[width,box-shadow] duration-[var(--dur-slow)] ease-[var(--ease-out)]",
        mobile ? "w-full" : collapsed ? "w-[68px]" : "w-[240px]",
        sobreposto && "shadow-[0_24px_64px_-12px_rgb(0_0_0/0.28)]"
      )}
    >
      <div className="mb-1 flex h-8 items-center justify-between px-1 pb-2">
        {collapsed ? (
          <Link href="/home" className="mx-auto flex items-center" aria-label="Início">
            <MarcaEva size={20} className="text-text-primary" />
          </Link>
        ) : (
          <Link href="/home" className="flex items-center gap-2">
            <MarcaEva size={20} className="text-text-primary" />
            <span className="text-body font-semibold tracking-tight text-text-primary">Eva</span>
          </Link>
        )}
        {!mobile && !collapsed && (
          <button
            onClick={alternarFixo}
            className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-surface-2 hover:text-text-primary"
            aria-label={fixo ? "Soltar o menu" : "Fixar o menu aberto"}
            aria-pressed={fixo}
            title={fixo ? "Soltar: o menu abre ao passar o mouse" : "Fixar o menu aberto"}
          >
            {fixo ? <PinOff size={15} /> : <Pin size={15} />}
          </button>
        )}
      </div>

      <BotaoBuscar collapsed={collapsed} />

      <nav className="mt-4 flex flex-1 flex-col gap-4 overflow-y-auto">
        {!collapsed && <p className="-mb-3 px-2.5 font-mono text-caption text-text-tertiary">Navegação</p>}
        {NAV_PRINCIPAL.map((group, i) => (
          <div key={i} className="flex flex-col gap-0.5">
            {group.items.map((item) => (
              <SidebarNavItem
                key={item.href}
                {...item}
                badge={item.href === "/conversations" && naoLidas > 0 ? (naoLidas > 99 ? "99+" : String(naoLidas)) : item.badge}
                collapsed={collapsed}
              />
            ))}
          </div>
        ))}

        <div className="flex flex-col gap-0.5 border-t border-border-subtle pt-3">
          <button
            type="button"
            onClick={alternarMais}
            aria-expanded={mostrarMais}
            title="Mais ferramentas"
            className={cn(
              "flex items-center gap-2 rounded-[10px] px-2.5 py-1.5 font-mono text-caption text-text-tertiary transition-colors hover:text-text-primary",
              collapsed && "justify-center px-0"
            )}
          >
            {collapsed ? (
              <ChevronDown size={15} className={cn("transition-transform", mostrarMais && "rotate-180")} />
            ) : (
              <>
                <span>Mais ferramentas</span>
                <ChevronDown size={14} className={cn("ml-auto transition-transform", mostrarMais && "rotate-180")} />
              </>
            )}
          </button>

          {mostrarMais &&
            NAV_AVANCADO.map((group, i) => (
              <div key={i} className="mb-2 flex flex-col gap-0.5">
                {group.label && !collapsed && (
                  <p className="px-2.5 pb-1 pt-1 font-mono text-caption text-text-tertiary/80">
                    {group.label}
                  </p>
                )}
                {group.items.map((item) => (
                  <SidebarNavItem key={item.href} {...item} collapsed={collapsed} />
                ))}
              </div>
            ))}
        </div>
      </nav>

      {/* Rodapé: você e o contrato (abre o menu da conta por cima da tela) e o
          atalho do tema. A escolha completa fica em Configurações → Sua conta. */}
      <div className={cn("mt-2 flex gap-1.5 pt-2", collapsed ? "flex-col items-center" : "items-center")}>
        <div className="min-w-0 flex-1">
          <OrgSwitcher collapsed={collapsed} />
        </div>
        <ThemeToggle />
      </div>
    </aside>
    </div>
  );
}
