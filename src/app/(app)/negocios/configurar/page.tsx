"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { FunisEditor } from "@/components/crm/config/funis-editor";
import { CamposEditor } from "@/components/crm/config/campos-editor";

export default function PersonalizarCrmPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <Link href="/negocios" className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-text-tertiary hover:text-text-primary">
          <ArrowLeft size={14} /> Voltar aos negócios
        </Link>
        <h1 className="font-display text-2xl font-semibold text-text-primary">Personalizar o CRM</h1>
        <p className="mt-1 max-w-[640px] text-[15px] text-text-secondary">
          Cada negócio funciona de um jeito. Monte os funis, as etapas e os campos do seu.
        </p>
        <Link href="/comecar" className="mt-2 inline-flex items-center gap-1.5 text-[13px] text-accent-400 hover:underline">
          Prefere partir de um modelo pronto para o seu tipo de negócio?
        </Link>
      </header>

      <Tabs defaultValue="funis">
        <TabsList className="max-w-full overflow-x-auto">
          <TabsTrigger value="funis">Funis e etapas</TabsTrigger>
          <TabsTrigger value="deal">Campos do negócio</TabsTrigger>
          <TabsTrigger value="contact">Campos do contato</TabsTrigger>
        </TabsList>
        <div className="mt-6">
          <TabsContent value="funis"><FunisEditor /></TabsContent>
          <TabsContent value="deal"><CamposEditor entity="deal" /></TabsContent>
          <TabsContent value="contact"><CamposEditor entity="contact" /></TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
