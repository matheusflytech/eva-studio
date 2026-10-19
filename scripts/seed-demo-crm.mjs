// Dados simulados para validar o CRM (quadro, ficha, dashboards e filtros):
// 3 funis, campos personalizados de todos os tipos, empresas, contatos com
// etiquetas e canais, negócios espalhados em 6 meses com histórico de etapas,
// tarefas e notas.
//
// Tudo que este script cria é marcado, e só isso é apagado com --remover:
//   - funis, empresas, contatos, negócios e etiquetas com nome "[DEMO] ..."
//   - campos personalizados com chave "demo_..."
// Nada existente é alterado. Simulação por padrão; grava numa transação.
//
//   node scripts/seed-demo-crm.mjs --org <orgId>              # só conta
//   node scripts/seed-demo-crm.mjs --org <orgId> --aplicar    # grava
//   node scripts/seed-demo-crm.mjs --org <orgId> --remover    # apaga o [DEMO]
import { config } from "dotenv";
import pg from "pg";
import { randomUUID } from "node:crypto";

config({ path: ".env.local" });

const arg = (nome) => {
  const i = process.argv.indexOf(nome);
  return i === -1 ? undefined : process.argv[i + 1];
};
const orgId = arg("--org");
const aplicar = process.argv.includes("--aplicar");
const remover = process.argv.includes("--remover");
if (!orgId) {
  console.error("Informe --org <orgId>.");
  process.exit(1);
}

const DEMO = "[DEMO] ";
const DIA = 86_400_000;
const AGORA = Date.now();

// Sorteio com semente fixa: rodar de novo gera os mesmos dados.
let semente = 20261020;
function rnd() {
  semente |= 0;
  semente = (semente + 0x6d2b79f5) | 0;
  let t = Math.imul(semente ^ (semente >>> 15), 1 | semente);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const sorteia = (lista) => lista[Math.floor(rnd() * lista.length)];
const entre = (min, max) => Math.round(min + rnd() * (max - min));
const chance = (p) => rnd() < p;
const diaISO = (ms) => new Date(ms).toISOString().slice(0, 10);

// ---------- o que vai ser criado ----------

const FUNIS = [
  {
    nome: "Vendas B2B",
    etapas: [
      ["Novo lead", "open", 10, "slate"],
      ["Qualificação", "open", 25, "blue"],
      ["Diagnóstico", "open", 40, "cyan"],
      ["Proposta", "open", 60, "violet"],
      ["Negociação", "open", 80, "amber"],
      ["Ganho", "won", 100, ""],
      ["Perdido", "lost", 0, ""],
    ],
    negocios: 70,
    ticket: [3_000, 60_000],
  },
  {
    nome: "Renovação",
    etapas: [
      ["A renovar", "open", 50, "slate"],
      ["Em contato", "open", 65, "blue"],
      ["Proposta enviada", "open", 80, "violet"],
      ["Renovado", "won", 100, ""],
      ["Cancelado", "lost", 0, ""],
    ],
    negocios: 35,
    ticket: [1_200, 18_000],
  },
  {
    nome: "Parcerias",
    etapas: [
      ["Prospecção", "open", 10, "slate"],
      ["Reunião", "open", 30, "cyan"],
      ["Piloto", "open", 60, "emerald"],
      ["Contrato", "won", 100, ""],
      ["Sem fit", "lost", 0, ""],
    ],
    negocios: 20,
    ticket: [8_000, 120_000],
  },
];

const opcoes = (...rotulos) =>
  rotulos.map((label) => ({
    label,
    value: label
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, ""),
  }));

