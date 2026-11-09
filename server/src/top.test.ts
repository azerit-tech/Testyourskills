// Top de la semaine (§18.22) sur une base de test en mémoire.

import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FIXTURES } from "../../shared/fixtures";
import type { CardData, ComparisonData, JobState, WeekTop } from "../../shared/types";
import { createApp } from "./app";
import { RETENTION_MS, Store, type NewCardRow } from "./db";
import type { Deps } from "./pipeline";
import { weekRank, weekTop, withWeekSpecial } from "./top";
import { weekStart } from "./weekly";

const stores: Store[] = [];
afterEach(() => {
  while (stores.length) stores.pop()!.close();
});

const H = 3600 * 1000;
const DAY = 24 * H;
// Lundi 9 novembre 2026, 00:00 UTC : semaine ISO 46.
const W46 = Date.UTC(2026, 10, 9);
const W45 = W46 - 7 * DAY;
const NOW = W46 + 2 * DAY + 15 * H; // mercredi 11, 15:00

function newStore() {
  const s = new Store(":memory:");
  stores.push(s);
  return s;
}

let seq = 0;
function gh(login: string, overall: number, createdAt: number, over: Partial<NewCardRow> = {}, card: Partial<CardData> = {}): NewCardRow {
  const id = `card${String(++seq).padStart(4, "0")}`;
  return {
    id,
    createdAt,
    source: "github",
    login,
    kind: "card",
    data: { ...FIXTURES.gold, id, login, overall, createdAt: new Date(createdAt).toISOString(), ...card },
    facts: { profile: { followers: 12 } },
    deleteToken: "tok",
    ...over,
  };
}

describe("weekTop", () => {
  it("une ligne par login, sa meilleure note ; total = logins classés", () => {
    const store = newStore();
    const a1 = gh("lea", 70, W46 + H);
    const a2 = gh("lea", 82, W46 + 2 * H);
    const a3 = gh("lea", 60, W46 + 3 * H);
    const b = gh("Kevin", 75, W46 + 4 * H, { login: "Kevin" });
    store.insertCards([a1, a2, a3, b]);
    const top = weekTop(store.db, { now: NOW, limit: 10 });
    expect(top.weekStart).toBe(W46);
    expect(top.endsAt).toBe(W46 + 7 * DAY);
    expect(top.week).toBe(46);
    expect(top.total).toBe(2);
    expect(top.entries.map((e) => [e.rank, e.login, e.overall, e.cardId])).toEqual([
      [1, "lea", 82, a2.id],
      [2, "Kevin", 75, b.id],
    ]);
    expect(top.entries[0]!.stars).toBe(5);
    // Rien de privé dans une ligne.
    const allowed = ["avatarUrl", "cardId", "login", "overall", "profile", "rank", "stars"];
    for (const e of top.entries) expect(Object.keys(e).every((k) => allowed.includes(k))).toBe(true);
    expect(JSON.stringify(top)).not.toMatch(/"tok"|email|followers/);
  });

  it("à égalité, la fiche la plus ancienne passe devant", () => {
    const store = newStore();
    const late = gh("late", 80, W46 + 5 * H);
    const early = gh("early", 80, W46 + 1 * H);
    store.insertCards([late, early]);
    expect(weekTop(store.db, { now: NOW }).entries.map((e) => e.login)).toEqual(["early", "late"]);
    // Même login, deux fiches à égalité : la plus ancienne porte le rang.
    const again = gh("early", 80, W46 + 9 * H);
    store.insertCards([again]);
    expect(weekTop(store.db, { now: NOW }).entries[0]!.cardId).toBe(early.id);
  });

  it("écarte les logins masqués, les fiches dégradées, expirées, CV et les célébrités", () => {
    const store = newStore();
    store.insertCards([
      gh("hidden", 90, W46 + H),
      gh("degraded", 89, W46 + H, { degraded: true }),
      gh("star", 88, W46 + H, { facts: { profile: { followers: 5001 } } }),
      gh("limit", 70, W46 + H, { facts: { profile: { followers: 5000 } } }),
      gh("ok", 60, W46 + H),
      { ...gh("cv", 95, W46 + H), source: "cv", login: null },
    ]);
    store.claimOwner("hidden", 1);
    store.setOwnerHidden("hidden", true);
    const top = weekTop(store.db, { now: NOW });
    expect(top.entries.map((e) => e.login)).toEqual(["limit", "ok"]);
    expect(top.total).toBe(2);
    // Une fiche expirée (pas encore purgée) sort aussi.
    const old = gh("old", 99, W46 + H);
    store.insertCards([old]);
    expect(weekTop(store.db, { now: W46 + H + RETENTION_MS + 1 }).entries).toEqual([]);
    expect(weekTop(store.db, { now: NOW }).entries[0]!.login).toBe("old");
  });

  it("la carte GitHub d'une comparaison entre au classement, pas la comparaison ni la carte CV", () => {
    const store = newStore();
    const cmpId = "cmp00001";
    const child = gh("both", 77, W46 + H, { parentId: cmpId });
    store.insertCards([
      { id: cmpId, createdAt: W46 + H, source: "both", login: "both", kind: "comparison", data: { ...FIXTURES.gold, id: cmpId } as never, deleteToken: "t" },
      { ...gh("both", 99, W46 + H, { parentId: cmpId }), source: "cv", login: null },
      child,
    ]);
    const top = weekTop(store.db, { now: NOW });
    expect(top.entries.map((e) => [e.login, e.cardId])).toEqual([["both", child.id]]);
  });

  it("change de semaine le lundi 00:00 UTC", () => {
    const store = newStore();
    store.insertCards([gh("sunday", 90, W46 - 1), gh("monday", 50, W46)]);
    expect(weekTop(store.db, { now: NOW }).entries.map((e) => e.login)).toEqual(["monday"]);
    expect(weekTop(store.db, { now: W46 - 2 }).entries.map((e) => e.login)).toEqual(["sunday"]);
    expect(weekTop(store.db, { now: W46 - 2 }).week).toBe(45);
  });

  it("respecte la limite, le total compte tout le monde", () => {
    const store = newStore();
    store.insertCards(Array.from({ length: 14 }, (_, i) => gh(`dev${i}`, 40 + i, W46 + H)));
    const top = weekTop(store.db, { now: NOW, limit: 10 });
    expect(top.entries).toHaveLength(10);
    expect(top.total).toBe(14);
    expect(top.entries[0]!.login).toBe("dev13");
  });
});

