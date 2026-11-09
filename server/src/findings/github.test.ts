import { describe, expect, it } from "vitest";
import type { Finding } from "../../../shared/types";
import type { CommitFact, GithubFacts } from "../github/facts";
import { daysAgo, facts, repo, NOW } from "../scoring/__fixtures__/make";
import gaearon from "../scoring/__fixtures__/gaearon.facts.json";
import { CARD_MAX, forReveal, githubFindings, REVEAL_MAX, strongest } from "./index";

const NB = " ";
const DAY = 86_400_000;
/** Les attentes s'écrivent avec des espaces simples avant « : » et dans les guillemets ; le texte a des insécables. */
const plain = (s: string) => s.replace(/ ([:;!?»])/g, " $1").replace(/« /g, "« ");

const commit = (i: number, date: string, message = `Add feature number ${i} with a decent message`, repoName = "react-thing"): CommitFact => ({
  repo: repoName,
  oid: (i + 1).toString(16).padStart(40, "0"),
  message,
  date,
});

/** Calendrier de 371 jours : tous les dimanches à 3, plus une série de 43 jours qui démarre un mardi. */
function calendarDays(): { start: string; counts: number[] } {
  const start = new Date(Date.parse(NOW) - 370 * DAY);
  start.setUTCHours(0, 0, 0, 0);
  const counts: number[] = Array.from({ length: 371 }, (_, i) => (new Date(start.getTime() + i * DAY).getUTCDay() === 0 ? 3 : 0));
  let from = 100;
  while (new Date(start.getTime() + from * DAY).getUTCDay() !== 2) from++;
  for (let i = from; i < from + 43; i++) counts[i] = Math.max(1, counts[i]!);
  return { start: start.toISOString().slice(0, 10), counts };
}

/** Un dossier qui déclenche chaque type de trouvaille GitHub. */
function rich(p: Partial<GithubFacts> = {}): GithubFacts {
  const repos = [
    repo("react-thing", { stars: 1240, pushedAt: daysAgo(3) }),
    repo("api-server", { pushedAt: daysAgo(20) }),
    repo("todo-app-v3", { language: "PHP", languages: { PHP: 9000 }, createdAt: "2018-02-01T10:00:00Z", pushedAt: "2018-02-01T12:00:00Z" }),
    repo("php-blog", { language: "PHP", languages: { PHP: 20000 }, createdAt: "2017-05-01T10:00:00Z", pushedAt: "2019-06-02T10:00:00Z" }),
    repo("hello-1", { createdAt: daysAgo(500), pushedAt: daysAgo(500) }),
    repo("hello-2", { createdAt: daysAgo(400), pushedAt: daysAgo(400) }),
  ];
  const commits: CommitFact[] = [
    // 30 commits à 22 h 30 (heure de Paris, UTC+1), un mercredi
    ...Array.from({ length: 30 }, (_, i) => commit(i, "2026-10-07T21:30:00Z")),
    // un commit à 3 h 52 du matin
    commit(30, "2026-10-08T02:52:00Z", "Handle the cache invalidation edge case", "api-server"),
    // 6 commits un vendredi à 19 h 15, dont cinq « fix »
    ...Array.from({ length: 5 }, (_, i) => commit(31 + i, `2026-10-09T18:1${i}:00Z`, i % 2 ? "Fix" : "fix ")),
    commit(36, "2026-10-09T18:30:00Z"),
    // le reste, sage, à 10 h
    ...Array.from({ length: 13 }, (_, i) => commit(37 + i, "2026-10-06T09:00:00Z")),
  ];
  return facts({
    repos,
    activeRepos: ["react-thing", "api-server"],
    commits,
    utcOffsetMinutes: 60,
    externalMergedPRs: 38,
    calendar: { available: true, weeksActive: 30, weeks: 52, totalContributions: 800, days: calendarDays() },
    firstRealCommit: { repo: "php-blog", date: "2016-03-14T01:47:00Z", oid: "abc1234def", offsetMinutes: 60 },
    accomplices: [{ login: "camille", avatarUrl: "https://avatars.githubusercontent.com/u/9", commits: 214 }],
    ...p,
  });
}

const byKind = (list: Finding[]) => new Map(list.map((f) => [f.kind, f]));

