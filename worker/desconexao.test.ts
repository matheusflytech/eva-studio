import { describe, it, expect } from "vitest";
import { CODIGOS, decidirReconexao } from "./desconexao.js";

const s = (pareado: boolean, tentativas = 0) => ({ pareado, tentativas });

describe("o que fazer quando a conexão fecha", () => {
  it("logout no celular: limpa a sessão", () => {
    expect(decidirReconexao(CODIGOS.loggedOut, s(true))).toEqual({ acao: "logout" });
  });

  it("sessão assumida por outro worker (deploy): larga sem gravar estado nem reconectar", () => {
    expect(decidirReconexao(CODIGOS.connectionReplaced, s(true))).toEqual({ acao: "largar" });
  });

  it("número recusado: para, sem reconectar", () => {
    expect(decidirReconexao(CODIGOS.forbidden, s(true))).toMatchObject({ acao: "parar", erro: expect.stringMatching(/403/) });
  });

  it("QR que expirou sem leitura e reinício depois de parear: normais, sem aviso", () => {
    expect(decidirReconexao(CODIGOS.connectionLost, s(false))).toEqual({ acao: "reconectar", atrasoMs: 3000, erro: null });
    expect(decidirReconexao(CODIGOS.restartRequired, s(true))).toEqual({ acao: "reconectar", atrasoMs: 3000, erro: null });
  });

  it("rede caiu com o número já pareado: reconecta com aviso", () => {
    expect(decidirReconexao(CODIGOS.connectionLost, s(true))).toMatchObject({ acao: "reconectar", erro: expect.stringMatching(/código 408/) });
  });

  it("quedas seguidas esperam cada vez mais, até 1 minuto", () => {
    const atraso = (n: number) => (decidirReconexao(500, s(true, n)) as { atrasoMs: number }).atrasoMs;
    expect([atraso(0), atraso(1), atraso(2), atraso(3)]).toEqual([3000, 6000, 12000, 24000]);
    expect(atraso(10)).toBe(60_000);
    expect(decidirReconexao(undefined, s(true))).toMatchObject({ erro: expect.stringMatching(/desconhecido/) });
  });
});
