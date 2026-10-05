"use client";

import * as React from "react";
import Link from "next/link";
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

const NAV_GROUPS: NavGroup[] = [
  {
    label: null,
    items: [
      { href: "/inicio", label: "Início", icon: Home },
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/insights", label: "Insights", icon: Zap },
    ],
  },
  {
    label: "Agentes",
    items: [
      { href: "/agent-studio", label: "Eva Studio", icon: Aperture, animated: true },
      { href: "/aprovacoes", label: "Aprovações", icon: CheckCheck },
      { href: "/disparos", label: "Disparos", icon: Send },
      { href: "/sequencias", label: "Sequências", icon: Repeat },
    ],
  },
  {
    label: "Fontes",
    items: [
      { href: "/biblioteca", label: "Biblioteca", icon: BookOpen },
      { href: "/integracoes", label: "Integrações", icon: Plug },
    ],
  },
  {
    label: "CRM",
    items: [
      { href: "/contatos", label: "Contatos", icon: Contact },
      { href: "/empresas", label: "Empresas", icon: Building2 },
      { href: "/negocios", label: "Negócios", icon: Handshake },
      { href: "/tarefas", label: "Tarefas", icon: CheckSquare },
    ],
  },
  {
    label: "Acompanhamento",
    items: [
      { href: "/leads", label: "Leads", icon: Users },
      { href: "/conversas", label: "Conversas", icon: MessageSquare },
      { href: "/playground", label: "Playground", icon: PlayCircle },
    ],
  },
];

export function Sidebar({ mobile = false }: { mobile?: boolean }) {
  const [collapsedState, setCollapsed] = React.useState(false);
  // Na gaveta do celular não existe "recolher": ela ou está aberta, ou não existe.
  const collapsed = mobile ? false : collapsedState;
  const [naoLidas, setNaoLidas] = React.useState(0);

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
        {NAV_GROUPS.map((group, i) => (
          <div key={i} className="flex flex-col gap-1">
            {group.label && !collapsed && (
              <p className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
                {group.label}
              </p>
            )}
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
