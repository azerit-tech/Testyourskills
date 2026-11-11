// La couverture de l'accueil (§18.31) : rendu en chaîne, sans navigateur.
import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FIXTURES } from "../../../shared/fixtures";
import type { TopEntry, WeekTop } from "../../../shared/types";
import { LangProvider } from "../i18n";
import profilesJson from "../../../data/profiles.json";
import { CAST_SLOTS, DESKTOP, PHONE, ROTATION_LENGTH, SCENE_LIGHT, SCENE_POOL, SLOTS, bigAvatar, castFor, coverPanels, fits, lightOf, neighbours, pickSeed, slotsIn } from "../lib/cover";
import type { Layout, Panel } from "../lib/cover";
import { SUSPECTS } from "../lib/suspects";
import { Cover } from "./Cover";

const founder = { card: FIXTURES.jmougeot, href: "/jmougeot" };

const entry = (rank: number, login: string): TopEntry => ({ rank, cardId: `c-${login}`, login, avatarUrl: `https://github.com/${login}.png?size=64`, overall: 90 - rank, stars: 5 });
const TOP5 = [entry(1, "alice"), entry(2, "bob"), entry(3, "carol"), entry(4, "dan"), entry(5, "eve")];
const week = (entries: TopEntry[]): WeekTop => ({ weekStart: 0, endsAt: 1, week: 46, total: entries.length, entries });

function render(props: { top: WeekTop | null | undefined; suspects?: string[]; seed?: number }, language = "fr-FR"): string {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
  vi.stubGlobal("navigator", { language });
  return renderToStaticMarkup(createElement(LangProvider, null, createElement(Cover, { onPlay: () => undefined, founder, suspects: [], ...props })));
}

