"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
  Building2,
  Handshake,
  CheckSquare,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MarcaAjuda } from "./marca-ajuda";
import { useSondagem } from "@/components/inbox/use-sondagem";
import { SidebarNavItem } from "./sidebar-nav-item";
import { OrgSwitcher } from "./org-switcher";

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
        "glass-card flex h-full shrink-0 flex-col rounded-3xl bg-surface-1/90 p-3 transition-[width] duration-200",
        mobile ? "glass-card-solid w-full" : collapsed ? "w-[76px]" : "w-[248px]"
      )}
    >
      <div className="mb-3 flex items-center justify-between border-b border-border-subtle px-1 pb-3 pt-1">
        {!collapsed && (
          <Link href="/inicio" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/eva-mark.png" alt="" width={22} height={22} />
            <span className="font-display text-[14px] font-bold text-text-primary">Eva</span>
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

      <OrgSwitcher collapsed={collapsed} />

      <nav className="mt-5 flex flex-1 flex-col gap-5 overflow-y-auto">
        {NAV_PRINCIPAL.map((group, i) => (
          <div key={i} className="flex flex-col gap-1">
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

        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={alternarMais}
            aria-expanded={mostrarMais}
            title="Mais ferramentas"
            className={cn(
              "flex items-center gap-2 rounded-xl px-2.5 py-2 text-[12px] font-semibold uppercase tracking-wide text-text-tertiary transition-colors hover:text-text-primary",
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
              <div key={i} className="mb-2 flex flex-col gap-1">
                {group.label && !collapsed && (
                  <p className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary/70">
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

      <div className="mt-2 border-t border-border-subtle pt-2">
        <Link
          href="/ajuda"
          title="Eva Help — tudo que dá pra fazer no app"
          className={cn(
            "flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] font-medium text-text-tertiary transition-colors",
            "hover:bg-surface-2 hover:text-text-primary",
            collapsed && "justify-center px-0"
          )}
        >
          <MarcaAjuda size={17} className="shrink-0" />
          {!collapsed && <span>Eva Help</span>}
        </Link>
      </div>
    </aside>
  );
}
