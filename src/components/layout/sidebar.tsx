"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { usePathname } from "@/lib/contrato/navegacao";
import {
  Home,
  LayoutDashboard,
  Zap,
  Aperture,
  CheckCheck,
  Send,
  LayoutGrid,
  BookOpen,
  Plug,
  MessageSquare,
  PlayCircle,
  PanelLeftClose,
  PanelLeftOpen,
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
      { href: "/inicio", label: "Início", icon: Home },
      { href: "/conversas", label: "Conversas", icon: MessageSquare },
      { href: "/negocios", label: "Negócios", icon: Handshake },
      { href: "/contatos", label: "Contatos", icon: Contact },
      { href: "/tarefas", label: "Tarefas", icon: CheckSquare },
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/agent-studio", label: "Agentes de IA", icon: Aperture, animated: true },
    ],
  },
];

const NAV_AVANCADO: NavGroup[] = [
  {
    label: "Automação",
    items: [
      { href: "/automacoes", label: "Automações", icon: Workflow },
      { href: "/sequencias", label: "Sequências", icon: Repeat },
      { href: "/disparos", label: "Disparos", icon: Send },
      { href: "/aprovacoes", label: "Aprovações", icon: CheckCheck },
      { href: "/biblioteca", label: "Biblioteca", icon: BookOpen },
    ],
  },
  {
    label: "Dados",
    items: [
      { href: "/empresas", label: "Empresas", icon: Building2 },
      { href: "/leads", label: "Leads", icon: Users },
      { href: "/insights", label: "Insights", icon: Zap },
    ],
  },
  {
    label: "Ferramentas",
    items: [
      { href: "/integracoes", label: "Integrações", icon: Plug },
      { href: "/playground", label: "Playground", icon: PlayCircle },
    ],
  },
];

const CHAVE_MAIS = "eva_menu_mais";

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
  const [collapsedState, setCollapsed] = React.useState(false);
  // Na gaveta do celular não existe "recolher": ela ou está aberta, ou não existe.
  const collapsed = mobile ? false : collapsedState;
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
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col border-r border-border-subtle bg-panel px-3 py-3.5 transition-[width] duration-[var(--dur-base)] ease-out",
        mobile ? "w-full bg-panel" : collapsed ? "w-[68px]" : "w-[240px]"
      )}
    >
      <div className="mb-1 flex items-center justify-between px-1 pb-2">
        {!collapsed && (
          <Link href="/inicio" className="flex items-center gap-2">
            <MarcaEva size={20} className="text-text-primary" />
            <span className="text-body font-semibold tracking-tight text-text-primary">Eva</span>
          </Link>
        )}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-surface-2 hover:text-text-primary"
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
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
                badge={item.href === "/conversas" && naoLidas > 0 ? (naoLidas > 99 ? "99+" : String(naoLidas)) : item.badge}
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
  );
}
