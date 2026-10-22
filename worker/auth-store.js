// Estado de autenticação do Baileys (protocolo Signal) persistido no Postgres
// em vez de arquivos locais — o worker roda no Railway sem disco garantido
// entre deploys, então perder os creds/keys forçaria escanear o QR de novo
// toda vez. `creds` e `keys` ficam como JSON na linha da sessão: por canal
// (eva_studio_canais_whatsapp_qr) ou, antes do SQL de canais, por agente.
import { initAuthCreds, BufferJSON } from "@whiskeysockets/baileys";
import { MODOS } from "./fonte.js";

function serialize(value) {
  return JSON.parse(JSON.stringify(value, BufferJSON.replacer));
}

function deserialize(value) {
  return JSON.parse(JSON.stringify(value), BufferJSON.reviver);
}

export async function loadAuthState(pool, chave, modo = "agente") {
  const { tabela, coluna } = MODOS[modo];
  const { rows } = await pool.query(`select creds, keys from ${tabela} where "${coluna}" = $1`, [chave]);

  const creds = rows[0]?.creds ? deserialize(rows[0].creds) : initAuthCreds();
  const keyData = rows[0]?.keys ? deserialize(rows[0].keys) : {};

  async function persist() {
    await pool.query(
      `update ${tabela} set creds = $2, keys = $3, "updatedAt" = now() where "${coluna}" = $1`,
      [chave, JSON.stringify(serialize(creds)), JSON.stringify(serialize(keyData))]
    );
  }

  const keys = {
    get: async (type, ids) => {
      const result = {};
      for (const id of ids) {
        const value = keyData[type]?.[id];
        if (value !== undefined) result[id] = value;
      }
      return result;
    },
    set: async (data) => {
      for (const type of Object.keys(data)) {
        keyData[type] = keyData[type] || {};
        for (const id of Object.keys(data[type])) {
          const value = data[type][id];
          if (value === null || value === undefined) delete keyData[type][id];
          else keyData[type][id] = value;
        }
      }
      await persist();
    },
  };

  return {
    state: { creds, keys },
    saveCreds: persist,
  };
}