describe("weekRank", () => {
  it("rang, total, écart au top 5", () => {
    const store = newStore();
    const rows = [90, 85, 81, 80, 79, 78, 70].map((n, i) => gh(`d${i}`, n, W46 + H));
    store.insertCards(rows);
    // 79 contre 70 : 10 points pour passer devant le 5e, l'égalité ne suffit pas.
    expect(weekRank(store.db, rows[6]!.id, NOW)).toEqual({ rank: 7, total: 7, gapToTop5: 10, inTop5: false, week: 46, closed: false });
    expect(weekRank(store.db, rows[5]!.id, NOW)!.gapToTop5).toBe(2);
    expect(weekRank(store.db, rows[4]!.id, NOW)).toMatchObject({ rank: 5, inTop5: true, gapToTop5: 0 });
  });

  it("moins de cinq classés : tout le monde est dans le top 5", () => {
    const store = newStore();
    const rows = [50, 40].map((n, i) => gh(`e${i}`, n, W46 + H));
    store.insertCards(rows);
    expect(weekRank(store.db, rows[1]!.id, NOW)).toMatchObject({ rank: 2, total: 2, inTop5: true, gapToTop5: 0 });
  });

  it("null hors classement ; semaine close une fois passée", () => {
    const store = newStore();
    const cv = { ...gh("x", 80, W46 + H), source: "cv" as const, login: null };
    const deg = gh("deg", 80, W46 + H, { degraded: true });
    const last = gh("last", 60, W45 + H);
    store.insertCards([cv, deg, last]);
    expect(weekRank(store.db, cv.id, NOW)).toBeNull();
    expect(weekRank(store.db, deg.id, NOW)).toBeNull();
    expect(weekRank(store.db, "nope", NOW)).toBeNull();
    expect(weekRank(store.db, last.id, NOW)).toMatchObject({ rank: 1, total: 1, week: 45, closed: true, inTop5: true });
  });
});

describe("withWeekSpecial", () => {
  it("pose « Top 5 de la semaine » sur la fiche classée du top 5, jamais ailleurs", () => {
    const store = newStore();
    const rows = [90, 85, 81, 80, 79, 78].map((n, i) => gh(`s${i}`, n, W46 + H));
    const lower = gh("s0", 60, W46 + 2 * H); // même login que le 1er, fiche moins bonne
    const kid = gh("kid", 95, W46 + H, {}, { special: "wonderkid" });
    store.insertCards([...rows, lower, kid]);
    const read = (r: NewCardRow) => withWeekSpecial(store.db, store.getCard(r.id)!.data as CardData, NOW);
    expect(read(rows[0]!).data.special).toBe("totw");
    expect(read(rows[0]!).totw).toBe(true);
    expect(read(rows[0]!).live).toBe(true);
    // Le 6e (kid est 1er, donc s4 sort du top 5).
    expect(read(rows[4]!).data.special).toBeUndefined();
    expect(read(lower).data.special).toBeUndefined();
    // Une autre spéciale reste.
    expect(read(kid).data.special).toBe("wonderkid");
    expect(read(kid).totw).toBe(false);
    // Rien n'est écrit dans la ligne.
    expect((store.getCard(rows[0]!.id)!.data as CardData).special).toBeUndefined();
    // La semaine finie, elle reste.
    const later = withWeekSpecial(store.db, store.getCard(rows[0]!.id)!.data as CardData, NOW + 30 * DAY);
    expect(later.data.special).toBe("totw");
    expect(later.live).toBe(false);
  });

  it("sur une comparaison, c'est sa carte GitHub qui la porte", () => {
    const store = newStore();
    const cmpId = "cmp00002";
    const child = gh("pair", 80, W46 + H, { parentId: cmpId });
    const cmp = { id: cmpId, createdAt: new Date(W46 + H).toISOString(), cv: { ...FIXTURES.cv, id: "cvchild1" }, github: child.data as CardData, deltas: {}, headline: { fr: "", en: "" } } as unknown as ComparisonData;
    store.insertCards([{ id: cmpId, createdAt: W46 + H, source: "both", login: "pair", kind: "comparison", data: cmp, deleteToken: "t" }, child]);
    const out = withWeekSpecial(store.db, cmp, NOW);
    expect(out.data.github.special).toBe("totw");
    expect(out.data.cv.special).toBeUndefined();
  });
});