describe("trouvailles GitHub (§18.26), chaque type", () => {
  const all = byKind(githubFindings(rich()));

  it("le plus vieux commit, à l'heure de son propre fuseau, avec sa preuve", () => {
    const f = all.get("first_commit")!;
    expect(plain(f.text.fr)).toBe(`Plus vieux commit retrouvé : 14${NB}mars 2016, à 2${NB}h${NB}47 du matin.`);
    expect(f.text.en).toBe(`Oldest commit on record: March${NB}14, 2016, at 2:47${NB}a.m.`);
    expect(f.proof).toBe("https://github.com/dev/php-blog/commit/abc1234def");
    expect(f.key?.fr).toBe(`14${NB}mars 2016`);
  });

  it("la part des commits de nuit, et le commit le plus nocturne", () => {
    expect(plain(all.get("night_share")!.text.fr)).toBe(`62${NB}% des derniers commits partent entre 22${NB}h et 5${NB}h.`);
    const late = all.get("latest_commit")!;
    expect(plain(late.text.fr)).toBe(`Commit le plus nocturne : 3${NB}h${NB}52 du matin, dans api-server.`);
    expect(late.proof).toMatch(/^https:\/\/github\.com\/dev\/api-server\/commit\/[0-9a-f]{40}$/);
  });

  it("le vendredi soir, le message préféré", () => {
    expect(plain(all.get("friday_evening")!.text.fr)).toBe(`6 commits poussés un vendredi après 18${NB}h.`);
    expect(plain(all.get("lazy_message")!.text.fr)).toBe(`Message de commit préféré : « fix », 5${NB}fois.`);
    expect(all.get("lazy_message")!.text.en).toBe(`Favourite commit message: “fix”, 5${NB}times.`);
  });

  it("le calendrier : dimanche contre lundi, la plus longue série", () => {
    expect(plain(all.get("sunday_over_monday")!.text.fr)).toMatch(/^Le dimanche, plus de contributions que le lundi : \d+ contre 6 sur un an\.$/);
    expect(plain(all.get("longest_streak")!.text.fr)).toBe(`Plus longue série de l'année : 43${NB}jours de contributions d'affilée.`);
  });

  it("les repos : le plus étoilé, l'abandonné, ceux d'un jour, le langage abandonné", () => {
    expect(plain(all.get("top_starred")!.text.fr)).toBe(`Repo le plus étoilé : react-thing, 1${NB}240${NB}étoiles.`);
    expect(all.get("top_starred")!.text.en).toBe(`Most-starred repo: react-thing, 1,240${NB}stars.`);
    expect(plain(all.get("abandoned_repo")!.text.fr)).toBe("Repo abandonné le plus ancien : todo-app-v3, dernier push en 2018.");
    expect(plain(all.get("one_day_repos")!.text.fr)).toBe("3 repos sur 6 n'ont jamais reçu de push après leur premier jour.");
    expect(plain(all.get("dead_language")!.text.fr)).toBe("Langage abandonné : PHP, dernier repo poussé en 2019.");
    expect(all.get("dead_language")!.proof).toBe("https://github.com/dev/php-blog");
  });

  it("le complice, les PR chez les autres, l'âge du compte, le volume", () => {
    expect(plain(all.get("accomplice")!.text.fr)).toBe("Complice principal : @camille, 214 commits sur les mêmes repos.");
    expect(all.get("accomplice")!.proof).toBe("https://github.com/camille");
    expect(plain(all.get("external_prs")!.text.fr)).toBe("38 PR fusionnées dans les repos des autres.");
    expect(all.get("external_prs")!.proof).toContain("https://github.com/search?q=");
    expect(plain(all.get("account_age")!.text.fr)).toMatch(/^Compte GitHub ouvert en .+\s\d{4} : 5 ans de maison\.$/);
    expect(plain(all.get("contributions_year")!.text.fr)).toBe("800 contributions sur les 12 derniers mois.");
  });

  it("matin plutôt que nuit, week-end plutôt que dimanche, jour le plus chargé", () => {
    const early = rich({ commits: Array.from({ length: 40 }, (_, i) => commit(i, i < 10 ? "2026-10-07T05:30:00Z" : "2026-10-07T13:00:00Z")) });
    const got = byKind(githubFindings(early));
    expect(got.has("night_share")).toBe(false);
    expect(plain(got.get("early_bird")!.text.fr)).toBe(`25${NB}% des derniers commits partent avant 8${NB}h du matin.`);

    const start = calendarDays().start;
    const t0 = Date.parse(`${start}T00:00:00Z`);
    const dow = (i: number) => new Date(t0 + i * DAY).getUTCDay();
    const weekend = byKind(githubFindings(rich({ calendar: { available: true, weeksActive: 52, weeks: 52, totalContributions: 900, days: { start, counts: Array.from({ length: 371 }, (_, i) => (dow(i) === 6 ? 5 : dow(i) === 1 ? 4 : 1)) } } })));
    expect(weekend.has("sunday_over_monday")).toBe(false);
    expect(plain(weekend.get("weekend")!.text.fr)).toMatch(/^\d+ % des contributions tombent le week-end\.$/);

    const busy = byKind(githubFindings(rich({ calendar: { available: true, weeksActive: 52, weeks: 52, totalContributions: 900, days: { start, counts: Array.from({ length: 371 }, (_, i) => (dow(i) === 2 ? 4 : dow(i) === 0 ? 0 : 1)) } } })));
    expect(plain(busy.get("busiest_day")!.text.fr)).toMatch(/^Jour le plus chargé : le mardi, \d+ contributions sur un an\.$/);
  });
});

