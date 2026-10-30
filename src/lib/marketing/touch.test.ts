import { describe, expect, it } from "vitest";
import { extractRef, firstTouch, isPaid, newCode, normalizeUtm, pickTouchpoint, spendFor, touchFromMetaReferral, waUrl } from "./touch";

describe("normalizeUtm", () => {
  it("minúsculas, trim, vazio vira null, corta em 200", () => {
    expect(normalizeUtm("  Facebook ")).toBe("facebook");
    expect(normalizeUtm("   ")).toBeNull();
    expect(normalizeUtm(3)).toBeNull();
    expect(normalizeUtm("a".repeat(300))?.length).toBe(200);
  });
});

describe("isPaid", () => {
  it("id de clique ou de anúncio é pago", () => {
    expect(isPaid({ gclid: "x" })).toBe(true);
    expect(isPaid({ ctwaClid: "x" })).toBe(true);
    expect(isPaid({ adId: "1" })).toBe(true);
  });
  it("utm_medium pago", () => {
    expect(isPaid({ utmMedium: "cpc" })).toBe(true);
    expect(isPaid({ utmMedium: "paid_social" })).toBe(true);
    expect(isPaid({ utmMedium: "email" })).toBe(false);
    expect(isPaid({})).toBe(false);
  });
});

describe("pickTouchpoint", () => {
  const t = (id: string, at: string, paid: boolean) => ({ id, at: new Date(at), paid });
  const criado = new Date("2026-10-10T12:00:00Z");
  it("último pago antes da criação", () => {
    expect(pickTouchpoint([t("a", "2026-10-01", true), t("b", "2026-10-05", false), t("c", "2026-10-11", true)], criado)).toBe("a");
  });
  it("sem pago, o último antes da criação", () => {
    expect(pickTouchpoint([t("a", "2026-10-01", false), t("b", "2026-10-05", false)], criado)).toBe("b");
  });
  it("nada antes da criação: null", () => {
    expect(pickTouchpoint([t("a", "2026-10-11", true)], criado)).toBeNull();
  });
  it("firstTouch é o mais antigo", () => {
    expect(firstTouch([t("b", "2026-10-05", false), t("a", "2026-10-01", true)])).toBe("a");
    expect(firstTouch([])).toBeNull();
  });
});

describe("spendFor", () => {
  const s = { source: "facebook", campaign: "bf", from: "2026-10-01", to: "2026-10-10", amountCents: 1000 };
  it("janela cobre tudo", () => expect(spendFor([s], "facebook", "bf", "2026-09-01", "2026-10-31")).toBe(1000));
  it("rateia por dia", () => expect(spendFor([s], "facebook", "bf", "2026-10-06", "2026-10-31")).toBe(500));
  it("fora da janela ou de outra campanha: 0", () => {
    expect(spendFor([s], "facebook", "bf", "2026-11-01", "2026-11-30")).toBe(0);
    expect(spendFor([s], "facebook", "", "2026-10-01", "2026-10-31")).toBe(0);
  });
});

describe("ref e links", () => {
  it("acha o código no texto", () => {
    expect(extractRef("Olá! Quero saber mais (ref: ABC234)")).toBe("ABC234");
    expect(extractRef("ref:abcd2345 oi")).toBe("ABCD2345");
    expect(extractRef("sem código")).toBeNull();
  });
  it("código novo só com letras não ambíguas", () => {
    expect(newCode(6)).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
  });
  it("monta o wa.me com a mensagem e o código", () => {
    expect(waUrl("55 (11) 99999-0000", "Oi", "ABC234")).toBe("https://wa.me/5511999990000?text=Oi%20(ref%3A%20ABC234)");
  });
});

describe("touchFromMetaReferral", () => {
  it("anúncio que leva ao WhatsApp é pago", () => {
    const t = touchFromMetaReferral("whatsapp_meta", { source_id: "123", source_type: "ad", source_url: "https://fb.me/x", ctwa_clid: "C" });
    expect(t).toMatchObject({ channel: "ad_whatsapp", adId: "123", ctwaClid: "C", utmSource: "facebook", paid: true });
  });
  it("Messenger/Instagram com ad_id", () => {
    expect(touchFromMetaReferral("instagram", { ad_id: "9", source: "ADS" })).toMatchObject({ channel: "ad_instagram", adId: "9", utmSource: "instagram" });
    expect(touchFromMetaReferral("messenger", { ad_id: "9" })).toMatchObject({ channel: "ad_messenger" });
  });
  it("sem anúncio, nada", () => expect(touchFromMetaReferral("instagram", undefined)).toBeNull());
});