describe("routes", () => {
  function setup() {
    const store = newStore();
    const ogDir = mkdtempSync(join(tmpdir(), "tys-top-"));
    const renders: string[] = [];
    const deps = {
      async renderImage(input: { format: string; card?: CardData }) {
        renders.push(`${input.format}:${input.card?.special ?? "-"}`);
        return new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
      },
    } as unknown as Deps;
    const { app } = createApp({ store, deps, githubToken: "t", baseUrl: "https://skills.test", ogDir });
    return { app, store, ogDir, renders };
  }

  it("GET /api/top : le top 10 de la semaine, en cache 60 s", async () => {
    const { app, store } = setup();
    const now = Date.now();
    store.insertCards([gh("alpha", 80, now - 1000), gh("beta", 70, now - 2000)]);
    const res = await app.request("/api/top");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=60");
    const top = (await res.json()) as WeekTop;
    expect(top.weekStart).toBe(weekStart(now));
    expect(top.total).toBe(2);
    expect(top.entries.map((e) => e.login)).toEqual(["alpha", "beta"]);
  });

  it("GET /api/card/:id : le rang de la semaine et la spéciale lue à la volée", async () => {
    const { app, store } = setup();
    const now = Date.now();
    const rows = [90, 85, 81, 80, 79, 70].map((n, i) => gh(`r${i}`, n, now - 1000 - i));
    store.insertCards(rows);
    const top = (await (await app.request(`/api/card/${rows[0]!.id}`)).json()) as Extract<JobState, { state: "done"; kind: "card" }>;
    expect(top.card.special).toBe("totw");
    expect(top.week).toMatchObject({ rank: 1, total: 6, inTop5: true, gapToTop5: 0, closed: false });
    const sixth = (await (await app.request(`/api/card/${rows[5]!.id}`)).json()) as Extract<JobState, { state: "done"; kind: "card" }>;
    expect(sixth.card.special).toBeUndefined();
    expect(sixth.week).toMatchObject({ rank: 6, gapToTop5: 10, inTop5: false });
    // Hors classement : pas de champ week.
    const cv = { ...gh("cvonly", 99, now - 1000), source: "cv" as const, login: null };
    store.insertCards([cv]);
    const cvState = (await (await app.request(`/api/card/${cv.id}`)).json()) as Record<string, unknown>;
    expect("week" in cvState).toBe(false);
  });

  it("/og : la spéciale change la clé du cache disque ; semaine en cours, cache court", async () => {
    const { app, store, ogDir, renders } = setup();
    const now = Date.now();
    const mine = gh("me", 60, now - 1000);
    store.insertCards([mine]);
    let res = await app.request(`/og/${mine.id}.png`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=300");
    expect(renders).toEqual(["og:totw"]); // seul classé : top 5
    expect(readdirSync(ogDir)).toEqual([`${mine.id}-totw.png`]);
    // Cinq fiches meilleures arrivent : la spéciale part, une autre image est rendue.
    store.insertCards([91, 92, 93, 94, 95].map((n, i) => gh(`top${i}`, n, now - 500)));
    res = await app.request(`/og/${mine.id}.png`);
    expect(renders).toEqual(["og:totw", "og:-"]);
    expect(readdirSync(ogDir).sort()).toEqual([`${mine.id}-totw.png`, `${mine.id}.png`].sort());
    // Page /c/:id : l'image de partage d'une fiche du top 5 a sa propre adresse.
    const html = await (await app.request(`/c/${store.getCard(weekTop(store.db).entries[0]!.cardId)!.id}`)).text();
    expect(html).toContain("?s=totw");
    expect(html).toContain("Top 5 de la semaine");
  });

  it("/og : semaine close, l'image ne bouge plus, cache long", async () => {
    const { app, store, renders } = setup();
    const old = gh("past", 70, weekStart(Date.now()) - 2 * DAY);
    store.insertCards([old]);
    const res = await app.request(`/og/${old.id}-portrait.png`);
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(renders).toEqual(["portrait:totw"]);
  });
});