describe("trouvailles GitHub : rien de vide, rien de faux", () => {
  it("un dossier sage ne donne que ce qui est sûr", () => {
    const kinds = githubFindings(facts()).map((f) => f.kind).sort();
    expect(kinds).toEqual(["account_age", "contributions_year", "first_commit"]);
  });

  it("sans le fuseau du commit, le plus vieux commit n'a que sa date", () => {
    const f = byKind(githubFindings(facts())).get("first_commit")!;
    expect(plain(f.text.fr)).toMatch(/^Plus vieux commit retrouvé : \d+(er)? \S+ \d{4}\.$/);
    // sans oid : la preuve est le repo
    expect(f.proof).toBe("https://github.com/dev/a");
  });

  it("sans décalage horaire connu, aucune trouvaille d'heure", () => {
    const kinds = githubFindings(rich({ utcOffsetMinutes: null })).map((f) => f.kind);
    for (const k of ["night_share", "early_bird", "latest_commit", "friday_evening"]) expect(kinds).not.toContain(k);
  });

  it("des faits d'avant le §18.26 (sans jours, oid ni total de complice) ne cassent rien", () => {
    const old = rich({
      calendar: { available: true, weeksActive: 30, weeks: 52, totalContributions: 800 },
      firstRealCommit: { repo: "php-blog", date: "2016-03-14T01:47:00Z" },
      accomplices: [{ login: "camille", avatarUrl: "https://avatars.githubusercontent.com/u/9" }],
    });
    const kinds = githubFindings(old).map((f) => f.kind);
    for (const k of ["longest_streak", "sunday_over_monday", "accomplice"]) expect(kinds).not.toContain(k);
    expect(byKind(githubFindings(old)).get("first_commit")!.proof).toBe("https://github.com/dev/php-blog");
  });

  it("des entrées absurdes rendent une liste vide, sans exception", () => {
    for (const x of [null, undefined, 42, "x", {}, { login: "dev" }, { login: "dev", repos: [], commits: [] }]) {
      expect(githubFindings(x)).toEqual([]);
    }
  });

  it("un message grossier ou bavard n'est jamais cité", () => {
    const commits = Array.from({ length: 40 }, (_, i) => commit(i, "2026-10-07T13:00:00Z", i < 20 ? "merde" : "wip wip wip wip"));
    expect(githubFindings(rich({ commits })).map((f) => f.kind)).not.toContain("lazy_message");
  });

  it("un langage encore présent dans un repo récent n'est pas abandonné", () => {
    const f = rich();
    f.repos[0]!.languages = { TypeScript: 60_000, PHP: 40_000 };
    expect(githubFindings(f).map((x) => x.kind)).not.toContain("dead_language");
  });

  it("chaque trouvaille a un texte, une preuve GitHub, et son chiffre clé dans la phrase", () => {
    for (const f of [...githubFindings(rich()), ...githubFindings(gaearon)]) {
      expect(f.source).toBe("github");
      expect(f.text.fr.length).toBeGreaterThan(10);
      expect(f.text.en.length).toBeGreaterThan(10);
      // assez court pour remplacer le chef d'accusation sans allonger le partage
      expect(f.text.fr.length).toBeLessThanOrEqual(110);
      expect(f.proof).toMatch(/^https:\/\/github\.com\//);
      if (f.key) {
        expect(f.text.fr).toContain(f.key.fr);
        expect(f.text.en).toContain(f.key.en);
      }
      expect(f.score).toBeGreaterThanOrEqual(0);
      expect(f.score).toBeLessThanOrEqual(100);
    }
  });

  it("un vrai dossier (gaearon) donne des trouvailles", () => {
    expect(githubFindings(gaearon).length).toBeGreaterThanOrEqual(4);
  });
});

describe("trouvailles : ton et épicène", () => {
  const texts = [...githubFindings(rich()), ...githubFindings(gaearon), ...githubFindings(facts())].flatMap((f) => [f.text.fr, f.text.en]);

  it("procès-verbal : ni « tu » ni « you », la phrase passe telle quelle dans le partage", () => {
    for (const t of texts) {
      expect(t).not.toMatch(/\b(tu|ton|ta|tes|toi|t')\b/i);
      expect(t).not.toMatch(/\b(you|your)\b/i);
    }
  });

  it("typographie française : aucun « : » ni guillemet ne passe seul à la ligne", () => {
    for (const t of githubFindings(rich()).map((f) => f.text.fr)) {
      expect(t).not.toMatch(/ [:;!?»]|« /);
    }
    expect(byKind(githubFindings(rich())).get("lazy_message")!.text.fr).toContain(`«${NB}fix${NB}»`);
  });

  it("rien ne s'accorde avec la personne", () => {
    for (const t of texts) {
      expect(t).not.toMatch(/\b(seule?s?|passionnée?s?|matinale?s?|acharnée?s?|fou|folle|accro|recherchée?s?|dangereuse?s?)\b/i);
      expect(t).not.toMatch(/\(e\)|·e|\.e\b/);
    }
  });

  it("aucune donnée personnelle hors GitHub public : ni lieu, ni fuseau, ni nom réel", () => {
    for (const t of texts) {
      expect(t).not.toMatch(/UTC|GMT|Paris|Ada|Lovelace|Abramov/);
    }
  });
});

describe("tri et plafonds", () => {
  const f = (kind: string, score: number, source: Finding["source"] = "github"): Finding => ({
    kind,
    source,
    score,
    text: { fr: kind, en: kind },
    proof: "https://github.com/x",
  });

  it("l'attente montre au plus huit trouvailles, de la plus banale à la plus forte", () => {
    const list = githubFindings(rich());
    expect(list.length).toBeGreaterThan(REVEAL_MAX);
    const shown = forReveal(list);
    expect(shown).toHaveLength(REVEAL_MAX);
    const scores = shown.map((x) => x.score);
    expect(scores).toEqual([...scores].sort((a, b) => a - b));
    expect(scores[scores.length - 1]).toBe(Math.max(...list.map((x) => x.score)));
  });

  it("la fiche garde les trois plus fortes, la plus forte d'abord", () => {
    const got = strongest([f("a", 10), f("b", 70), f("c", 40), f("d", 55)]);
    expect(got.map((x) => x.kind)).toEqual(["b", "d", "c"]);
    expect(got).toHaveLength(CARD_MAX);
  });

  it("une autre source s'insère dans la même liste ; un doublon garde le plus fort", () => {
    const shown = forReveal([f("a", 10), f("b", 70), f("linkedin_found", 80, "linkedin"), f("a", 30)]);
    expect(shown.map((x) => `${x.kind}:${x.score}`)).toEqual(["a:30", "b:70", "linkedin_found:80"]);
  });

  it("à égalité, l'ordre d'arrivée départage, toujours pareil", () => {
    const list = [f("x", 50), f("y", 50), f("z", 50)];
    expect(strongest(list).map((x) => x.kind)).toEqual(["x", "y", "z"]);
    expect(forReveal(list).map((x) => x.kind)).toEqual(forReveal([...list]).map((x) => x.kind));
  });

  it("le dossier le plus riche finit sur sa trouvaille la plus folle", () => {
    const shown = forReveal(githubFindings(rich()));
    expect(shown[shown.length - 1]!.kind).toBe("first_commit");
  });
});
