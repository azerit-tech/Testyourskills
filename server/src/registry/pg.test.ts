import { describe, expect, it } from "vitest";
import { PgRegistryDb, SQL, type Queryable } from "./pg";

function fake(rows: Record<string, unknown>[] = [], rowCount = 0) {
  const calls: { text: string; values?: unknown[] }[] = [];
  const client: Queryable = {
    async query(text, values) {
      calls.push({ text, values });
      return { rows, rowCount };
    },
  };
  return { calls, db: new PgRegistryDb(client) };
}

describe("registre Postgres", () => {
  it("rien que des SELECT et des INSERT : jamais une mise à jour, jamais une suppression", () => {
    for (const sql of Object.values(SQL)) {
      expect(sql).not.toMatch(/\b(UPDATE|DELETE|TRUNCATE|DROP|ALTER)\b|DO UPDATE/i);
      expect(sql.trim()).toMatch(/^(SELECT|INSERT)/);
    }
  });

  it("aucune ligne marquée n'est lue, aucun INSERT ne part si la ligne existe", () => {
    for (const sql of [SQL.LINKS_SQL, SQL.CV_SQL, SQL.PHOTO_SQL]) expect(sql).toContain("deleted_at IS NULL");
    for (const sql of [SQL.ACCOUNTS_SQL, SQL.LINK_SQL, SQL.ADD_CV_SQL]) expect(sql).toMatch(/NOT EXISTS[\s\S]*ON CONFLICT[\s\S]*DO NOTHING/);
  });

  it("les liens d'un compte : paramètres et lecture des lignes", async () => {
    const { db, calls } = fake([{ other: "camille-ardent", handle: "Camille-Ardent", source: "github_social", strength: 2, rejected: 0, observed_at: "2026-10-01T10:00:00" }]);
    const rows = await db.links({ platform: "github", key: "camardent" }, "linkedin");
    expect(calls[0]!.values).toEqual(["github", "camardent", "linkedin"]);
    expect(rows).toEqual([{ other: "camille-ardent", handle: "Camille-Ardent", source: "github_social", strength: 2, rejected: false, observedAt: "2026-10-01T10:00:00" }]);
  });

  it("un lien : GitHub en `a`, LinkedIn en `b`, source testyourskills, campagne vide", async () => {
    const { db, calls } = fake([], 1);
    const ok = await db.addLink({
      github: { platform: "github", key: "camardent", handle: "CamArdent" },
      linkedin: { platform: "linkedin", key: "camille-ardent", handle: "camille-ardent" },
      strength: 2,
      step: "github_social",
      at: "2026-11-20T12:00:00",
    });
    expect(ok).toBe(true);
    expect(calls[0]!.values).toEqual(["camardent", "camille-ardent", 2, "github_social", "2026-11-20T12:00:00"]);
    expect(SQL.LINK_SQL).toMatch(/SELECT g\.id, li\.id, 'testyourskills', \$3, 0, NULL/);
  });

  it("des comptes : trois tableaux parallèles", async () => {
    const { db, calls } = fake([], 2);
    expect(
      await db.addAccounts([
        { platform: "github", key: "camardent", handle: "CamArdent" },
        { platform: "linkedin", key: "camille-ardent", handle: "camille-ardent" },
      ]),
    ).toBe(2);
    expect(calls[0]!.values).toEqual([["github", "linkedin"], ["camardent", "camille-ardent"], ["CamArdent", "camille-ardent"]]);
    expect(await db.addAccounts([])).toBe(0);
    expect(calls).toHaveLength(1);
  });

  it("un CV, une photo : des octets, sinon rien", async () => {
    expect(await fake([{ data: new Uint8Array([1]), fetched_at: "2026-11-01T00:00:00" }]).db.cv("x")).toEqual({ data: new Uint8Array([1]), fetchedAt: "2026-11-01T00:00:00" });
    expect(await fake([]).db.cv("x")).toBeNull();
    expect(await fake([{ data: new Uint8Array([2]), content_type: "image/jpeg" }]).db.photo("x")).toEqual({ data: new Uint8Array([2]), contentType: "image/jpeg" });
  });
});
