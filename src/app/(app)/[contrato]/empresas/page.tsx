"use client";

import { ListaDeEmpresas } from "@/components/crm/empresas/lista-de-empresas";

// Empresas: a lista (busca + Filtros), criar empresa, e cada linha abre a
// página da empresa (/empresas/<id>).
export default function EmpresasPage() {
  return <ListaDeEmpresas />;
}
