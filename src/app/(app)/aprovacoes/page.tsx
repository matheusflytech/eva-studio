import { CheckCheck } from "lucide-react";
import { ComingSoon } from "@/components/layout/coming-soon";

export default function AprovacoesPage() {
  return (
    <ComingSoon
      icon={<CheckCheck size={30} className="text-text-secondary" />}
      title="Aprovações"
      description="Respostas de agentes que precisam de revisão humana antes de serem enviadas vão aparecer aqui."
    />
  );
}
