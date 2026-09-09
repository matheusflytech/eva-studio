import { Target, Headphones, CalendarCheck, ShoppingCart, HelpCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";

const TEMPLATES = [
  {
    icon: Target,
    category: "Vendas",
    name: "Qualificação de leads B2B",
    description: "Checkpoints de abertura, qualificação por orçamento/urgência e handoff para o comercial.",
  },
  {
    icon: Headphones,
    category: "Suporte",
    name: "Suporte técnico Nível 1",
    description: "Triagem de problemas comuns, coleta de diagnóstico e escalonamento quando necessário.",
  },
  {
    icon: CalendarCheck,
    category: "Operações",
    name: "Agendamento de consultas",
    description: "Confirma disponibilidade, agenda e envia lembrete automático.",
  },
  {
    icon: ShoppingCart,
    category: "Vendas",
    name: "Recuperação de carrinho",
    description: "Reengaja clientes que abandonaram o carrinho com uma oferta ou lembrete.",
  },
  {
    icon: HelpCircle,
    category: "Suporte",
    name: "FAQ financeiro",
    description: "Responde dúvidas recorrentes sobre cobranças, boletos e reembolsos.",
  },
];

export default function BibliotecaPage() {
  return (
    <div className="flex-1 p-8">
      <div className="mb-6">
        <h1 className="font-display text-xl font-semibold text-text-primary">Biblioteca</h1>
        <p className="mt-1 max-w-xl text-[13px] text-text-secondary">
          Modelos prontos de instruções para começar um agente novo mais rápido, em vez de escrever do zero.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TEMPLATES.map((tpl) => (
          <div key={tpl.name} className="glass-card flex flex-col rounded-3xl p-5">
            <div className="flex items-center justify-between">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-3 text-text-secondary">
                <tpl.icon size={19} />
              </div>
              <Badge variant="neutral">{tpl.category}</Badge>
            </div>
            <h3 className="mt-4 font-display text-[15px] font-semibold text-text-primary">{tpl.name}</h3>
            <p className="mt-1 flex-1 text-[13px] text-text-secondary">{tpl.description}</p>
            <button type="button" className={buttonVariants({ variant: "secondary", size: "sm", className: "mt-4 self-start" })}>
              Usar modelo
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
