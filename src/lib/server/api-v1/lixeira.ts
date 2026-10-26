import "server-only";
import { NextResponse } from "next/server";
import type { EntidadeDaLixeira } from "@/lib/lixeira";
import { apagarComLixeira, lerItemPeloRegistro, lixeiraDisponivel, restaurarDaLixeira } from "@/lib/server/lixeira";
import { ErroApi, iso } from "./http";

// DELETE e POST .../restore da API v1 para contatos, empresas e negócios.
//
// DELETE manda para a lixeira (30 dias) e deixa a lápide em /<entidade>/deleted,
// como antes. Sem a lixeira ativada no banco, apaga de vez (o comportamento
// antigo) e avisa em `warning`: integração não pode quebrar por causa disso.

const NOMES: Record<EntidadeDaLixeira, string> = { deal: "Negócio", contact: "Contato", company: "Empresa" };

export async function apagarPelaApi(orgId: string, entidade: EntidadeDaLixeira, id: string, nomeDaChave: string) {
  const r = await apagarComLixeira({ orgId, entidade, id, quem: { id: null, nome: nomeDaChave }, seIndisponivel: "apagar" });
  return NextResponse.json({
    data: {
      id,
      deleted: true,
      trash: r.lixeira ? { expires_at: iso(r.expiresAt) } : null,
      ...(r.aviso ? { warning: r.aviso } : {}),
    },
  });
}

/** Restaura a última foto do registro na lixeira (mesmo id). */
export async function restaurarPelaApi(orgId: string, entidade: EntidadeDaLixeira, id: string) {
  // Sem a lixeira no banco não é "não está na lixeira": é 409 trash_unavailable, como na tela.
  if (!(await lixeiraDisponivel())) {
    throw new ErroApi(409, "trash_unavailable", "A lixeira ainda não está ativada neste contrato.");
  }
  const item = await lerItemPeloRegistro(orgId, entidade, id);
  if (!item) throw new ErroApi(404, "not_found", `${NOMES[entidade]} não está na lixeira.`);
  const r = await restaurarDaLixeira(orgId, item.id);
  return NextResponse.json({ data: { id: r.entityId, restored: true, warnings: r.avisos } });
}
