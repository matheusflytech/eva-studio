"use client";

import * as React from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QuickAdd, useAtalhoT } from "@/components/tarefas/quick-add";
import { MeuDia } from "@/components/tarefas/meu-dia";
import { ListaDeTarefas } from "@/components/tarefas/lista";

// Tarefas: "Meu dia" (a home do vendedor: ranqueado, capacidade, filas) e a
// lista completa por data. Quick add em linguagem natural no topo; T foca nele.
export default function TarefasPage() {
  const [aba, setAba] = React.useState<"dia" | "lista">("dia");
  // Muda quando algo é criado/concluído/adiado: as duas abas recarregam.
  const [versao, setVersao] = React.useState(0);
  const campo = React.useRef<HTMLInputElement>(null);
  const mudou = React.useCallback(() => setVersao((v) => v + 1), []);

  useAtalhoT(() => campo.current?.focus());

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Tarefas" description="O que precisa de você hoje, na ordem certa." />
      <QuickAdd ref={campo} onCriada={mudou} />
      <Tabs value={aba} onValueChange={(v) => setAba(v as "dia" | "lista")}>
        <TabsList>
          <TabsTrigger value="dia">Meu dia</TabsTrigger>
          <TabsTrigger value="lista">Todas as tarefas</TabsTrigger>
        </TabsList>
        <TabsContent value="dia" className="pt-4">
          <MeuDia versao={versao} onMudou={mudou} />
        </TabsContent>
        <TabsContent value="lista" className="pt-4">
          <ListaDeTarefas versao={versao} onMudou={mudou} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
