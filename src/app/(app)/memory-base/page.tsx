import { LayoutGrid } from "lucide-react";
import { ComingSoon } from "@/components/layout/coming-soon";

export default function MemoryBasePage() {
  return (
    <ComingSoon
      icon={<LayoutGrid size={30} className="text-text-secondary" />}
      title="Memory base"
      description="A memória de longo prazo compartilhada entre seus agentes vai viver aqui."
    />
  );
}
