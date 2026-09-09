import { Send } from "lucide-react";
import { ComingSoon } from "@/components/layout/coming-soon";

export default function DisparosPage() {
  return (
    <ComingSoon
      icon={<Send size={30} className="text-text-secondary" />}
      title="Disparos"
      description="Campanhas de mensagens em massa disparadas pelos seus agentes vão aparecer aqui."
    />
  );
}
