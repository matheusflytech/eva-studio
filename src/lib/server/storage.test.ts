import { describe, it, expect } from "vitest";
import { caminhoDaOrg, novoCaminho } from "./storage";

describe("caminhoDaOrg", () => {
  it("aceita o caminho que o próprio sistema gera", () => {
    expect(caminhoDaOrg(novoCaminho("org-a", "pdf"), "org-a")).toBe(true);
    expect(caminhoDaOrg("org-a/exports/job1.csv", "org-a")).toBe(true);
  });

  it("não deixa sair do prefixo da organização", () => {
    expect(caminhoDaOrg("org-b/2026/10/x.pdf", "org-a")).toBe(false);
    expect(caminhoDaOrg("org-a/../org-b/2026/10/x.pdf", "org-a")).toBe(false);
    expect(caminhoDaOrg("org-a/%2e%2e/org-b/2026/10/x.pdf", "org-a")).toBe(false);
    expect(caminhoDaOrg("org-a/%252e%252e/org-b/2026/10/x.pdf", "org-a")).toBe(false);
    expect(caminhoDaOrg("org-a/x.pdf?y=1", "org-a")).toBe(false);
  });
});
