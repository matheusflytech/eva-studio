import {
  Home,
  LayoutDashboard,
  ChartColumn,
  Aperture,
  CheckCheck,
  Send,
  BookOpen,
  Plug,
  MessageSquare,
  PlayCircle,
  Users,
  Contact,
  Repeat,
  Workflow,
  Building2,
  Handshake,
  CheckSquare,
  Megaphone,
  CalendarDays,
} from "lucide-react";

export interface ItemDeNavegacao {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  badge?: string;
  animated?: boolean;
}

export interface GrupoDeNavegacao {
  label: string | null;
  items: ItemDeNavegacao[];
}

// O menu principal tem só o que se usa todo dia: atender, vender, acompanhar.
// O resto (réguas, disparos, integrações...) existe e funciona, mas mora em
// "Mais ferramentas": quem abre o app pela primeira vez não precisa decifrar
// quinze itens antes de responder o primeiro cliente. Uma lista só, usada pelo
// menu lateral do celular, pelas abas do topo e pelo trilho do computador.
export const NAV_PRINCIPAL: GrupoDeNavegacao[] = [
  {
    label: null,
    items: [
      { href: "/home", label: "Início", icon: Home },
      { href: "/conversations", label: "Conversas", icon: MessageSquare },
      { href: "/deals", label: "Negócios", icon: Handshake },
      { href: "/contacts", label: "Contatos", icon: Contact },
      { href: "/tasks", label: "Tarefas", icon: CheckSquare },
      { href: "/tasks?tab=calendar", label: "Agenda", icon: CalendarDays },
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/reports", label: "Relatórios", icon: ChartColumn },
      { href: "/agent-studio", label: "Eva Studio", icon: Aperture, animated: true },
    ],
  },
];

export const NAV_AVANCADO: GrupoDeNavegacao[] = [
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
      { href: "/marketing", label: "Marketing", icon: Megaphone },
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
