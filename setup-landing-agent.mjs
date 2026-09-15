import pg from "pg";
import fs from "node:fs";
import crypto from "node:crypto";

const env = fs.readFileSync(".env.local", "utf8");
const dbUrl = env.match(/^DATABASE_URL="?(.+?)"?$/m)?.[1];
const pool = new pg.Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

const orgId = "0279508a-32f4-4468-969e-65b2a8201d30"; // mesma org do Vendedor Virtual
const agentId = crypto.randomUUID();

await pool.query(
  `insert into eva_studio_agents
     (id, "orgId", name, description, tone, language, "primaryChannel", instructions, guidelines, skills, tools, "outboundUrl", status, "widgetEnabled", "createdAt", "updatedAt")
   values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,now(),now())`,
  [
    agentId,
    orgId,
    "Landing Interativa",
    "Demo de hero interativo do site — mostra o fluxo sendo montado ao vivo.",
    "Consultivo e direto",
    "Português",
    "Site",
    "",
    "",
    JSON.stringify([]),
    JSON.stringify([]),
    "",
    "active",
    true,
  ]
);

const ids = {
  start: crypto.randomUUID(),
  intro: crypto.randomUUID(),
  capNegocio: crypto.randomUUID(),
  capGargalo: crypto.randomUUID(),
  capCanal: crypto.randomUUID(),
  optWhatsapp: crypto.randomUUID(),
  optInstagram: crypto.randomUUID(),
  optSite: crypto.randomUUID(),
  msgRecomendacao: crypto.randomUUID(),
  end: crypto.randomUUID(),
};

const nodes = [
  { id: ids.start, type: "flowNode", position: { x: 240, y: 0 }, data: { iconKey: "start", label: "Início", kind: "Ponto de entrada", hasTarget: false } },
  {
    id: ids.intro,
    type: "flowNode",
    position: { x: 240, y: 150 },
    data: { iconKey: "message", label: "Boas-vindas", kind: "Mensagem", detail: "Show! Vou te mostrar como ficaria uma automação pra você — 3 perguntas rápidas e já te dou uma recomendação real." },
  },
  {
    id: ids.capNegocio,
    type: "flowNode",
    position: { x: 240, y: 300 },
    data: { iconKey: "capture", label: "Coleta de negócio", kind: "Captura de input", detail: "Qual o seu negócio ou área de atuação?", variableName: "negocio" },
  },
  {
    id: ids.capGargalo,
    type: "flowNode",
    position: { x: 240, y: 450 },
    data: { iconKey: "capture", label: "Coleta de gargalo", kind: "Captura de input", detail: "E qual sua maior dor hoje no atendimento ou nas vendas?", variableName: "gargalo" },
  },
  {
    id: ids.capCanal,
    type: "flowNode",
    position: { x: 240, y: 600 },
    data: {
      iconKey: "capture",
      label: "Coleta de canal",
      kind: "Captura de input",
      detail: "Onde seus clientes mais te procuram hoje?",
      variableName: "canal",
      options: [
        { id: ids.optWhatsapp, label: "WhatsApp" },
        { id: ids.optInstagram, label: "Instagram" },
        { id: ids.optSite, label: "Site / E-mail" },
      ],
    },
  },
  {
    id: ids.msgRecomendacao,
    type: "flowNode",
    position: { x: 240, y: 750 },
    data: {
      iconKey: "message",
      label: "Recomendação",
      kind: "Mensagem",
      detail: "Perfeito! Baseado no que você me contou — {negocio}, o gargalo em \"{gargalo}\", atendendo por {canal} — a automação ideal seria um agente de IA cuidando do primeiro contato nesse canal, já qualificando e coletando os dados antes de passar pro seu time. É exatamente esse tipo de fluxo que você acabou de ver sendo montado aqui do lado. 🚀",
    },
  },
  {
    id: ids.end,
    type: "flowNode",
    position: { x: 240, y: 900 },
    data: { iconKey: "end", label: "Encerramento", kind: "Fim da conversa", detail: "Quer ver isso rodando de verdade no seu negócio? Fale com nosso time.", hasSource: false },
  },
];

const edges = [
  { id: "e1", source: ids.start, target: ids.intro },
  { id: "e2", source: ids.intro, target: ids.capNegocio },
  { id: "e3", source: ids.capNegocio, target: ids.capGargalo },
  { id: "e4", source: ids.capGargalo, target: ids.capCanal },
  { id: "e5", source: ids.capCanal, target: ids.msgRecomendacao, sourceHandle: ids.optWhatsapp },
  { id: "e6", source: ids.capCanal, target: ids.msgRecomendacao, sourceHandle: ids.optInstagram },
  { id: "e7", source: ids.capCanal, target: ids.msgRecomendacao, sourceHandle: ids.optSite },
  { id: "e8", source: ids.msgRecomendacao, target: ids.end },
];

await pool.query(
  `insert into eva_studio_agent_flows ("agentId", nodes, edges, "updatedAt") values ($1,$2,$3,now())`,
  [agentId, JSON.stringify(nodes), JSON.stringify(edges)]
);

console.log(JSON.stringify({ agentId }));
await pool.end();
