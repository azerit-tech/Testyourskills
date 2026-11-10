// La couverture de l'accueil (§18.31) : rendu en chaîne, sans navigateur.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FIXTURES } from "../../../shared/fixtures";
import type { TopEntry, WeekTop } from "../../../shared/types";
import { LangProvider } from "../i18n";
import { DESKTOP, PHONE, SCENE_LIGHT, SCENE_POOL, SLOTS, bigAvatar, coverPanels, neighbours, slotsIn } from "../lib/cover";
import type { Layout, Panel } from "../lib/cover";
import { SUSPECTS } from "../lib/suspects";
import { Cover } from "./Cover";

const founder = { card: FIXTURES.jmougeot, href: "/jmougeot" };

const entry = (rank: number, login: string): TopEntry => ({ rank, cardId: `c-${login}`, login, avatarUrl: `https://github.com/${login}.png?size=64`, overall: 90 - rank, stars: 5 });
const TOP5 = [entry(1, "alice"), entry(2, "bob"), entry(3, "carol"), entry(4, "dan"), entry(5, "eve")];
const week = (entries: TopEntry[]): WeekTop => ({ weekStart: 0, endsAt: 1, week: 46, total: entries.length, entries });

function render(props: { top: WeekTop | null | undefined; suspects?: string[] }, language = "fr-FR"): string {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
  vi.stubGlobal("navigator", { language });
  return renderToStaticMarkup(createElement(LangProvider, null, createElement(Cover, { onPlay: () => undefined, founder, suspects: [], ...props })));
}

/** Les cases rendues, dans l'ordre du document : leur zone et leur balise ouvrante. */
const panels = (html: string) => [...html.matchAll(/<(div|a|button)[^>]*class="cover-panel[^"]*"[^>]*>/g)].map((m) => ({ tag: m[1], html: m[0], area: /grid-area:([a-z0-9]+)/.exec(m[0])?.[1] }));

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

  it("suspects d'abord, puis le top, la place libre toujours en dernier", () => {
    const html = render({ top: week(TOP5), suspects: ["arsonist", "forger"] });
    const ps = panels(html);
    const byArea = new Map(ps.map((p) => [p.area, p]));
    expect(byArea.get("f1")?.html).toContain('data-suspect="arsonist"');
    expect(byArea.get("f2")?.html).toContain('data-suspect="forger"');
    expect(byArea.get("f3")?.html).toContain('href="/c/c-alice"');
    expect(byArea.get("fr")?.tag).toBe("button");
    expect(html).toContain('srcSet="/characters/arsonist-s.jpg 384w, /characters/arsonist.jpg 768w"');
  });

  it("sans suspect, aucun portrait ; chaque suspect déclaré a ses deux fichiers", () => {
    expect(render({ top: null })).not.toContain("/characters/");
    const dir = fileURLToPath(new URL("../../public/characters/", import.meta.url));
    for (const id of SUSPECTS) {
      expect(existsSync(`${dir}${id}.jpg`), `${id}.jpg`).toBe(true);
      expect(existsSync(`${dir}${id}-s.jpg`), `${id}-s.jpg`).toBe(true);
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
      for (const suspects of [[], ["arsonist"], ["arsonist", "forger", "kingpin"]]) {
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
