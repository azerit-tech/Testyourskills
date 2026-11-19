// Top de la semaine (§18.22) sur une base de test en mémoire.

import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FIXTURES } from "../../shared/fixtures";
import type { CardData, ComparisonData, JobState, WeekTop } from "../../shared/types";
import { createApp } from "./app";
import { RETENTION_MS, Store, type NewCardRow } from "./db";
import type { Deps } from "./pipeline";
import { RANK_CACHE_MS, TOTW_MIN_ENTRIES, weekRank, weekTop, withWeekSpecial } from "./top";
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

/**
 * Un dossier à deux pièces : la ligne du dossier, qui porte la seule note, et ses deux pièces.
 * `pieceNote` : la note qu'une pièce GitHub portait à elle, dans les lignes d'avant 0.5.0.
 */
function dossier(id: string, login: string, overall: number, createdAt: number, o: { source?: "linkedin" | "both"; facts?: unknown; pieceNote?: number } = {}): NewCardRow[] {
  const source = o.source ?? "linkedin";
  const at = new Date(createdAt).toISOString();
  const github = gh(login, o.pieceNote ?? overall, createdAt, { parentId: id });
  const cvId = `cv${github.id}`;
  const cv = { ...FIXTURES.cv, id: cvId, createdAt: at, overall: o.pieceNote ?? overall } as CardData;
  const data = { id, createdAt: at, declaredSource: source === "linkedin" ? "linkedin" : "cv", cv, github: github.data as CardData, grid: { criteria: [], overall } } as ComparisonData;
  const facts = o.facts ?? (source === "linkedin" ? { linkedinUrl: `https://www.linkedin.com/in/${login}`, linkedinProven: true } : undefined);
  return [
    { id, createdAt, source, login, kind: "comparison", data, ...(facts ? { facts } : {}), deleteToken: "t" },
    { id: cvId, parentId: id, createdAt, source: source === "linkedin" ? "linkedin" : "cv", login: null, kind: "card", data: cv, deleteToken: "t" },
    github,
  ];
}

