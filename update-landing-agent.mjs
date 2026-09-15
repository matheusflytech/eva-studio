import pg from "pg";
import fs from "node:fs";
import crypto from "node:crypto";

const env = fs.readFileSync(".env.local", "utf8");
const dbUrl = env.match(/^DATABASE_URL="?(.+?)"?$/m)?.[1];
const pool = new pg.Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

const agentId = "9b9c6392-6cc0-4093-847a-9589b525e51d"; // Landing Interativa

const ids = {
  start: crypto.randomUUID(),
  intro: crypto.randomUUID(),
  capNome: crypto.randomUUID(),
  capNicho: crypto.randomUUID(),
  capDor: crypto.randomUUID(),
  capTelefone: crypto.randomUUID(),
  capEmail: crypto.randomUUID(),
  msgFinal: crypto.randomUUID(),
  end: crypto.randomUUID(),
};

const nodes = [
  { id: ids.start, type: "flowNode", position: { x: 240, y: 0 }, data: { iconKey: "start", label: "Início", kind: "Ponto de entrada", hasTarget: false } },
  {
    id: ids.intro,
    type: "flowNode",
    position: { x: 240, y: 150 },
    data: { iconKey: "message", label: "Boas-vindas", kind: "Mensagem", detail: "Só 5 perguntas rápidas:" },
  },
  {
    id: ids.capNome,
    type: "flowNode",
    position: { x: 240, y: 300 },
    data: { iconKey: "capture", label: "Coleta de nome", kind: "Captura de input", detail: "Qual seu nome?", variableName: "nome" },
  },
  {
    id: ids.capNicho,
    type: "flowNode",
    position: { x: 240, y: 450 },
    data: { iconKey: "capture", label: "Coleta de nicho", kind: "Captura de input", detail: "Qual o nicho do seu negócio?", variableName: "nicho" },
  },
  {
    id: ids.capDor,
    type: "flowNode",
    position: { x: 240, y: 600 },
    data: { iconKey: "capture", label: "Coleta de dor", kind: "Captura de input", detail: "E hoje, qual sua maior dor no atendimento ou nas vendas?", variableName: "dor" },
  },
  {
    id: ids.capTelefone,
    type: "flowNode",
    position: { x: 240, y: 750 },
    data: { iconKey: "capture", label: "Coleta de WhatsApp", kind: "Captura de input", detail: "Seu WhatsApp com DDD, pra gente te chamar direto?", variableName: "telefone" },
  },
  {
    id: ids.capEmail,
    type: "flowNode",
    position: { x: 240, y: 900 },
    data: { iconKey: "capture", label: "Coleta de e-mail", kind: "Captura de input", detail: "E seu e-mail?", variableName: "email" },
  },
  {
    id: ids.msgFinal,
    type: "flowNode",
    position: { x: 240, y: 1050 },
    data: {
      iconKey: "message",
      label: "Confirmação",
      kind: "Mensagem",
      detail: "Perfeito, {nome}! Obrigado pelas respostas.",
    },
  },
  {
    id: ids.end,
    type: "flowNode",
    position: { x: 240, y: 1200 },
    data: { iconKey: "end", label: "Encerramento", kind: "Fim da conversa", detail: "Nosso time entra em contato em breve.", hasSource: false },
  },
];

const edges = [
  { id: "e1", source: ids.start, target: ids.intro },
  { id: "e2", source: ids.intro, target: ids.capNome },
  { id: "e3", source: ids.capNome, target: ids.capNicho },
  { id: "e4", source: ids.capNicho, target: ids.capDor },
  { id: "e5", source: ids.capDor, target: ids.capTelefone },
  { id: "e6", source: ids.capTelefone, target: ids.capEmail },
  { id: "e7", source: ids.capEmail, target: ids.msgFinal },
  { id: "e8", source: ids.msgFinal, target: ids.end },
];

await pool.query(
  `update eva_studio_agent_flows set nodes = $2, edges = $3, "updatedAt" = now() where "agentId" = $1`,
  [agentId, JSON.stringify(nodes), JSON.stringify(edges)]
);

console.log(JSON.stringify({ agentId, updated: true }));
await pool.end();
