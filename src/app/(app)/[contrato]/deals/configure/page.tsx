"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { ArrowLeft, LayoutTemplate } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { FunisEditor } from "@/components/crm/config/funis-editor";
import { CamposEditor } from "@/components/crm/config/campos-editor";
import { CartaoEditor } from "@/components/crm/config/cartao-editor";
import { ProdutosEditor } from "@/components/crm/config/produtos-editor";

const ABAS = ["pipelines", "card", "deal", "contact", "products"] as const;

// ?tab=card&pipeline=<número do funil (ou UUID antigo)> abre direto no cartão daquele funil (o botão
// "Personalizar" do quadro manda assim).
export default function PersonalizarCrmPage({
  searchParams,
}: {
  searchParams: Promise<{ [chave: string]: string | string[] | undefined }>;
}) {
  const params = React.use(searchParams);
  const aba = typeof params.tab === "string" && (ABAS as readonly string[]).includes(params.tab) ? params.tab : "pipelines";
  const funil = typeof params.pipeline === "string" ? params.pipeline : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-6 pt-1 lg:px-6">
      {/* Barra da tela: voltar, título e, à direita, o atalho para os modelos prontos. */}
      <div className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-2">
        <Link
          href="/deals"
          aria-label="Voltar aos negócios"
          title="Voltar aos negócios"
          className={buttonVariants({ variant: "ghost", size: "icon", className: "-ml-2" })}
        >
          <ArrowLeft aria-hidden="true" />
        </Link>
        <h1 className="text-heading font-semibold tracking-tight text-text-primary">Personalizar o CRM</h1>
        <div className="ml-auto">
          <Link href="/get-started" className={buttonVariants({ variant: "secondary" })}>
            <LayoutTemplate size={14} aria-hidden="true" /> Partir de um modelo pronto
          </Link>
        </div>
      </div>
      <p className="-mt-2 max-w-[640px] text-small text-text-secondary">
        Cada negócio funciona de um jeito. Monte os funis, as etapas, o cartão, os campos e os produtos do seu.
      </p>

      <Tabs defaultValue={aba} className="flex min-h-0 flex-col gap-5">
        {/* O trilho rola sozinho no celular; a página não ganha rolagem lateral. */}
        <div className="-mx-4 overflow-x-auto px-4 lg:-mx-6 lg:px-6">
          <TabsList>
            <TabsTrigger value="pipelines">Funis e etapas</TabsTrigger>
            <TabsTrigger value="card">Cartão do negócio</TabsTrigger>
            <TabsTrigger value="deal">Campos do negócio</TabsTrigger>
            <TabsTrigger value="contact">Campos do contato</TabsTrigger>
            <TabsTrigger value="products">Produtos</TabsTrigger>
          </TabsList>
        </div>
        <div className="entrada-de-tela">
          <TabsContent value="pipelines"><FunisEditor funilInicial={funil} criarAoAbrir={params.new === "1"} /></TabsContent>
          <TabsContent value="card"><CartaoEditor funilInicial={funil} /></TabsContent>
          <TabsContent value="deal"><CamposEditor entity="deal" /></TabsContent>
          <TabsContent value="contact"><CamposEditor entity="contact" /></TabsContent>
          <TabsContent value="products"><ProdutosEditor /></TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