/** Les cases rendues, dans l'ordre du document : leur zone et leur balise ouvrante. */
const panels = (html: string) => [...html.matchAll(/<(div|a|button)[^>]*class="cover-panel[^"]*"[^>]*>/g)].map((m) => ({ tag: m[1], html: m[0], area: /grid-area:([a-z0-9]+)/.exec(m[0])?.[1] }));

/** Largeur et hauteur d'un JPEG, lues dans son en-tête de trame (SOF). */
function jpegSize(path: string): [number, number] {
  const b = readFileSync(path);
  for (let i = 2; i + 9 < b.length; ) {
    if (b[i] !== 0xff) throw new Error(`${path} : marqueur attendu`);
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + b.readUInt16BE(i + 2);
  }
  throw new Error(`${path} : pas de trame`);
}

const faceSlots = SLOTS.filter((s) => s.kind === "face").map((s) => s.id);
const isFace = (p: Panel) => p.kind !== "scene";

afterEach(() => vi.unstubAllGlobals());

describe("couverture (§18.31)", () => {
  it("grilles sans trou, irrégulières, la place libre visible partout", () => {
    for (const l of [PHONE, DESKTOP]) {
      const ids = slotsIn(l);
      for (const r of l.rows) expect(r.split(" ")).toHaveLength(l.cols.length);
      expect(ids.has(".")).toBe(false);
      expect(ids.has("fr")).toBe(true);
      // irrégulière : pas deux lignes identiques, pas toutes les colonnes égales
      expect(new Set(l.rows).size).toBe(l.rows.length);
      expect(new Set(l.cols).size).toBeGreaterThan(1);
      for (const id of ids) expect(SLOTS.some((s) => s.id === id)).toBe(true);
    }
    expect(slotsIn(PHONE).size).toBe(5);
    expect(slotsIn(DESKTOP).size).toBe(8);
    expect([...slotsIn(PHONE)].filter((id) => faceSlots.includes(id)).length).toBeGreaterThanOrEqual(2);
    expect([...slotsIn(DESKTOP)].filter((id) => faceSlots.includes(id)).length).toBeGreaterThanOrEqual(3);
  });

  it("chaque décor existe en deux tailles et porte sa lumière", () => {
    expect(new Set(SCENE_POOL)).toEqual(new Set(Object.keys(SCENE_LIGHT)));
    for (const id of SCENE_POOL) {
      expect(existsSync(`web/public/profiles/${id}.jpg`)).toBe(true);
      expect(existsSync(`web/public/profiles/${id}-s.jpg`)).toBe(true);
    }
  });

  it("sans top ni suspect : la fiche de Jacques, la place libre, des décors ailleurs", () => {
    const html = render({ top: null });
    const ps = panels(html);
    expect(ps).toHaveLength(SLOTS.length);
    expect(ps.filter((p) => p.tag === "a")).toHaveLength(1);
    expect(ps[0].html).toContain('href="/jmougeot"');
    expect(ps[0].html).toContain(`aria-label="La vraie fiche de Jacques, fondateur d&#x27;Azerit"`);
    const free = ps.filter((p) => p.tag === "button");
    expect(free).toHaveLength(1);
    expect(free[0].area).toBe("fr");
    expect(free[0].html).toContain('aria-label="Ta place : ouvre ton dossier"');
    // le reste : des décors, jamais une case vide
    const scenes = ps.filter((p) => p.tag === "div");
    expect(scenes).toHaveLength(SLOTS.length - 2);
    for (const s of scenes) expect(s.html).toMatch(/data-scene="[a-z_]+"/);
    expect(html).not.toContain("cover-wait");
  });

  it("top de 5 : les premiers par rang, chacun vers sa fiche ; la place libre reste la dernière", () => {
    const html = render({ top: week([...TOP5].reverse()) });
    const links = panels(html).filter((p) => p.tag === "a");
    expect(links.map((p) => /href="([^"]+)"/.exec(p.html)?.[1])).toEqual(["/c/c-alice", "/c/c-bob", "/c/c-carol"]);
    expect(links.map((p) => p.area)).toEqual(["f1", "f2", "f3"]);
    expect(links[0].html).toContain('aria-label="@alice, n° 1 de la semaine"');
    expect(html).not.toContain('href="/jmougeot"');
    const faces = panels(html).filter((p) => p.tag !== "div");
    expect(faces[faces.length - 1].tag).toBe("button");
    // la plaque de la photo d'identité, sans flash
    expect(html).toContain("@ALICE");
    expect(html).not.toContain("load-flash");
  });

  it("anglais : le rang en toutes lettres pour les lecteurs d'écran", () => {
    const html = render({ top: week(TOP5.slice(0, 1)) }, "en-US");
    expect(html).toContain('aria-label="@alice, #1 this week"');
    expect(html).toContain('aria-label="Your spot: open your file"');
    expect(html).toContain('aria-label="The real sheet of Jacques, Azerit&#x27;s founder"');
  });

  it("la graine tire la distribution ; les visages restent au top, la place libre en dernier", () => {
    for (let seed = 0; seed < ROTATION_LENGTH; seed++) {
      const cast = castFor(SUSPECTS, seed);
      const html = render({ top: week(TOP5), suspects: SUSPECTS, seed });
      const byArea = new Map(panels(html).map((p) => [p.area, p]));
      for (const slot of CAST_SLOTS) {
        const id = cast[slot];
        if (id) expect(byArea.get(slot)?.html, `${seed} ${slot}`).toContain(`data-suspect="${id}"`);
        else expect(byArea.get(slot)?.html, `${seed} ${slot}`).toMatch(/data-scene="[a-z_]+"/);
      }
      expect(byArea.get("f1")?.html).toContain("data-suspect=");
      expect(byArea.get("s2")?.html).toContain("data-suspect=");
      expect(byArea.get("f2")?.html).toContain('href="/c/c-alice"');
      expect(byArea.get("f3")?.html).toContain('href="/c/c-bob"');
      expect(byArea.get("fr")?.tag).toBe("button");
    }
  });

  it("même graine, même couverture ; le top qui arrive ne déplace ni les suspects ni les décors", () => {
    for (let seed = 0; seed < 3 * ROTATION_LENGTH; seed += 7) {
      for (const top of [undefined, null, TOP5.slice(0, 1), TOP5])
        expect(coverPanels({ suspects: SUSPECTS, top, founder, seed })).toEqual(coverPanels({ suspects: SUSPECTS, top, founder, seed }));
      const wait = coverPanels({ suspects: SUSPECTS, top: undefined, founder, seed });
      expect([wait.get("f2")?.kind, wait.get("f3")?.kind]).toEqual(["wait", "wait"]);
      for (const top of [null, TOP5.slice(0, 1), TOP5]) {
        const ps = coverPanels({ suspects: SUSPECTS, top, founder, seed });
        for (const [id, p] of wait) if (p.kind === "suspect" || p.kind === "scene") expect(ps.get(id), `${seed} ${id}`).toEqual(p);
      }
      // sans top : la fiche de Jacques en f2, et f3 à un suspect de plus quand la règle le permet
      const none = coverPanels({ suspects: SUSPECTS, top: null, founder, seed });
      expect(none.get("f2")?.kind).toBe("founder");
      expect(["suspect", "scene"]).toContain(none.get("f3")?.kind);
    }
    expect(render({ top: week(TOP5), suspects: SUSPECTS, seed: 12 })).toBe(render({ top: week(TOP5), suspects: SUSPECTS, seed: 12 }));
  });

  it("la graine : ?cover=<n> en développement et en démo, sinon tirée", () => {
    expect(pickSeed("?cover=17", true)).toBe(17);
    expect(pickSeed("?mock=1&cover=3", true)).toBe(3);
    expect(pickSeed("?cover=17", false, () => 0.5)).toBe(ROTATION_LENGTH * 500);
    expect(pickSeed("?cover=abc", true, () => 0)).toBe(0);
    expect(pickSeed("", true, () => 0.999999)).toBeLessThan(ROTATION_LENGTH * 1000);
  });

  it("un portrait : son rôle en texte de remplacement, en français et en anglais, sans genre", () => {
    const label = (id: string, lang: "fr" | "en") => profilesJson.profiles.find((p) => p.id === id)!.label[lang];
    for (const seed of [0, 1, 2]) {
      const cast = Object.values(castFor(SUSPECTS, seed)) as string[];
      const fr = render({ top: week(TOP5), suspects: SUSPECTS, seed });
      for (const id of cast) expect(fr).toContain(`alt="Portrait peint du profil ${label(id, "fr")}"`);
      const en = render({ top: week(TOP5), suspects: SUSPECTS, seed }, "en-US");
      for (const id of cast) expect(en).toContain(`alt="Painted portrait of the ${label(id, "en")} profile"`);
      // la case d'un portrait n'est pas cachée aux lecteurs d'écran, celle d'un décor l'est
      for (const p of panels(en)) if (p.html.includes("data-suspect")) expect(p.html).not.toContain("aria-hidden");
      for (const p of panels(en)) if (p.html.includes("data-scene")) expect(p.html).toContain("aria-hidden");
    }
    const fr = render({ top: null, suspects: SUSPECTS, seed: 0 });
    expect(fr).toMatch(/alt="Portrait peint du profil (Pyromane|Faussaire|Légende du milieu|Cerveau|Oiseau de nuit|Jeune pousse)"/);
  });

  it("sans suspect, aucun portrait ; les six suspects déclarés ont leurs deux fichiers, au bon poids", () => {
    expect(render({ top: null })).not.toContain("/characters/");
    expect([...SUSPECTS].sort()).toEqual(["arsonist", "forger", "fresh_blood", "kingpin", "mastermind", "night_owl"]);
    const dir = fileURLToPath(new URL("../../public/characters/", import.meta.url));
    for (const id of SUSPECTS) {
      expect(existsSync(`${dir}${id}.jpg`), `${id}.jpg`).toBe(true);
      expect(existsSync(`${dir}${id}-s.jpg`), `${id}-s.jpg`).toBe(true);
      expect(jpegSize(`${dir}${id}.jpg`), `${id}.jpg`).toEqual([768, 1152]);
      expect(jpegSize(`${dir}${id}-s.jpg`), `${id}-s.jpg`).toEqual([384, 576]);
      expect(statSync(`${dir}${id}.jpg`).size, `${id}.jpg`).toBeLessThan(200_000);
      expect(statSync(`${dir}${id}-s.jpg`).size, `${id}-s.jpg`).toBeLessThan(65_000);
    }
  });

  it("top en attente : les cases de visage restent prunes, la place libre est déjà là", () => {
    const html = render({ top: undefined });
    const ps = panels(html);
    expect(ps.filter((p) => p.html.includes("cover-wait")).map((p) => p.area)).toEqual(["f1", "f2", "f3"]);
    expect(ps.find((p) => p.area === "fr")?.tag).toBe("button");
  });

  it("images : premier rang tout de suite, la plus grande en priorité, le reste paresseux", () => {
    const html = render({ top: null });
    const ps = panels(html);
    const img = (area: string) => {
      const i = html.indexOf(ps.find((p) => p.area === area)!.html);
      return /<img[^>]*>/.exec(html.slice(i))![0];
    };
    expect(img("s1").toLowerCase()).toContain('fetchpriority="high"');
    expect(img("s1")).not.toContain("loading=");
    expect(img("s2")).not.toContain("loading=");
    expect(img("s3")).toContain('loading="lazy"');
    expect(img("s4")).toContain('loading="lazy"');
    // au premier rang sur ordinateur, mais cachée sur téléphone : paresseuse, donc jamais chargée là
    expect(img("f2")).toContain('loading="lazy"');
    expect(img("s1")).toContain('alt=""');
    expect(img("s1")).toMatch(/srcSet="\/profiles\/[a-z_]+-s\.jpg 576w, \/profiles\/[a-z_]+\.jpg 1152w"/);
    expect(img("s1")).toMatch(/sizes="\(min-width: 900px\) \d+px, \d+vw"/);
  });

  it("portraits : ceux de f1 et s2 tout de suite, ceux de l'ordinateur seul paresseux", () => {
    for (let seed = 0; seed < ROTATION_LENGTH; seed++)
      for (const top of [null, week([]), week(TOP5)]) {
        const html = render({ top, suspects: SUSPECTS, seed });
        for (const p of panels(html)) {
          const id = /data-suspect="([a-z_]+)"/.exec(p.html)?.[1];
          if (!id) continue;
          const img = /<img[^>]*>/.exec(html.slice(html.indexOf(p.html)))![0];
          if (p.area === "f1" || p.area === "s2") expect(img, `${seed} ${p.area}`).not.toContain("loading=");
          else expect(img, `${seed} ${p.area}`).toContain('loading="lazy"');
          expect(img).toContain(`srcSet="/characters/${id}-s.jpg 384w, /characters/${id}.jpg 768w"`);
          expect(img).toContain('width="768" height="1152"');
        }
      }
  });

  it("chaque graine : une couverture qui tient la règle, sur téléphone et sur ordinateur, quel que soit le top", () => {
    // la série entière et chacun de ses débuts ; les graines de deux tours du cycle
    for (let k = 0; k <= SUSPECTS.length; k++)
      for (let seed = 0; seed < 2 * ROTATION_LENGTH; seed += k === SUSPECTS.length ? 1 : 5)
        for (const top of [undefined, null, ...[0, 1, 2, 3, 5].map((n) => TOP5.slice(0, n))]) {
          const suspects = SUSPECTS.slice(0, k);
          const ps = coverPanels({ suspects, top, founder, seed });
          const where = `${suspects.join(",")} #${seed} top ${top?.length}`;
          expect(ps.size, where).toBe(SLOTS.length);
          for (const l of [PHONE, DESKTOP])
            for (const [a, ns] of neighbours(l))
              for (const b of ns) {
                const la = lightOf(ps.get(a));
                if (la) expect(la, `${where} ${a}/${b}`).not.toBe(lightOf(ps.get(b)));
              }
          // un portrait n'a jamais son propre décor à côté, ni ailleurs ; aucun doublon
          const scenes = [...ps.values()].flatMap((p) => (p.kind === "scene" ? [p.scene] : []));
          const cast = [...ps].flatMap(([slot, p]) => (p.kind === "suspect" ? [[slot, p.id]] : []));
          expect(new Set(scenes).size).toBe(scenes.length);
          expect(new Set(cast.map((c) => c[1])).size).toBe(cast.length);
          for (const [slot, id] of cast) {
            expect(scenes).not.toContain(id);
            expect(fits(id, slot), `${where} ${id} dans ${slot}`).toBe(true);
          }
          // le top et la fiche de Jacques gardent leurs visages, la place libre reste
          expect(ps.get("fr")?.kind).toBe("free");
          if (k > 0 && top && top.length >= 2) expect([ps.get("f2")?.kind, ps.get("f3")?.kind]).toEqual(["player", "player"]);
          if (k > 0 && top && top.length === 1) expect([ps.get("f2")?.kind, ps.get("f3")?.kind]).toEqual(["player", "founder"]);
          if ((top === null || top?.length === 0) && k > 0) expect(ps.get("f2")?.kind).toBe("founder");
          if ((top === null || top?.length === 0) && k === 0) expect(ps.get("f1")?.kind).toBe("founder");
          if (k >= 2) expect([ps.get("f1")?.kind, ps.get("s2")?.kind]).toEqual(["suspect", "suspect"]);
        }
  });

  it("au fil des visites, chaque portrait est vu à peu près autant, sur téléphone comme sur ordinateur", () => {
    const phone = new Map<string, number>();
    const desk = new Map<string, number>();
    const tiles = new Set<string>();
    for (let seed = 0; seed < ROTATION_LENGTH; seed++)
      for (const [slot, p] of coverPanels({ suspects: SUSPECTS, top: TOP5, founder, seed })) {
        if (p.kind !== "suspect") continue;
        tiles.add(`${p.id}|${slot}`);
        desk.set(p.id, (desk.get(p.id) ?? 0) + 1);
        if (slotsIn(PHONE).has(slot)) phone.set(p.id, (phone.get(p.id) ?? 0) + 1);
      }
    for (const id of SUSPECTS) {
      // chacun sur au moins 30 % des visites au téléphone, entre 35 et 55 % sur ordinateur
      expect(phone.get(id) ?? 0, `${id} téléphone`).toBeGreaterThanOrEqual(0.3 * ROTATION_LENGTH);
      expect(phone.get(id) ?? 0, `${id} téléphone`).toBeLessThanOrEqual(0.4 * ROTATION_LENGTH);
      expect(desk.get(id) ?? 0, `${id} ordinateur`).toBeGreaterThanOrEqual(0.35 * ROTATION_LENGTH);
      expect(desk.get(id) ?? 0, `${id} ordinateur`).toBeLessThanOrEqual(0.55 * ROTATION_LENGTH);
      // chacun passe par la grande case
      expect(tiles.has(`${id}|f1`), `${id} dans f1`).toBe(true);
    }
    // et dans chaque case où il tient, sauf quand la lumière l'interdit (la seule aube part avec la Jeune pousse)
    for (const id of SUSPECTS) for (const slot of CAST_SLOTS) if (fits(id, slot) && id !== "fresh_blood") expect(tiles.has(`${id}|${slot}`), `${id} dans ${slot}`).toBe(true);
    // sans top, f3 voit passer un suspect de plus. Jamais la Jeune pousse ni la Légende du
    // milieu : f3 touche s1 et s3, qui prennent déjà les deux lumières que f1 et s2 laissent ;
    // l'aube et le rose n'ont chacune qu'un portrait, il ne peut pas être déjà en f1 ou s2
    const f3 = new Set<string>();
    for (let seed = 0; seed < 6 * ROTATION_LENGTH; seed++) {
      const p = coverPanels({ suspects: SUSPECTS, top: null, founder, seed }).get("f3");
      if (p?.kind === "suspect") f3.add(p.id);
    }
    expect([...f3].sort()).toEqual(["arsonist", "forger", "mastermind", "night_owl"]);
  });

  it("deux décors voisins n'ont jamais la même lumière, sur téléphone comme sur ordinateur", () => {
    const check = (l: Layout, ps: Map<string, Panel>) => {
      for (const [a, ns] of neighbours(l))
        for (const b of ns) {
          const pa = ps.get(a)!;
          const pb = ps.get(b)!;
          if (pa.kind === "scene" && pb.kind === "scene") expect(SCENE_LIGHT[pa.scene], `${a}/${b}`).not.toBe(SCENE_LIGHT[pb.scene]);
        }
    };
    for (let n = 0; n <= 5; n++)
      for (const suspects of [[], ["arsonist"], ["arsonist", "forger", "kingpin"], SUSPECTS]) {
        const ps = coverPanels({ suspects, top: TOP5.slice(0, n), founder });
        const scenes = [...ps.values()].filter((p): p is Extract<Panel, { kind: "scene" }> => p.kind === "scene").map((p) => p.scene);
        expect(new Set(scenes).size).toBe(scenes.length);
        // le décor d'un suspect affiché ne revient pas dans une autre case
        for (const p of ps.values()) if (p.kind === "suspect") expect(scenes).not.toContain(p.id);
        check(PHONE, ps);
        check(DESKTOP, ps);
        // la dernière case de visage est la place libre
        expect(ps.get(faceSlots[faceSlots.length - 1])?.kind).toBe("free");
        expect([...ps.values()].filter((p) => p.kind === "free")).toHaveLength(1);
        expect([...ps.values()].filter(isFace).length).toBeGreaterThanOrEqual(2);
      }
  });

  it("avatars GitHub en grand, les autres adresses intactes", () => {
    expect(bigAvatar("https://github.com/alice.png?size=64")).toBe("https://github.com/alice.png?size=280");
    expect(bigAvatar("https://avatars.githubusercontent.com/u/1?v=4")).toBe("https://avatars.githubusercontent.com/u/1?v=4&s=280");
    expect(bigAvatar("/jmougeot-linkedin.jpg")).toBe("/jmougeot-linkedin.jpg");
    expect(bigAvatar(undefined)).toBeNull();
  });
});
