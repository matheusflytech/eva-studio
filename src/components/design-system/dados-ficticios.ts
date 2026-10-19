/**
 * Dados FICTÍCIOS para a página /design-system. Nada aqui vem do banco.
 * Gerados de forma determinística a partir do índice, então qualquer página
 * da paginação de 24.752 contatos mostra sempre as mesmas 25 linhas.
 */

const NOMES = ["Ana", "Bruno", "Carla", "Diego", "Elisa", "Fábio", "Gabriela", "Henrique", "Isabela", "João", "Larissa", "Marcos", "Natália", "Otávio", "Paula", "Rafael", "Sabrina", "Tiago", "Vanessa", "William"];
const SOBRENOMES = ["Almeida", "Barbosa", "Cardoso", "Dias", "Esteves", "Ferreira", "Gomes", "Lima", "Martins", "Nunes", "Oliveira", "Pereira", "Queiroz", "Ribeiro", "Souza", "Teixeira"];
const EMPRESAS = ["Acme Logística", "Borba Alimentos", "Clínica Vida", "Delta Engenharia", "Estúdio Norte", "Fazenda Boa Vista", "Grupo Ômega", "Horizonte Seguros", "Instituto Lumen", "Jardim Imóveis"];
export const DONOS = ["Ana Souza", "Bruno Lima", "Carla Dias", "Diego Nunes", "Elisa Gomes"];
export const ETAPAS_CONTATO = ["Lead", "Qualificado", "Oportunidade", "Cliente", "Inativo"] as const;
const ORIGENS = ["WhatsApp", "Site", "Indicação", "Instagram", "Evento"];

export type EtapaContato = (typeof ETAPAS_CONTATO)[number];

export interface ContatoFicticio {
  id: string;
  nome: string;
  email: string;
  telefone: string;
  empresa: string;
  dono: string;
  etapa: EtapaContato;
  origem: string;
  negocios: number;
  valor: number;
  ultimaAtividade: string;
}

// Gerador pseudo-aleatório simples (mulberry32): mesmo índice, mesmo contato.
function aleatorio(semente: number) {
  let t = (semente + 0x6d2b79f5) | 0;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const escolher = <T,>(lista: readonly T[], r: () => number) => lista[Math.floor(r() * lista.length)];

const dataCurta = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

export function contatoFicticio(indice: number): ContatoFicticio {
  const r = aleatorio(indice * 7919);
  const nome = `${escolher(NOMES, r)} ${escolher(SOBRENOMES, r)}`;
  const slug = nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(" ", ".");
  const empresa = escolher(EMPRESAS, r);
  const negocios = Math.floor(r() * 4);
  // Data fixa de referência (não usa "hoje": a página não muda a cada visita).
  const dias = Math.floor(r() * 120);
  const data = new Date(Date.UTC(2026, 9, 18) - dias * 86_400_000);
  return {
    id: `c-${indice}`,
    nome,
    email: `${slug}@exemplo.com.br`,
    telefone: `(11) 9${String(1000 + Math.floor(r() * 8999))}-${String(1000 + Math.floor(r() * 8999))}`,
    empresa,
    dono: escolher(DONOS, r),
    etapa: escolher(ETAPAS_CONTATO, r),
    origem: escolher(ORIGENS, r),
    negocios,
    valor: negocios === 0 ? 0 : Math.round(r() * 80_000 + 1_500),
    ultimaAtividade: dataCurta.format(data),
  };
}

export const TOTAL_CONTATOS = 24_752;

export function paginaDeContatos(pagina: number, tamanho: number): ContatoFicticio[] {
  const inicio = (pagina - 1) * tamanho;
  const fim = Math.min(inicio + tamanho, TOTAL_CONTATOS);
  return Array.from({ length: Math.max(0, fim - inicio) }, (_, i) => contatoFicticio(inicio + i + 1));
}

export interface NegocioFicticio {
  id: string;
  titulo: string;
  empresa: string;
  valor: number;
  dono: string;
  previsao: string;
}

export const ETAPAS_NEGOCIO = [
  { id: "novo", nome: "Novo", probabilidade: 0.1 },
  { id: "contato", nome: "Contato feito", probabilidade: 0.25 },
  { id: "proposta", nome: "Proposta enviada", probabilidade: 0.5 },
  { id: "negociacao", nome: "Negociação", probabilidade: 0.75 },
  { id: "fechamento", nome: "Fechamento", probabilidade: 0.9 },
] as const;

const PRODUTOS = ["Plano Pro anual", "Implantação", "Plano Equipe", "Consultoria", "Licença extra", "Treinamento"];

export function negociosFicticios(etapaIndice: number, quantidade: number): NegocioFicticio[] {
  return Array.from({ length: quantidade }, (_, i) => {
    const r = aleatorio(etapaIndice * 1000 + i + 1);
    const dia = 1 + Math.floor(r() * 28);
    return {
      id: `n-${etapaIndice}-${i}`,
      titulo: `${escolher(PRODUTOS, r)} — ${escolher(EMPRESAS, r)}`,
      empresa: escolher(EMPRESAS, r),
      valor: Math.round((r() * 45_000 + 2_000) / 100) * 100,
      dono: escolher(DONOS, r),
      previsao: `${String(dia).padStart(2, "0")}/11`,
    };
  });
}