// funil: null = vale em todos; nome = só naquele funil.
const CAMPOS_DE_NEGOCIO = [
  { key: "demo_segmento", label: "Segmento", type: "select", options: opcoes("Varejo", "Saúde", "Educação", "Indústria", "Serviços", "Tecnologia"), showOnCard: true },
  { key: "demo_origem", label: "Origem do lead", type: "select", options: opcoes("Site", "Indicação", "Instagram", "WhatsApp", "Evento", "Outbound") },
  { key: "demo_plano", label: "Plano", type: "select", options: opcoes("Starter", "Pro", "Enterprise") },
  { key: "demo_produtos", label: "Produtos de interesse", type: "multiselect", options: opcoes("Agente de IA", "Disparos", "CRM", "Integrações", "Suporte dedicado") },
  { key: "demo_usuarios", label: "Nº de usuários", type: "number", options: [] },
  { key: "demo_mrr", label: "Mensalidade (MRR)", type: "currency", options: [] },
  { key: "demo_inicio", label: "Início previsto", type: "date", options: [] },
  { key: "demo_decisor", label: "Falou com o decisor", type: "checkbox", options: [] },
  { key: "demo_concorrente", label: "Concorrente atual", type: "text", options: [] },
  { key: "demo_mes_renovacao", label: "Mês de renovação", type: "select", options: opcoes("Janeiro", "Abril", "Julho", "Outubro"), funil: "Renovação" },
  { key: "demo_tipo_parceria", label: "Tipo de parceria", type: "select", options: opcoes("Revenda", "Indicação", "Tecnologia"), funil: "Parcerias" },
];
const CAMPOS_DE_CONTATO = [
  { key: "demo_cargo", label: "Cargo", type: "select", options: opcoes("Dono", "Diretor", "Gerente", "Analista") },
  { key: "demo_cidade", label: "Cidade", type: "text", options: [] },
];

const ETIQUETAS = [
  ["Quente", "rose"],
  ["Morno", "amber"],
  ["Frio", "blue"],
  ["Cliente", "emerald"],
];

const PREFIXOS = ["Grupo", "Rede", "Clínica", "Colégio", "Loja", "Indústrias", "Studio", "Mercado", "Instituto", "Agência"];
const NUCLEOS = ["Aurora", "Horizonte", "Bela Vista", "Atlântico", "Ipê", "Cerrado", "Litoral", "Serra Azul", "Primavera", "Monte Verde", "Rio Claro", "Boa Safra", "Estrela", "Pampa", "Jacarandá"];
const NOMES = ["Ana", "Bruno", "Carla", "Diego", "Elisa", "Felipe", "Gabriela", "Henrique", "Isabela", "João", "Larissa", "Marcelo", "Natália", "Otávio", "Paula", "Rafael", "Sabrina", "Tiago", "Vanessa", "William"];
const SOBRENOMES = ["Almeida", "Barros", "Costa", "Duarte", "Esteves", "Ferraz", "Gomes", "Lima", "Moura", "Nogueira", "Pires", "Rocha", "Santos", "Teixeira", "Vieira"];
const CIDADES = [["São Paulo", "SP"], ["Campinas", "SP"], ["Curitiba", "PR"], ["Florianópolis", "SC"], ["Belo Horizonte", "MG"], ["Rio de Janeiro", "RJ"], ["Porto Alegre", "RS"], ["Recife", "PE"], ["Goiânia", "GO"]];
const MOTIVOS = ["Preço", "Escolheu concorrente", "Sem orçamento", "Sem resposta", "Timing", "Não era o perfil"];
const CONCORRENTES = ["Nenhum", "Planilha", "RD Station", "HubSpot", "Pipedrive", "Sistema próprio"];
const CANAIS = ["whatsapp_meta", "instagram", "website"];

// ---------- execução ----------

