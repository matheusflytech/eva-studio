import { MessageSquare } from "lucide-react";
import { ComingSoon } from "@/components/layout/coming-soon";

export default function ConversasPage() {
  return (
    <ComingSoon
      icon={<MessageSquare size={30} className="text-text-secondary" />}
      title="Conversas"
      description="O histórico de conversas dos seus agentes com clientes vai aparecer aqui."
    />
  );
}
