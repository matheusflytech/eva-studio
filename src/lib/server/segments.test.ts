import { describe, it, expect } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { buildSegmentWhere, lerRegras, validarRegras, WHERE_IMPOSSIVEL, type SegmentRule } from "./segments";

describe("buildSegmentWhere", () => {
  it("canal é relação (ContactChannel), não coluna de Contact", () => {
    expect(buildSegmentWhere("o1", "all", [{ field: "channel", op: "equals", value: "whatsapp_meta" }])).toEqual({
      orgId: "o1",
      AND: [{ channels: { some: { channel: "whatsapp_meta" } } }],
    });
    expect(buildSegmentWhere("o1", "all", [{ field: "channel", op: "not_equals", value: "instagram" }])).toEqual({
      orgId: "o1",
      AND: [{ channels: { none: { channel: "instagram" } } }],
    });
  });

  it("sem regra é todo mundo da org", () => {
    expect(buildSegmentWhere("o1", "all", [])).toEqual({ orgId: "o1" });
  });

  it("regra inválida nunca alarga o público", () => {
    const where = buildSegmentWhere("o1", "all", [{ field: "tag", op: "has", value: "" }]);
    expect(where).toEqual({ orgId: "o1", AND: [WHERE_IMPOSSIVEL] });
    const qualquer = buildSegmentWhere("o1", "any", [
      { field: "tag", op: "has", value: "" },
      { field: "optIn", op: "is_true" },
    ]);
    expect(qualquer).toEqual({ orgId: "o1", OR: [WHERE_IMPOSSIVEL, { optIn: true }] });
  });

  it("campo livre: contém sem caixa; vazio pega chave ausente, null JSON e texto vazio", () => {
    const [contem] = (buildSegmentWhere("o1", "all", [{ field: "custom:cidade", op: "contains", value: "Sao" }]).AND ??
      []) as Prisma.ContactWhereInput[];
    expect(contem).toEqual({ customFields: { path: ["cidade"], string_contains: "Sao", mode: "insensitive" } });

    const [vazio] = (buildSegmentWhere("o1", "all", [{ field: "custom:cidade", op: "is_empty" }]).AND ??
      []) as Prisma.ContactWhereInput[];
    expect(vazio).toEqual({
      OR: [
        { customFields: { path: ["cidade"], equals: Prisma.AnyNull } },
        { customFields: { path: ["cidade"], equals: "" } },
      ],
    });
  });
});

describe("validarRegras / lerRegras", () => {
  it("aponta regra vazia ou desconhecida", () => {
    const rules: SegmentRule[] = [
      { field: "tag", op: "has", value: "t1" },
      { field: "tag", op: "has", value: "" },
      { field: "inexistente", op: "equals", value: "x" },
    ];
    expect(validarRegras(rules)).toHaveLength(2);
  });

  it("recusa lista malformada e aceita regra boa", () => {
    expect(typeof lerRegras("x")).toBe("string");
    expect(typeof lerRegras([{ op: "has" }])).toBe("string");
    expect(lerRegras([{ field: "channel", op: "equals", value: "whatsapp_qr" }])).toEqual([
      { field: "channel", op: "equals", value: "whatsapp_qr" },
    ]);
    expect(lerRegras(undefined)).toEqual([]);
  });
});
