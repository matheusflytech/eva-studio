"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, Download, LayoutDashboard, Loader2 } from "lucide-react";
import Link from "@/components/contrato/link";
import { ReportView } from "@/components/reports/report-view";
import { MarcaEva } from "@/components/layout/marca-eva";
import { csvDoResultado } from "@/lib/chat/csv";
import { tipoDoCartao, type ReportQuery, type ReportResult, type VizType } from "@/lib/report-query";
import { cn } from "@/lib/utils";

// Cartão de relatório dentro do chat: o mesmo desenho dos cartões do painel
// (ReportView), num cartão de vidro da Eva, com dois atalhos: baixar em CSV e
// levar para o Dashboard. Carregado só quando a Eva mostra um cartão (o
// gráfico pesa e não precisa ir junto com todas as telas).

export interface CartaoMostrado {
  query: ReportQuery;
  viz: VizType;
  titulo: string;
  result: ReportResult;
}

type Estado = "parado" | "salvando" | "feito" | "sem_permissao" | "erro";

const ALTURA: Partial<Record<VizType, string>> = { number: "h-24", progress: "h-24", gauge: "h-44" };

export default function CartaoDoChat({ cartao, atraso = 0 }: { cartao: CartaoMostrado; atraso?: number }) {
  const reduz = useReducedMotion();
  const [estado, setEstado] = React.useState<Estado>("parado");

  function baixar() {
    const url = URL.createObjectURL(new Blob([csvDoResultado(cartao.result)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${cartao.titulo.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").toLowerCase() || "relatorio"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // O painel é um só por contrato: lê a lista, acrescenta o cartão e grava de volta.
  async function levarParaODashboard() {
    setEstado("salvando");
    try {
      const atual = await fetch("/api/dashboard/layout");
      const dados = await atual.json().catch(() => null);
      if (!atual.ok || !Array.isArray(dados?.widgets)) throw new Error("leitura");
      const novo = {
        id: crypto.randomUUID(),
        tipo: tipoDoCartao(cartao.viz),
        fonte: "report",
        titulo: cartao.titulo,
        largura: 2,
        relatorio: { query: cartao.query, viz: cartao.viz },
      };
      const res = await fetch("/api/dashboard/layout", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ widgets: [...dados.widgets, novo] }),
      });
      setEstado(res.ok ? "feito" : res.status === 403 ? "sem_permissao" : "erro");
    } catch {
      setEstado("erro");
    }
  }

  const botao =
    "inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-raised/70 px-3 py-1.5 text-caption text-text-secondary transition-colors hover:bg-hover hover:text-text-primary focus-visible:outline-2 focus-visible:outline-focus disabled:pointer-events-none disabled:opacity-60";

  return (
    <motion.figure
      initial={reduz ? false : { opacity: 0, y: 14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: atraso, type: "spring", bounce: 0.18, visualDuration: 0.5 }}
      style={{ originX: 0, originY: 0 }}
      className="relative m-0 w-full overflow-hidden rounded-[20px] border border-border-subtle bg-raised/60 p-3.5 backdrop-blur-md"
    >
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#8ab4ff]/70 to-transparent" />
      <span aria-hidden="true" className="pointer-events-none absolute -right-12 -top-12 size-36 rounded-full bg-[radial-gradient(closest-side,rgba(195,145,255,0.22),transparent)]" />
      <figcaption className="relative mb-2.5 flex items-center gap-2">
        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#6eaaff]/25 to-[#c391ff]/25">
          <MarcaEva size={11} />
        </span>
        <span className="min-w-0 truncate font-display text-small font-semibold text-text-primary">{cartao.titulo}</span>
      </figcaption>

      <div className={cn("relative min-h-0 overflow-auto", ALTURA[cartao.viz] ?? "h-60")}>
        <ReportView result={cartao.result} viz={cartao.viz} loading={false} error={null} className="h-full" />
      </div>
      {cartao.result.truncated && <p className="mt-1.5 text-caption text-text-tertiary">Mostrando só parte das linhas.</p>}

      <div className="relative mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={baixar} className={botao}>
          <Download size={13} aria-hidden /> Baixar CSV
        </button>
        {estado === "feito" ? (
          <Link href="/dashboard" className={cn(botao, "border-[#4ade80]/40 text-text-primary")}>
            <Check size={13} aria-hidden className="text-[#4ade80]" /> Adicionado · ver no Dashboard
          </Link>
        ) : (
          <button type="button" onClick={levarParaODashboard} disabled={estado === "salvando"} className={botao}>
            {estado === "salvando" ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <LayoutDashboard size={13} aria-hidden />}
            Adicionar ao Dashboard
          </button>
        )}
        {estado === "sem_permissao" && <span role="alert" className="text-caption text-danger">Só quem edita o painel pode adicionar.</span>}
        {estado === "erro" && <span role="alert" className="text-caption text-danger">Não deu certo. Tenta de novo.</span>}
      </div>
    </motion.figure>
  );
}