const client = new pg.Client({ connectionString: process.env.DIRECT_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
const q = (sql, p) => client.query(sql, p);

try {
  const org = (await q(`select id, name from eva_studio_organizations where id = $1`, [orgId])).rows[0];
  if (!org) throw new Error("Organização não encontrada.");
  const pessoas = (await q(`select id, name from eva_studio_profiles where "orgId" = $1`, [orgId])).rows;
  // Canais só no agente de teste: assim nenhum disparo de agente real alcança
  // estes contatos fictícios. Sem ele na org, os contatos ficam sem canal.
  const AGENTE_DE_TESTE = "07a3b48f-3bdc-49a5-8c89-692d80d87afc";
  const agente = (await q(`select id, name from eva_studio_agents where "orgId" = $1 and id = $2`, [orgId, AGENTE_DE_TESTE])).rows[0];
  const existentes = (await q(`select count(*)::int n from eva_studio_deals where "orgId" = $1 and name like $2`, [orgId, `${DEMO}%`])).rows[0].n;
  console.log({ org: org.name, pessoas: pessoas.length, agenteParaCanais: agente?.name ?? null, negociosDemoJaExistentes: existentes, modo: remover ? "REMOVER" : aplicar ? "APLICAR" : "simulação" });

  await q("BEGIN");

  if (remover) {
    const r = {};
    // Negócio antes do funil: Deal.stage é Restrict.
    r.negocios = (await q(`delete from eva_studio_deals where "orgId" = $1 and (name like $2 or "pipelineId" in (select id from eva_studio_pipelines where "orgId" = $1 and name like $2))`, [orgId, `${DEMO}%`])).rowCount;
    r.funis = (await q(`delete from eva_studio_pipelines where "orgId" = $1 and name like $2`, [orgId, `${DEMO}%`])).rowCount;
    r.contatos = (await q(`delete from eva_studio_contacts where "orgId" = $1 and name like $2`, [orgId, `${DEMO}%`])).rowCount;
    r.empresas = (await q(`delete from eva_studio_companies where "orgId" = $1 and name like $2`, [orgId, `${DEMO}%`])).rowCount;
    r.etiquetas = (await q(`delete from eva_studio_tags where "orgId" = $1 and name like $2`, [orgId, `${DEMO}%`])).rowCount;
    r.campos = (await q(`delete from eva_studio_custom_fields where "orgId" = $1 and key like 'demo\\_%'`, [orgId])).rowCount;
    console.log("removido:", r);
    await q("COMMIT");
    process.exit(0);
  }

  if (existentes > 0) throw new Error("Já existem dados [DEMO] nesta organização. Rode --remover antes.");

  const contagem = { funis: 0, etapas: 0, campos: 0, etiquetas: 0, empresas: 0, contatos: 0, negocios: 0, eventos: 0, tarefas: 0, notas: 0 };

  // Funis e etapas, depois dos funis que já existem.
  const pos = (await q(`select coalesce(max(position), -1)::int p from eva_studio_pipelines where "orgId" = $1`, [orgId])).rows[0].p;
  const funis = [];
  for (const [i, f] of FUNIS.entries()) {
    const id = randomUUID();
    await q(`insert into eva_studio_pipelines (id, "orgId", name, "isDefault", position) values ($1, $2, $3, false, $4)`, [id, orgId, DEMO + f.nome, pos + 1 + i]);
    const etapas = [];
    for (const [j, [nome, tipo, prob, cor]] of f.etapas.entries()) {
      const sid = randomUUID();
      await q(`insert into eva_studio_pipeline_stages (id, "pipelineId", name, position, probability, type, color) values ($1, $2, $3, $4, $5, $6, $7)`, [sid, id, nome, j, prob, tipo, cor]);
      etapas.push({ id: sid, nome, tipo, prob });
      contagem.etapas++;
    }
    funis.push({ ...f, id, etapas });
    contagem.funis++;
  }

  // Campos personalizados, depois dos que já existem.
  const posCampo = (await q(`select coalesce(max(position), -1)::int p from eva_studio_custom_fields where "orgId" = $1`, [orgId])).rows[0].p;
  let k = posCampo + 1;
  for (const [entidade, lista] of [["deal", CAMPOS_DE_NEGOCIO], ["contact", CAMPOS_DE_CONTATO]]) {
    for (const c of lista) {
      const pipelineId = c.funil ? funis.find((f) => f.nome === c.funil).id : null;
      await q(
        `insert into eva_studio_custom_fields (id, "orgId", entity, "pipelineId", key, label, type, options, required, "helpText", "showOnCard", position, "updatedAt")
         values ($1, $2, $3, $4, $5, $6, $7, $8, false, 'Campo de demonstração', $9, $10, now())`,
        [randomUUID(), orgId, entidade, pipelineId, c.key, c.label, c.type, JSON.stringify(c.options), !!c.showOnCard, k++]
      );
      contagem.campos++;
    }
  }
  const valorDe = (key) => sorteia(CAMPOS_DE_NEGOCIO.concat(CAMPOS_DE_CONTATO).find((c) => c.key === key).options).value;

  // Etiquetas.
  const etiquetas = [];
  for (const [nome, cor] of ETIQUETAS) {
    const id = randomUUID();
    await q(`insert into eva_studio_tags (id, name, color, "orgId") values ($1, $2, $3, $4)`, [id, DEMO + nome, cor, orgId]);
    etiquetas.push(id);
    contagem.etiquetas++;
  }

  // Empresas.
  const empresas = [];
  const nomesUsados = new Set();
  while (empresas.length < 28) {
    const nome = `${sorteia(PREFIXOS)} ${sorteia(NUCLEOS)}`;
    if (nomesUsados.has(nome)) continue;
    nomesUsados.add(nome);
    const [cidade, uf] = sorteia(CIDADES);
    const id = randomUUID();
    const criado = AGORA - entre(120, 220) * DIA;
    await q(
      `insert into eva_studio_companies (id, "orgId", name, sector, size, website, city, uf, "ownerId", "createdAt", "updatedAt")
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)`,
      [id, orgId, DEMO + nome, sorteia(["Varejo", "Saúde", "Educação", "Indústria", "Serviços", "Tecnologia"]), sorteia([5, 20, 80, 250, 1000]), `https://exemplo-${empresas.length + 1}.example.com`, cidade, uf, pessoas.length ? sorteia(pessoas).id : null, new Date(criado)]
    );
    empresas.push({ id, nome, cidade });
    contagem.empresas++;
  }

  // Contatos: 1 a 3 por empresa e alguns avulsos. Telefones em faixa fictícia.
  const contatos = [];
  let seq = 1;
  for (const e of empresas.concat(Array(10).fill(null))) {
    const n = e ? entre(1, 3) : 1;
    for (let i = 0; i < n; i++) {
      const nome = `${sorteia(NOMES)} ${sorteia(SOBRENOMES)}`;
      const id = randomUUID();
      const tel = `55119${String(90000000 + seq).padStart(8, "0")}`;
      const email = `demo${seq}@example.com`;
      seq++;
      const criado = AGORA - entre(30, 200) * DIA;
      await q(
        `insert into eva_studio_contacts (id, "orgId", name, email, phone, "customFields", source, "companyId", "ownerId", "jobTitle", "createdAt", "updatedAt")
         values ($1, $2, $3, $4, $5, $6, 'demo', $7, $8, $9, $10, $10)`,
        [id, orgId, DEMO + nome, email, tel, JSON.stringify({ demo_cargo: valorDe("demo_cargo"), demo_cidade: e?.cidade ?? sorteia(CIDADES)[0] }), e?.id ?? null, pessoas.length ? sorteia(pessoas).id : null, sorteia(["Sócio", "Diretor comercial", "Gerente", "Coordenador"]), new Date(criado)]
      );
      for (const t of etiquetas) if (chance(0.3)) await q(`insert into eva_studio_contact_tags ("contactId", "tagId") values ($1, $2) on conflict do nothing`, [id, t]);
      if (agente && chance(0.7)) {
        const canal = sorteia(CANAIS);
        const externalId = canal === "whatsapp_meta" ? tel : `demo-${canal}-${seq}`;
        await q(`insert into eva_studio_contact_channels (id, "contactId", "agentId", channel, "externalId") values ($1, $2, $3, $4, $5) on conflict do nothing`, [randomUUID(), id, agente.id, canal, externalId]);
      }
      contatos.push({ id, empresa: e });
      contagem.contatos++;
    }
  }

  // Negócios com caminho pelas etapas. Resultado sorteado: ganho, perdido ou
  // ainda aberto em alguma etapa; datas sempre no passado.
  for (const f of funis) {
    const abertas = f.etapas.filter((s) => s.tipo === "open");
    const ganho = f.etapas.find((s) => s.tipo === "won");
    const perdido = f.etapas.find((s) => s.tipo === "lost");
    for (let n = 0; n < f.negocios; n++) {
      const contato = sorteia(contatos);
      const empresa = contato.empresa ?? (chance(0.3) ? sorteia(empresas) : null);
      const criado = AGORA - entre(2, 180) * DIA - entre(0, 10) * 3_600_000;
      const sorte = rnd();
      const desfecho = criado < AGORA - 20 * DIA ? (sorte < 0.32 ? "ganho" : sorte < 0.6 ? "perdido" : "aberto") : "aberto";
      const ate = desfecho === "aberto" ? entre(0, abertas.length - 1) : desfecho === "ganho" ? abertas.length - 1 : entre(0, abertas.length - 1);
      const caminho = abertas.slice(0, ate + 1);
      if (desfecho === "ganho") caminho.push(ganho);
      if (desfecho === "perdido") caminho.push(perdido);

      // Tempo entre etapas: espalha até hoje, alguns parados há bastante tempo.
      const eventos = [];
      let t = criado;
      for (const [i, etapa] of caminho.entries()) {
        if (i > 0) t = Math.min(AGORA - entre(0, 2) * DIA, t + entre(1, 18) * DIA + entre(0, 20) * 3_600_000);
        eventos.push({ etapa, em: t, de: i > 0 ? caminho[i - 1] : null });
      }
      const final = eventos[eventos.length - 1];
      const fechado = desfecho !== "aberto" ? final.em : null;
      const valor = Math.round(entre(f.ticket[0], f.ticket[1]) / 100) * 100;
      const prob = final.etapa.prob;
      const previsao = desfecho === "aberto" ? AGORA + entre(-10, 60) * DIA : null;
      const cf = {
        demo_segmento: valorDe("demo_segmento"),
        demo_origem: valorDe("demo_origem"),
        demo_plano: valorDe("demo_plano"),
        demo_produtos: [...new Set([valorDe("demo_produtos"), ...(chance(0.5) ? [valorDe("demo_produtos")] : [])])],
        demo_usuarios: entre(2, 150),
        demo_mrr: Math.round(valor / entre(10, 14)) * 100,
        demo_inicio: diaISO((previsao ?? fechado ?? AGORA) + entre(5, 40) * DIA),
        demo_decisor: chance(0.55),
        demo_concorrente: sorteia(CONCORRENTES),
      };
      if (f.nome === "Renovação") cf.demo_mes_renovacao = valorDe("demo_mes_renovacao");
      if (f.nome === "Parcerias") cf.demo_tipo_parceria = valorDe("demo_tipo_parceria");
      if (chance(0.15)) delete cf.demo_usuarios; // alguns sem preencher, para testar "vazio"

      const id = randomUUID();
      const titulo = empresa ? `${empresa.nome} · ${sorteia(["Implantação", "Plano anual", "Expansão", "Piloto", "Renovação", "Upgrade"])}` : `Negócio ${n + 1} · ${f.nome}`;
      await q(
        `insert into eva_studio_deals (id, "orgId", "pipelineId", "stageId", "companyId", "ownerId", name, description, "amountCents", currency, probability, "lostReason", "expectedClosingAt", "closedAt", position, "createdAt", "updatedAt", "stageSince", "customFields")
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'BRL', $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
        [
          id, orgId, f.id, final.etapa.id, empresa?.id ?? null, pessoas.length && chance(0.85) ? sorteia(pessoas).id : null,
          DEMO + titulo, "Negócio de demonstração.", valor * 100, prob,
          desfecho === "perdido" ? sorteia(MOTIVOS) : "",
          previsao ? new Date(Math.floor(previsao / DIA) * DIA + 12 * 3_600_000) : null,
          fechado ? new Date(fechado) : null, n, new Date(criado), new Date(final.em), new Date(final.em), JSON.stringify(cf),
        ]
      );
      await q(`insert into eva_studio_deal_contacts ("dealId", "contactId", role) values ($1, $2, '') on conflict do nothing`, [id, contato.id]);
      for (const ev of eventos) {
        await q(
          `insert into eva_studio_deal_stage_events (id, "orgId", "dealId", "pipelineId", "fromStageId", "toStageId", origem, at) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [randomUUID(), orgId, id, f.id, ev.de?.id ?? null, ev.etapa.id, chance(0.2) ? "fluxo" : "usuario", new Date(ev.em)]
        );
        contagem.eventos++;
      }
      // Tarefas: abertas (algumas atrasadas) nos negócios em andamento.
      if (desfecho === "aberto" && chance(0.7)) {
        const prazo = AGORA + entre(-6, 10) * DIA + entre(8, 17) * 3_600_000;
        await q(
          `insert into eva_studio_tasks (id, "orgId", "contactId", "dealId", "assignedToId", type, text, "dueAt", "createdAt", "updatedAt") values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)`,
          [randomUUID(), orgId, contato.id, id, pessoas.length ? sorteia(pessoas).id : null, sorteia(["ligar", "email", "reuniao", "outro"]), sorteia(["Retornar sobre a proposta", "Enviar material", "Agendar demonstração", "Confirmar decisor", "Follow-up"]), new Date(prazo), new Date(final.em)]
        );
        contagem.tarefas++;
      }
      if (chance(0.5)) {
        await q(
          `insert into eva_studio_notes (id, "orgId", "contactId", "dealId", "authorId", text, "createdAt") values ($1, $2, $3, $4, $5, $6, $7)`,
          [randomUUID(), orgId, contato.id, id, pessoas.length ? sorteia(pessoas).id : null, sorteia(["Cliente pediu desconto à vista.", "Gostou da demonstração, vai levar para a diretoria.", "Usa planilha hoje e quer centralizar.", "Precisa de integração com o ERP."]), new Date(eventos[Math.min(1, eventos.length - 1)].em)]
        );
        contagem.notas++;
      }
      contagem.negocios++;
    }
  }

  console.log(aplicar ? "gravado:" : "simulado (nada gravado):", contagem);
  await q(aplicar ? "COMMIT" : "ROLLBACK");
} catch (e) {
  await q("ROLLBACK").catch(() => {});
  console.error("ROLLBACK:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