/** Une fiche LinkedIn seule. */
function li(slug: string, overall: number, createdAt: number): NewCardRow {
  const id = `lnkd${String(++seq).padStart(4, "0")}`;
  const linkedinUrl = `https://www.linkedin.com/in/${slug}`;
  const data = { ...FIXTURES.cv, id, createdAt: new Date(createdAt).toISOString(), overall, declaredSource: "linkedin", linkedinUrl } as CardData;
  return { id, createdAt, source: "linkedin", login: null, kind: "card", data, facts: { linkedinUrl }, deleteToken: "t" };
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
    // Rien de privé dans une ligne : la personne telle que sa fiche la montre (§18.88), sa note, son profil.
    const allowed = ["avatarUrl", "cardId", "initials", "login", "name", "overall", "profile", "rank", "stars"];
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

  it("un dossier à deux pièces entre sur sa note, la seule ; ses pièces n'entrent jamais (SPEC §18.84)", () => {
    const store = newStore();
    // Lignes d'avant 0.5.0 : la pièce GitHub portait 99 à elle. Le classement lit la note du dossier, 70.
    const rows = dossier("cmp00001", "duo", 70, W46 + H, { pieceNote: 99 });
    store.insertCards(rows);
    const top = weekTop(store.db, { now: NOW });
    expect(top.entries.map((e) => [e.login, e.cardId, e.overall])).toEqual([["duo", "cmp00001", 70]]);
    // Relu de la base, le dossier d'avant ne rend plus que sa note, pièces comprises.
    const read = store.getCard("cmp00001")!.data as ComparisonData;
    expect([read.cv.overall, read.github.overall, read.grid!.overall]).toEqual([70, 70, 70]);
    // Le rang d'une pièce est celui de son dossier.
    for (const r of rows) expect(weekRank(store.db, r.id, NOW)).toMatchObject({ rank: 1, total: 1 });
  });

  it("une personne, une ligne : son dossier passe devant sa fiche GitHub seule, même mieux notée", () => {
    const store = newStore();
    const alone = gh("duo", 90, W46 + H);
    store.insertCards([alone]);
    expect(weekTop(store.db, { now: NOW }).entries.map((e) => [e.cardId, e.overall])).toEqual([[alone.id, 90]]);
    store.insertCards(dossier("cmp00003", "duo", 72, W46 + 2 * H));
    const top = weekTop(store.db, { now: NOW });
    expect(top.total).toBe(1);
    expect(top.entries.map((e) => [e.login, e.cardId, e.overall])).toEqual([["duo", "cmp00003", 72]]);
    // La fiche seule est remplacée par le dossier : son adresse le sert, et son rang est le sien.
    expect(store.getCard(alone.id)!.supersededBy).toBe("cmp00003");
    expect(store.fileRow(alone.id)!.id).toBe("cmp00003");
    expect(weekRank(store.db, alone.id, NOW)).toMatchObject({ rank: 1, total: 1 });
  });

  it("une fiche LinkedIn seule entre sur sa note, sous le nom de sa fiche, avec ses initiales et le lien vers elle (§18.88)", () => {
    const store = newStore();
    const solo = li("camille", 70, W46 + H);
    // Une fiche GitHub sans nom (le bandeau répète le pseudo) : la ligne n'a que son pseudo.
    store.insertCards([solo, gh("dev", 60, W46 + H, {}, { name: "dev", initials: "DE" })]);
    const top = weekTop(store.db, { now: NOW });
    expect(top.total).toBe(2);
    expect(top.entries[0]).toEqual({ rank: 1, cardId: solo.id, name: FIXTURES.cv.name, initials: FIXTURES.cv.initials, overall: 70, stars: 4, ...(top.entries[0]!.profile ? { profile: top.entries[0]!.profile } : {}) });
    expect(top.entries[1]).toMatchObject({ rank: 2, login: "dev", initials: "DE" });
    expect(top.entries[1]!.name).toBeUndefined();
    // Rien d'autre de la fiche ne part : ni l'adresse LinkedIn, ni l'employeur.
    expect(JSON.stringify(top.entries)).not.toMatch(/linkedin\.com|"club"/);
    expect(weekRank(store.db, solo.id, NOW)).toMatchObject({ rank: 1, total: 2 });
    // Son dossier arrive (même adresse LinkedIn, lien prouvé) : une seule ligne, celle du dossier.
    store.insertCards(dossier("cmp00004", "camille-dev", 65, W46 + 2 * H, { facts: { linkedinUrl: "https://www.linkedin.com/in/camille", linkedinProven: true } }));
    const after = weekTop(store.db, { now: NOW });
    expect(after.entries.map((e) => [e.login, e.overall])).toEqual([["camille-dev", 65], ["dev", 60]]);
    expect(store.fileRow(solo.id)!.id).toBe("cmp00004");
  });

  it("un dossier dont le lien n'est pas prouvé ne classe personne et ne remplace rien (§18.24)", () => {
    const store = newStore();
    store.insertCards(dossier("cmpProven1", "prouve", 70, W46 + H));
    const forged = dossier("cmpForged1", "victime", 95, W46 + H, { facts: { linkedinUrl: "https://www.linkedin.com/in/b", linkedinProven: false } });
    // Un dossier d'avant ce champ n'est pas prouvé ; un CV déposé avec un pseudo non plus.
    const legacy = dossier("cmpLegacy1", "avant", 90, W46 + H, { facts: { linkedinUrl: "https://www.linkedin.com/in/c" } });
    const withCv = dossier("cmpAvecCv1", "both", 88, W46 + H, { source: "both" });
    store.insertCards(forged);
    store.insertCards(legacy);
    store.insertCards(withCv);
    expect(weekTop(store.db, { now: NOW }).entries.map((e) => [e.login, e.cardId])).toEqual([["prouve", "cmpProven1"]]);
    for (const rows of [forged, legacy, withCv]) for (const r of rows) expect(weekRank(store.db, r.id, NOW)).toBeNull();

    // La fiche GitHub du pseudo entre, elle ; le dossier non prouvé ne prend ni son rang ni son adresse.
    const own = gh("victime", 60, W46 + 2 * H);
    store.insertCards([own]);
    expect(weekTop(store.db, { now: NOW }).entries.map((e) => e.cardId)).toEqual(["cmpProven1", own.id]);
    expect(weekRank(store.db, "cmpForged1", NOW)).toBeNull();
    expect(withWeekSpecial(store.db, forged[0]!.data as ComparisonData, NOW).week).toBeNull();
    const before = gh("victime2", 60, W46);
    store.insertCards([before]);
    store.insertCards(dossier("cmpForged2", "victime2", 95, W46 + H, { facts: { linkedinUrl: "https://www.linkedin.com/in/d", linkedinProven: false } }));
    expect(store.getCard(before.id)!.supersededBy).toBeNull();
    expect(store.fileRow(before.id)!.id).toBe(before.id);
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

describe("classement gardé 60 s en mémoire", () => {
  /** Nombre de fois où la requête du classement est partie. */
  function countRankings(store: Store) {
    const spy = vi.spyOn(store.db, "prepare");
    return () => spy.mock.calls.filter(([sql]) => /ORDER BY overall DESC/.test(String(sql))).length;
  }

  it("une seule requête pour le top, les rangs et les spéciales d'une même minute, puis recalcul", () => {
    const store = newStore();
    const rows = Array.from({ length: 6 }, (_, i) => gh(`dev${i}`, 50 + i, W46 + H));
    store.insertCards(rows);
    const rankings = countRankings(store);
    expect(weekTop(store.db, { now: NOW }).total).toBe(6);
    for (const r of rows) expect(weekRank(store.db, r.id, NOW + 1000)?.total).toBe(6);
    withWeekSpecial(store.db, rows[0]!.data as CardData, NOW + 2000);
    expect(rankings()).toBe(1);
    // Un changement fait sans passer par la base (Store) n'est vu qu'au bout de la minute.
    store.db.prepare(`UPDATE cards SET degraded = 1 WHERE id = ?`).run(rows[5]!.id);
    expect(weekTop(store.db, { now: NOW + RANK_CACHE_MS - 1 }).total).toBe(6);
    expect(weekTop(store.db, { now: NOW + RANK_CACHE_MS }).total).toBe(5);
    expect(rankings()).toBe(2);
    vi.restoreAllMocks();
  });

  it("chaque semaine a son classement", () => {
    const store = newStore();
    const old = gh("old", 60, W45 + H);
    store.insertCards([old, gh("new", 70, W46 + H)]);
    const rankings = countRankings(store);
    expect(weekTop(store.db, { now: NOW }).entries.map((e) => e.login)).toEqual(["new"]);
    expect(weekRank(store.db, old.id, NOW)).toMatchObject({ rank: 1, total: 1, week: 45, closed: true });
    expect(weekTop(store.db, { now: NOW }).entries.map((e) => e.login)).toEqual(["new"]);
    expect(rankings()).toBe(2);
    vi.restoreAllMocks();
  });

  it("oublié dès qu'une fiche naît, est supprimée ou purgée, ou qu'un login est masqué ou rendu visible", () => {
    const store = newStore();
    const a = gh("lea", 80, W46 + H);
    const b = gh("kevin", 70, W46 + 2 * H);
    store.insertCards([a, b]);
    const logins = () => weekTop(store.db, { now: NOW }).entries.map((e) => e.login);
    expect(logins()).toEqual(["lea", "kevin"]);

    // Une fiche née lit son rang tout de suite.
    const c = gh("sam", 90, W46 + 3 * H);
    store.insertCards([c]);
    expect(weekRank(store.db, c.id, NOW)?.rank).toBe(1);
    expect(logins()).toEqual(["sam", "lea", "kevin"]);

    store.deleteGroup(c.id);
    expect(logins()).toEqual(["lea", "kevin"]);

    store.claimOwner("lea", 4242);
    store.setOwnerHidden("lea", true);
    expect(logins()).toEqual(["kevin"]);
    expect(weekRank(store.db, a.id, NOW)).toBeNull();
    store.setOwnerHidden("lea", false);
    expect(logins()).toEqual(["lea", "kevin"]);

    // Purge : la fiche expirée sort du classement de sa semaine sans attendre.
    const later = W46 + 2 * H + RETENTION_MS - 1;
    expect(weekRank(store.db, b.id, later)?.total).toBe(2);
    expect(store.purgeExpired(later + 2)).toEqual([b.id]);
    expect(weekRank(store.db, a.id, later + 3)?.total).toBe(1);
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

/** `n` logins de plus, notés bas, pour atteindre le seuil de la spéciale. */
function crowd(prefix: string, n: number, at: number): NewCardRow[] {
  return Array.from({ length: n }, (_, i) => gh(`${prefix}${i}`, 10, at));
}

describe("withWeekSpecial", () => {
  it(`seuil : ${TOTW_MIN_ENTRIES} logins classés dans la semaine, sinon pas de spéciale`, () => {
    const store = newStore();
    const first = gh("first", 90, W46 + H);
    store.insertCards([first, ...crowd("c", TOTW_MIN_ENTRIES - 2, W46 + H)]);
    const read = (now: number) => withWeekSpecial(store.db, store.getCard(first.id)!.data as CardData, now);
    // 19 classés : le rang reste, la spéciale non.
    expect(read(NOW).week).toMatchObject({ rank: 1, total: 19, inTop5: true });
    expect(read(NOW).data.special).toBeUndefined();
    // 20 classés : la spéciale.
    store.insertCards(crowd("d", 1, W46 + 2 * H));
    expect(read(NOW).week!.total).toBe(20);
    expect(read(NOW).data.special).toBe("totw");
    // Semaine close : son total final compte, une fiche de la semaine suivante n'y change rien.
    store.insertCards([gh("next", 99, W46 + 8 * DAY)]);
    expect(read(NOW + 10 * DAY).data.special).toBe("totw");
  });

  it("semaine close sous le seuil : jamais de spéciale", () => {
    const store = newStore();
    const first = gh("solo", 90, W45 + H);
    store.insertCards([first, ...crowd("p", TOTW_MIN_ENTRIES - 2, W45 + H), ...crowd("q", 5, W46 + H)]);
    const out = withWeekSpecial(store.db, store.getCard(first.id)!.data as CardData, NOW);
    expect(out.week).toMatchObject({ total: 19, closed: true, inTop5: true });
    expect(out.data.special).toBeUndefined();
  });

  it("pose « Top 5 de la semaine » sur la fiche classée du top 5, jamais ailleurs", () => {
    const store = newStore();
    const rows = [90, 85, 81, 80, 79, 78].map((n, i) => gh(`s${i}`, n, W46 + H));
    const lower = gh("s0", 60, W46 + 2 * H); // même login que le 1er, fiche moins bonne
    const kid = gh("kid", 95, W46 + H, {}, { special: "wonderkid" });
    store.insertCards([...rows, lower, kid, ...crowd("f", TOTW_MIN_ENTRIES - 7, W46 + H)]);
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

  it("sur un dossier, le rang est celui de sa note, et la spéciale se pose sur sa pièce GitHub", () => {
    const store = newStore();
    const rows = dossier("cmp00002", "pair", 80, W46 + H);
    store.insertCards([...rows, ...crowd("g", TOTW_MIN_ENTRIES - 1, W46 + H)]);
    const out = withWeekSpecial(store.db, rows[0]!.data as ComparisonData, NOW);
    expect(out.week).toMatchObject({ rank: 1 });
    expect(out.data.github.special).toBe("totw");
    expect(out.data.cv.special).toBeUndefined();
  });
});

describe("fiche née d'une dénonciation", () => {
  it("n'entre au top et ne porte la spéciale qu'une fois son login revendiqué", () => {
    const store = newStore();
    const snitch = gh("delateur", 50, W46 + H);
    const target = gh("cible", 95, W46 + H);
    store.insertCards([snitch, target, ...crowd("n", TOTW_MIN_ENTRIES, W46 + H)]);
    // Avant d'être dénoncée, une fiche ordinaire : elle mène (le classement est gardé 60 s).
    expect(weekTop(store.db, { now: NOW }).entries[0]!.login).toBe("cible");
    store.markDenounced(target.id, snitch.id, null);
    const read = () => withWeekSpecial(store.db, store.getCard(target.id)!.data as CardData, NOW);
    // Dénoncée, non revendiquée : hors du top dès la lecture suivante, ni rang ni spéciale.
    expect(weekTop(store.db, { now: NOW }).entries.map((e) => e.login)).not.toContain("cible");
    expect(weekTop(store.db, { now: NOW }).total).toBe(TOTW_MIN_ENTRIES + 1);
    expect(weekRank(store.db, target.id, NOW)).toBeNull();
    expect(read().data.special).toBeUndefined();
    expect(read().week).toBeNull();
    // Les fiches ordinaires ne changent pas.
    expect(weekRank(store.db, snitch.id, NOW)).toMatchObject({ rank: 1 });
    // Revendiquée : elle entre, en tête, avec la spéciale.
    store.claimOwner("cible", 4242);
    expect(weekTop(store.db, { now: NOW }).entries[0]).toMatchObject({ login: "cible", cardId: target.id });
    expect(weekRank(store.db, target.id, NOW)).toMatchObject({ rank: 1, inTop5: true });
    expect(read().data.special).toBe("totw");
  });

  it("une fiche déjà faite, dénoncée ensuite par un tiers, garde sa place", () => {
    const store = newStore();
    const snitch = gh("delateur3", 50, W46 + H);
    const own = gh("cible3", 95, W46 + H);
    store.insertCards([snitch, own, ...crowd("p", TOTW_MIN_ENTRIES, W46 + H)]);
    expect(weekRank(store.db, own.id, NOW)).toMatchObject({ rank: 1, inTop5: true });
    store.markDenounced(own.id, snitch.id, null, false);
    expect(store.getCard(own.id)).toMatchObject({ denouncedBy: snitch.id, denounceBorn: false });
    expect(weekTop(store.db, { now: NOW }).entries[0]).toMatchObject({ login: "cible3", cardId: own.id });
    expect(weekRank(store.db, own.id, NOW)).toMatchObject({ rank: 1, inTop5: true });
    expect(withWeekSpecial(store.db, store.getCard(own.id)!.data as CardData, NOW).data.special).toBe("totw");
  });

  it("une autre fiche du même login, faite par lui, garde sa place", () => {
    const store = newStore();
    const own = gh("cible2", 70, W46 + H);
    const denounced = gh("cible2", 90, W46 + 2 * H);
    store.insertCards([own, denounced]);
    store.markDenounced(denounced.id, own.id, null);
    expect(weekTop(store.db, { now: NOW }).entries.map((e) => [e.login, e.cardId])).toEqual([["cible2", own.id]]);
    expect(weekRank(store.db, denounced.id, NOW)).toBeNull();
  });

  it("dossier dénoncé : il attend aussi la revendication, et ne prend pas l'adresse de la fiche que la personne a faite", () => {
    const store = newStore();
    const own = gh("duo", 60, W46);
    store.insertCards([own]);
    const rows = dossier("cmpDenon1", "duo", 88, W46 + H);
    store.insertCards(rows);
    expect(weekRank(store.db, rows[2]!.id, NOW)).toMatchObject({ rank: 1 });
    store.markDenounced("cmpDenon1", "someone01", null);
    // Le dossier fait par un tiers sort ; la fiche de la personne garde sa place et son adresse.
    expect(weekTop(store.db, { now: NOW }).entries.map((e) => [e.cardId, e.overall])).toEqual([[own.id, 60]]);
    expect(weekRank(store.db, "cmpDenon1", NOW)).toBeNull();
    expect(store.fileRow(own.id)!.id).toBe(own.id);
    store.claimOwner("duo", 77);
    expect(weekRank(store.db, rows[2]!.id, NOW)).toMatchObject({ rank: 1 });
    expect(weekTop(store.db, { now: NOW }).entries.map((e) => [e.cardId, e.overall])).toEqual([["cmpDenon1", 88]]);
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
    store.insertCards([...rows, ...crowd("h", TOTW_MIN_ENTRIES - 6, now - 2000)]);
    const top = (await (await app.request(`/api/card/${rows[0]!.id}`)).json()) as Extract<JobState, { state: "done"; kind: "card" }>;
    expect(top.card.special).toBe("totw");
    expect(top.week).toMatchObject({ rank: 1, total: TOTW_MIN_ENTRIES, inTop5: true, gapToTop5: 0, closed: false });
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
    store.insertCards([mine, ...crowd("i", TOTW_MIN_ENTRIES - 1, now - 2000)]);
    let res = await app.request(`/og/${mine.id}.png`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=300");
    expect(renders).toEqual(["og:totw"]); // 1er sur 20 : top 5
    expect(readdirSync(ogDir)).toEqual([`${mine.id}-totw.png`]);
    // Cinq fiches meilleures arrivent : la spéciale part, une autre image est rendue.
    store.insertCards([91, 92, 93, 94, 95].map((n, i) => gh(`top${i}`, n, now - 500)));
    res = await app.request(`/og/${mine.id}.png`);
    expect(renders).toEqual(["og:totw", "og:-"]);
    expect(readdirSync(ogDir).sort()).toEqual([`${mine.id}-totw.png`, `${mine.id}.png`].sort());
    // Page /c/:id : l'image de partage d'une fiche du top 5 a sa propre adresse.
    const html = await (await app.request(`/c/${store.getCard(weekTop(store.db).entries[0]!.cardId!)!.id}`)).text();
    expect(html).toContain("?v=10&amp;s=totw");
    expect(html).toContain("Top 5 de la semaine");
  });

  it("/og : semaine close, l'image ne bouge plus, cache long", async () => {
    const { app, store, renders } = setup();
    const old = gh("past", 70, weekStart(Date.now()) - 2 * DAY);
    store.insertCards([old, ...crowd("j", TOTW_MIN_ENTRIES - 1, weekStart(Date.now()) - 2 * DAY)]);
    const res = await app.request(`/og/${old.id}-portrait.png`);
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(renders).toEqual(["portrait:totw"]);
  });
});
