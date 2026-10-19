import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { criarTemplateNaMeta, subirMidiaDeExemplo } from "./meta-templates";
import { FACEBOOK_GRAPH } from "./meta-graph";

// Nunca chama a Graph de verdade: todo fetch aqui é falso.
const fetchFalso = vi.fn();

function resposta(status: number, corpo: unknown) {
  return new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  fetchFalso.mockReset();
  vi.stubGlobal("fetch", fetchFalso);
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.META_APP_ID;
});

const payload = {
  name: "boas_vindas",
  language: "pt_BR",
  category: "MARKETING" as const,
  components: [{ type: "BODY", text: "Oi, tudo bem?" }],
};

describe("criarTemplateNaMeta", () => {
  it("manda o payload para /{WABA}/message_templates com o token no cabeçalho", async () => {
    fetchFalso.mockResolvedValue(resposta(200, { id: "987", status: "PENDING", category: "MARKETING" }));
    const r = await criarTemplateNaMeta("waba1", "tok", payload);

    expect(r).toEqual({ ok: true, id: "987", status: "PENDING", category: "MARKETING" });
    const [url, init] = fetchFalso.mock.calls[0];
    expect(url).toBe(`${FACEBOOK_GRAPH}/waba1/message_templates`);
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body)).toEqual(payload);
  });

  it("erro da Meta vira mensagem em português", async () => {
    fetchFalso.mockResolvedValue(
      resposta(400, { error: { code: 100, error_subcode: 2388024, message: "dup", error_user_msg: "Já existe conteúdo neste idioma." } })
    );
    const r = await criarTemplateNaMeta("waba1", "tok", payload);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toMatch(/já existe um template com esse nome/i);
  });

  it("usa a mensagem para o usuário que a Meta manda quando não reconhece o código", async () => {
    fetchFalso.mockResolvedValue(resposta(400, { error: { code: 100, message: "Invalid", error_user_msg: "Texto inválido." } }));
    const r = await criarTemplateNaMeta("waba1", "tok", payload);
    if (!r.ok) expect(r.erro).toContain("Texto inválido.");
  });

  it("token expirado", async () => {
    fetchFalso.mockResolvedValue(resposta(401, { error: { code: 190, message: "expired" } }));
    const r = await criarTemplateNaMeta("waba1", "tok", payload);
    if (!r.ok) expect(r.erro).toMatch(/reconecte/i);
  });

  it("falha de rede", async () => {
    fetchFalso.mockRejectedValue(new Error("ECONNRESET"));
    const r = await criarTemplateNaMeta("waba1", "tok", payload);
    expect(r.ok).toBe(false);
  });
});

describe("subirMidiaDeExemplo", () => {
  it("sem META_APP_ID: erro claro, sem chamar a Meta", async () => {
    const r = await subirMidiaDeExemplo("tok", new Uint8Array([1, 2]), "image/png", "a.png");
    expect(r.ok).toBe(false);
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("abre a sessão de upload e envia os bytes, devolvendo o handle", async () => {
    process.env.META_APP_ID = "app123";
    fetchFalso
      .mockResolvedValueOnce(resposta(200, { id: "upload:abc" }))
      .mockResolvedValueOnce(resposta(200, { h: "4::handle" }));

    const r = await subirMidiaDeExemplo("tok", new Uint8Array([1, 2, 3]), "image/png", "banner.png");
    expect(r).toEqual({ ok: true, handle: "4::handle" });

    const [url1, init1] = fetchFalso.mock.calls[0];
    expect(url1).toContain(`${FACEBOOK_GRAPH}/app123/uploads?`);
    expect(url1).toContain("file_length=3");
    expect(url1).toContain("file_type=image%2Fpng");
    expect(init1.method).toBe("POST");
    expect(init1.headers.Authorization).toBe("OAuth tok");

    const [url2, init2] = fetchFalso.mock.calls[1];
    expect(url2).toBe(`${FACEBOOK_GRAPH}/upload:abc`);
    expect(init2.headers.file_offset).toBe("0");
    expect(init2.headers.Authorization).toBe("OAuth tok");
  });

  it("recusa tipo de arquivo que a Meta não aceita no cabeçalho", async () => {
    process.env.META_APP_ID = "app123";
    const r = await subirMidiaDeExemplo("tok", new Uint8Array([1]), "application/zip", "x.zip");
    expect(r.ok).toBe(false);
    expect(fetchFalso).not.toHaveBeenCalled();
  });
});
