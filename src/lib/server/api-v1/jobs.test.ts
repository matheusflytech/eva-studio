import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/server/storage", () => ({ urlAssinada: vi.fn(async () => "https://storage.test/x.csv?token=1"), urlDeUpload: vi.fn(), midiaExiste: vi.fn() }));

import type { BulkJob } from "@/generated/prisma/client";
import { exportacaoComLink, serializarJob } from "./jobs";

const job = (extra: Partial<BulkJob> = {}) =>
  ({
    id: "j1",
    kind: "export",
    entity: "deals",
    status: "completed",
    format: "csv",
    options: {},
    total: 2,
    processed: 2,
    errors: [],
    result: { file_path: "org-1/exports/j1.csv", rows: 2, bytes: 10 },
    createdAt: new Date("2026-10-20T00:00:00Z"),
    startedAt: null,
    finishedAt: null,
    ...extra,
  }) as BulkJob;

describe("job na API", () => {
  it("não expõe o caminho interno do storage; o download vem por download_url", async () => {
    expect(serializarJob(job()).result).toEqual({ rows: 2, bytes: 10 });
    const comLink = await exportacaoComLink(job());
    expect(comLink.result).toEqual({ rows: 2, bytes: 10 });
    expect(comLink).toMatchObject({ download_url: "https://storage.test/x.csv?token=1" });
  });
});
