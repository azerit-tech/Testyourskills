// La page de la fiche, rendue en chaîne sans navigateur : l'ordre des blocs du
// visiteur (lien partagé) et de qui a fait la fiche (§18.27, §18.28).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fileOf } from "../../../shared/caseFile";
import type { CardData, ComparisonData } from "../../../shared/types";
import { FIXTURE_COMPARISON, FIXTURES } from "../../../shared/fixtures";
import { tileOrder } from "../../../shared/recruiterLine";
import { DICTS } from "../i18n";
import { LangProvider } from "../i18n";
import { Fold, WeekLine, type Shareable } from "../components/After";
import { linkedinFromField } from "../components/AddLinkedin";
import { skyOf } from "../components/ProfileTile";
import { JuryLine } from "../components/Jury";
import { tokens } from "../lib/api";
import { githubGridMock } from "../lib/mockGrid";
import { setPlea } from "../lib/plea";
import { markChaseWatched } from "../lib/session";
import { Result, type ResultProps } from "./CardPage";

const page = readFileSync(join(__dirname, "CardPage.tsx"), "utf8");

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";

function stub(lang: string) {
  const store = new Map<string, string>();
  vi.stubGlobal("window", {
    location: { origin: "https://skills.test", pathname: "/c/x", search: "" },
    matchMedia: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }),
  });
  vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: () => undefined });
  vi.stubGlobal("sessionStorage", { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
  vi.stubGlobal("navigator", { userAgent: IPHONE, language: lang });
  vi.stubGlobal("document", { documentElement: { dataset: {}, classList: { add: () => undefined, remove: () => undefined } }, querySelector: () => null, getElementById: () => null });
}

function renderResult(item: Shareable, opts: { owner: boolean; lang?: string; token?: string; plea?: number; me?: ResultProps["me"]; claimedAs?: string; fresh?: boolean }): string {
  stub(opts.lang ?? "fr-FR");
  const id = item.kind === "card" ? item.card.id : item.comparison.id;
  if (opts.token) tokens.set(id, opts.token);
  if (opts.plea) setPlea(id, opts.plea);
  const props: ResultProps = {
    item,
    animate: false,
    start: true,
    abort: false,
    onScene: () => undefined,
    owner: opts.owner,
    fresh: opts.fresh ?? false,
    kase: null,
    caseLate: false,
    claimedAs: opts.claimedAs ?? null,
    notice: null,
    me: opts.me ?? null,
    onMe: () => undefined,
    onDeleted: () => undefined,
  };
  return renderToStaticMarkup(createElement(LangProvider, null, createElement(Result, props)));
}

/** La position de chaque marqueur dans la page ; -1 s'il manque. */
const at = (html: string, marks: string[]) => marks.map((m) => html.indexOf(m));
const ascending = (xs: number[]) => xs.every((x, i) => x >= 0 && (i === 0 || x > xs[i - 1]));

const FINDINGS: CardData["findings"] = [
  { kind: "night_share", source: "github", text: { fr: "41 % des commits entre 22 h et 5 h.", en: "41% of commits between 10pm and 5am." }, proof: "https://github.com/x", score: 40 },
];
const card = (over: Partial<CardData> = {}): Shareable => ({ kind: "card", card: { ...FIXTURES.gold, id: "VisitCard01", findings: FINDINGS, ...over } });

afterEach(() => vi.unstubAllGlobals());

describe("page partagée, vue par un visiteur", () => {
  it("l'en-tête, la phrase qui dit ce que c'est, la fiche, le jury, les plis, « À ton tour » (§18.48, §18.76)", () => {
    const html = renderResult(card(), { owner: false });
    const order = at(html, ['class="wanted"', 'class="visitor-lead"', 'class="result-stage"', 'class="jury"', 'class="rest"', 'id="you"']);
    expect(ascending(order), JSON.stringify(order)).toBe(true);
    // Épurée (§18.76) : ni peine ni caution sous le jury, plus de pli « Vois les autres pièces » (elles sont au dos de la fiche).
    expect(html).not.toContain('class="penalty"');
    expect(html).not.toContain('class="fold dossier"');
    // « À ton tour » hors de la colonne (au bureau, il passe sous la fiche).
    expect(html).toMatch(/<\/div><section class="you" id="you"/);
    expect(html).toContain(">À ton tour</h2>");
  });

  it("la phrase du visiteur : ce qu'il regarde, et ce que coûte la sienne ; jamais pour qui a fait la fiche", () => {
    const login = FIXTURES.gold.login;
    const fr = renderResult(card(), { owner: false }).replace(/&#x27;/g, "'").replace(/\u00a0/g, " ");
    // Téléphone : au-dessus de la fiche, deux lignes au plus.
    expect(fr).toContain(`<p class="visitor-lead">La fiche de dev de @${login}.<br/><span class="lead-yours">La tienne prend une minute, sans compte.</span></p>`);
    // Bureau : la phrase entière ouvre « À ton tour », à droite de la fiche.
    expect(fr).toContain(
      `<p class="you-lead">Azerit a dressé la fiche de dev de @${login} comme un recruteur la lirait : l'expérience d'abord, le code comme preuve. La tienne prend une minute, sans compte.</p>`,
    );
    const en = renderResult(card(), { owner: false, lang: "en-US" }).replace(/&#x27;/g, "'");
    expect(en).toContain(`<p class="visitor-lead">@${login}'s dev rap sheet.<br/><span class="lead-yours">Yours takes one minute, no account.</span></p>`);
    expect(en).toContain(`<p class="you-lead">Azerit drew up @${login}'s dev rap sheet the way a recruiter would: experience first, code as proof. Yours takes one minute, no account.</p>`);
    expect(renderResult(card({ id: "LeadOwner01" }), { owner: true })).not.toContain("visitor-lead");
  });

  it("un seul h1, lu « Avis de recherche : @login », sans étoiles, profil ni peine dans l'en-tête", () => {
    const html = renderResult(card(), { owner: false });
    expect(html.match(/<h1/g)).toHaveLength(1);
    const head = /<h1 class="wanted-head"[^>]*>.*?<\/h1>/.exec(html)?.[0] ?? "";
    const text = head.replace(/<[^>]+>/g, "");
    expect(text).toBe(`Avis de recherche : @${FIXTURES.gold.login}`);
    expect(head).not.toContain("svg");
  });

  it("« Voir la poursuite » dans l'en-tête, hors du titre, sans rien charger du film (§18.48)", () => {
    const html = renderResult(card(), { owner: false });
    const head = /<header class="wanted">.*?<\/header>/.exec(html)?.[0] ?? "";
    expect(head).toContain('class="chase-link"');
    expect(head.replace(/<[^>]+>/g, "")).toContain("Voir la poursuite");
    expect(html).not.toContain("<video");
    expect(html).not.toContain("film-stage");
    // Sa propre fiche : « Voir ma poursuite » tant que le film n'a pas joué ici, « Revoir » ensuite.
    const mine = renderResult(card(), { owner: true, lang: "en-US" });
    expect(/<header class="wanted">.*?<\/header>/.exec(mine)?.[0]).toContain("Watch my chase");
    markChaseWatched("SeenCard01");
    const seen = renderResult(card({ id: "SeenCard01" }), { owner: true, lang: "en-US" });
    expect(/<header class="wanted">.*?<\/header>/.exec(seen)?.[0]).toContain("Replay my chase");
  });

  it("« C'est moi » réussi : en haut de la page, la fiche est à ton nom ; un seul « Voir ma poursuite », dans l'en-tête (§18.52)", () => {
    const login = FIXTURES.gold.login!;
    const me = { login: login.toLowerCase(), hidden: false };
    const fr = renderResult(card({ id: "ClaimCard01" }), { owner: false, me, claimedAs: login.toLowerCase() }).replace(/ /g, " ");
    expect(fr).toContain(`<p class="hidden-banner" role="status">Fiche reprise : elle est à ton nom, @${login.toLowerCase()}.</p>`);
    expect(fr.indexOf("hidden-banner")).toBeLessThan(fr.indexOf('class="wanted"'));
    expect(fr.match(/class="chase-link"/g)?.length ?? 0).toBeLessThanOrEqual(2);
    expect(/<header class="wanted">.*?<\/header>/.exec(fr)?.[0]).toContain("Voir ma poursuite");
    const en = renderResult(card({ id: "ClaimCard02" }), { owner: false, me, claimedAs: login.toLowerCase(), lang: "en-US" }).replace(/&#x27;/g, "'");
    expect(en).toContain(`Sheet claimed: it's in your name now, @${login.toLowerCase()}.`);
    // Sans retour de « C'est moi », rien.
    expect(renderResult(card({ id: "ClaimCard03" }), { owner: false, me })).not.toContain("Fiche reprise");
    expect(page).toMatch(/setClaimedAs\(as\.toLowerCase\(\)\);\s*window\.scrollTo\(0, 0\);/);
  });

  it("au bureau, « À ton tour » vient avant la colonne dans le document : le clavier suit l'écran (exécution 11)", () => {
    expect(page).toContain('const desk = useMediaQuery("(min-width: 900px)");');
    expect(page).toContain("const turnFirst = desk && !wantedYou;");
    const first = page.indexOf("{turnFirst && turn}");
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(page.indexOf('<div className="visitor-col">'));
    expect(page.indexOf("{!turnFirst && turn}")).toBeGreaterThan(page.indexOf('<div className="visitor-col">'));
  });

  it("une fiche supprimée ou introuvable : le navigateur l'oublie, plus de « Ma fiche » qui mène nulle part (parcours 4)", () => {
    expect(page).toMatch(/if \(view\.s === "none" \|\| view\.s === "deleted"\) forgetMine\(id\);/);
  });

  it("sa fiche toute neuve, arrivé par celle d'un autre : le duel en tête du partage (parcours 7)", () => {
    expect(page).toMatch(/\{fromRival && <Duel mine=\{own\} card=\{fromRival\} duel=\{fromDuel\} from \/>\}\s*\{!visitor && !\(claimed && me\?\.hidden\) && <ShareBar/);
    expect(page).toMatch(/if \(visitor && settled && kase && !wantedYou && !main\.sealed\) rememberVisited\(/);
  });

  it("l'image du profil est en ciel de page, plus en tuile ; la peine n'est plus sous la fiche (§18.76)", () => {
    const html = renderResult(card(), { owner: false });
    expect(html).not.toContain("Peine");
    expect(html.match(/<img src="\/profiles\//g)).toHaveLength(1);
  });

  it("ni partage, ni dénonciation, ni pièces à conviction pour le visiteur", () => {
    const html = renderResult(card(), { owner: false });
    expect(html).not.toContain("after-block out");
    expect(html).not.toContain("after-block denounce");
    expect(html).not.toContain('class="fold why"');
  });

  it("sans profil : le reste en place", () => {
    const { profile: _p, ...bare } = FIXTURES.gold;
    const html = renderResult({ kind: "card", card: { ...(bare as CardData), id: "VisitCard02" } }, { owner: false });
    expect(ascending(at(html, ['class="result-stage"', 'class="jury"', 'id="you"']))).toBe(true);
  });
});

describe("après-fiche, vue par qui a fait la fiche (§18.27)", () => {
  const mine = (id: string) => card({ id });

  it("le verdict (pari, jury) en une ligne, la dénonciation, le partage, puis le reste en lignes (§18.48, §18.76, §18.81)", () => {
    const html = renderResult(mine("OwnCard0001"), { owner: true, token: "tok", plea: 6 });
    const order = at(html, ['class="after-head"', 'class="plea-verdict"', 'class="jury-line"', 'class="after-block denounce"', 'class="after-block out"', 'class="rest"', 'class="after-foot"']);
    expect(ascending(order), JSON.stringify(order)).toBe(true);
    // Le verdict : le pari, puis la ligne du jury (une invitation à partager tant qu'il a moins de trois votes). Ni peine ni caution (§18.76).
    expect(html).toMatch(/<div class="after-head"><section class="plea-verdict".*?<\/section><p class="jury-line">[^<]*<\/p><\/div>/);
    expect(html).not.toContain('class="penalty"');
    expect(html).not.toContain('class="fold dossier"');
    expect(html).not.toContain('class="after-block dossier"');
    // l'en-tête sur le ciel, en tête de page, et un seul h1 ; pas de « Et toi ? »
    expect(html.indexOf('class="wanted"')).toBeLessThan(html.indexOf('class="result-stage"'));
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).not.toContain('id="you"');
  });

  it("au retour du film, le verdict du pari au-dessus de la fiche, place tenue, une seule fois (parcours 2)", () => {
    const fresh = renderResult(mine("PleaCard001"), { owner: true, token: "tok", plea: 6, fresh: true }).replace(/ /g, " ");
    const strip = /<p class="plea-strip[^"]*"[^>]*>.*?<\/p>/.exec(fresh)?.[0] ?? "";
    expect(strip.replace(/<[^>]+>/g, "")).toMatch(/^(Excès de confiance|Lucide|Trop modeste)\. Tu plaidais 6 étoiles, verdict : \d\.$/);
    expect(fresh.indexOf("plea-strip")).toBeLessThan(fresh.indexOf('class="result-stage"'));
    // Sans film tout juste vu, ou pour un visiteur : rien au-dessus de la fiche.
    expect(renderResult(mine("PleaCard002"), { owner: true, token: "tok", plea: 6 })).not.toContain("plea-strip");
    expect(renderResult(card({ id: "PleaCard003" }), { owner: false, plea: 6, fresh: true })).not.toContain("plea-strip");
    const en = renderResult(mine("PleaCard004"), { owner: true, token: "tok", plea: 1, fresh: true, lang: "en-US" });
    expect(en).toMatch(/You pleaded 1 star, verdict: \d\./);
  });

  it("le reste : des lignes repliées, chacune un vrai titre et un chevron", () => {
    const html = renderResult(mine("OwnCard0002"), { owner: true, token: "tok" });
    const rest = html.slice(html.indexOf('class="rest"'), html.indexOf('class="after-foot"'));
    const rows = [...rest.matchAll(/<details class="fold ([a-z- ]+)"( open="")?><summary class="fold-row"><span>([^<]+)<\/span><svg class="fold-chevron"/g)];
    // Fiche seule : « Pourquoi cette note » est au dos de la fiche, plus dans les lignes.
    // Fiche sans grille : pas de « Comment c'est noté » ; plus de « Vois les autres pièces » (§18.76).
    expect(rows.map((r) => r[1])).toEqual(["add-source", "email", "contest"]);
    // Les titres à l'impératif tutoyé (§18.48).
    expect(rows.map((r) => r[3].replace(/\u00a0/g, " "))).toEqual(["Ajoute ton CV au dossier", "Garde ta fiche au-delà de 90 jours", "Fais appel"]);
    // toutes fermées au départ
    expect(rows.every((r) => !r[2])).toBe(true);
    // le contenu reste monté, fermé : le formulaire d'email est là
    expect(rest).toContain('id="email-input"');
  });

  it("« Fais appel » : d'où vient la note, la source qui manque nommée, et le seul « Supprimer ma fiche » de la page (§18.48)", () => {
    const html = renderResult(mine("OwnCard0005"), { owner: true, token: "tok" }).replace(/&#x27;/g, "'");
    const fold = /<details class="fold contest">.*?<\/details>/.exec(html)?.[0] ?? "";
    expect(fold).toContain('<p class="contest-real">Pour de vrai : la note sort de la grille');
    // La blague reste, en lien ; la suppression n'est que dans le pli.
    expect(fold).toMatch(/<div class="contest-exits"><button type="button" class="link-alt">Faire appel<\/button><\/div>/);
    expect(fold).toMatch(/<div class="delete-card"><button type="button" class="link-danger">Supprimer ma fiche<\/button><\/div>/);
    expect(html.match(/class="delete-card"/g)).toHaveLength(1);
    expect(DICTS.fr.result.contest.addSource).toBe("Ajouter une source");
    expect(DICTS.en.result.rest.contest).toBe("Appeal the rating");
    // Seule la source qui manque est nommée.
    expect(DICTS.fr.result.contest.real(DICTS.fr.result.contest.realAdd.career).replace(/\u00a0/g, " ")).toBe(
      "Pour de vrai : la note sort de la grille et bouge avec ton dossier. Ajoute ton LinkedIn ou ton CV et elle est recalculée.",
    );
  });

  it("sans jeton de cette fiche, pas de ligne d'email ; fiche LinkedIn seule, « Ajoute ton GitHub » en bloc, hors des lignes", () => {
    const li = card({ id: "OwnCard0003", source: "cv", declaredSource: "linkedin", linkedinUrl: "https://www.linkedin.com/in/x" });
    const html = renderResult(li, { owner: true });
    expect(html).not.toContain("fold email");
    const prove = html.indexOf('class="after-block add-source"');
    expect(prove).toBeGreaterThan(html.indexOf('class="after-block denounce"'));
    expect(prove).toBeLessThan(html.indexOf('class="rest"'));
    expect(html).not.toContain("fold add-source");
  });

  it("ni peine ni caution sur la page, fiche seule ou dossier à deux pièces (§18.76)", () => {
    const html = renderResult(mine("OwnCard0004"), { owner: true });
    expect(html).not.toContain("why-sentence");
    expect(html).not.toContain('class="penalty"');
    const { profile: _p, ...gh } = { ...FIXTURE_COMPARISON.github, sentence: FIXTURES.gold.sentence };
    const cmp = renderResult({ kind: "comparison", comparison: { ...FIXTURE_COMPARISON, id: "OwnCmp0001", github: gh as CardData } }, { owner: true });
    expect(cmp).not.toContain('class="penalty"');
    expect(cmp).not.toContain("why-sentence");
  });

  it("le jury du propriétaire : une ligne de texte courant, pas un titre", () => {
    stub("fr-FR");
    const html = renderToStaticMarkup(createElement(LangProvider, null, createElement(JuryLine, { jury: { guilty: 3, cleared: 1, mine: null } })));
    expect(html).toBe('<p class="jury-line">Jury\u00a0: 75\u00a0% coupable (4\u00a0votes)</p>');
    // Avant trois votes, et tant que le d\u00e9compte charge : une invitation \u00e0 partager, pas un vide (parcours 12).
    const few = (jury: { guilty: number; cleared: number; mine: null } | null, lang = "fr-FR") => {
      stub(lang);
      return renderToStaticMarkup(createElement(LangProvider, null, createElement(JuryLine, { jury }))).replace(/\u00a0/g, " ");
    };
    expect(few({ guilty: 0, cleared: 0, mine: null })).toBe('<p class="jury-line">Jury : ton r\u00e9seau vote coupable ou relaxe d\u00e8s que tu partages.</p>');
    expect(few({ guilty: 1, cleared: 1, mine: null })).toContain("ton r\u00e9seau vote");
    expect(few(null)).toContain("ton r\u00e9seau vote");
    expect(few(null, "en-US")).toBe('<p class="jury-line">Jury: your network votes guilty or cleared once you share.</p>');
    // Une phrase, sans point médian.
    expect(html).not.toContain("·");
  });
});

describe("le ciel de la page (§18.29)", () => {
  it("l'illustration du profil en premier, derrière la barre, chargée en priorité, muette pour les lecteurs d'écran", () => {
    for (const owner of [false, true]) {
      const html = renderResult(card({ id: owner ? "SkyCard0002" : "SkyCard0001" }), { owner });
      const sky = /<div class="card-sky[^"]*" aria-hidden="true"><picture>.*?<\/picture><\/div>/.exec(html)?.[0] ?? "";
      expect(html).toContain(`id="main">${sky}`);
      expect(sky).toContain(`src="/profiles/${FIXTURES.gold.profile!.id}.jpg"`);
      // Au téléphone, la variante -s (exécution 13).
      expect(sky).toContain(`<source media="(max-width: 640px)" srcSet="/profiles/${FIXTURES.gold.profile!.id}-s.jpg" width="576" height="384"/>`);
      expect(sky).toMatch(/width="1152" height="768" alt="" decoding="async" fetchpriority="high"/i);
      // pas encore chargée : le texte reste crème sur l'encre
      expect(sky).not.toContain("is-in");
    }
  });

  it("le ton suit l'heure de l'image : l'heure rose est claire, l'heure bleue et l'image par défaut sombres", () => {
    expect(skyOf("arsonist")).toEqual({ src: "/profiles/arsonist.jpg", tone: "light" });
    expect(skyOf("night_owl").tone).toBe("dark");
    expect(skyOf(undefined)).toEqual({ src: "/profiles/default.jpg", tone: "dark" });
    expect(skyOf("../x").src).toBe("/profiles/default.jpg");
    const { profile: _p, ...bare } = FIXTURES.gold;
    const html = renderResult({ kind: "card", card: { ...(bare as CardData), id: "SkyCard0003" } }, { owner: false });
    expect(html).toContain('<div class="card-sky sky-dark" aria-hidden="true"><picture><source media="(max-width: 640px)" srcSet="/profiles/default-s.jpg" width="576" height="384"/><img src="/profiles/default.jpg"');
  });

  it("dossier à deux pièces : le même ciel qu'une fiche seule", () => {
    const html = renderResult({ kind: "comparison", comparison: FIXTURE_COMPARISON }, { owner: true });
    expect(html).toMatch(/<div class="card-sky sky-(light|dark)" aria-hidden="true">/);
    expect(html).not.toContain("is-tall");
  });
});

describe("demander le retrait d'une fiche sans pseudo GitHub", () => {
  const linkedin = () => card({ id: "LinkedIn001", login: undefined, source: "cv", declaredSource: "linkedin" } as Partial<CardData>);
  it("sur la page partagée d'une fiche LinkedIn ou CV, après « Et toi ? », un lien discret", () => {
    const html = renderResult(linkedin(), { owner: false });
    expect(html).toContain("C&#x27;est toi sur cette fiche, et tu ne l&#x27;as pas faite\u00a0? Demander son retrait");
    expect(html.indexOf('class="removal"')).toBeGreaterThan(html.indexOf('id="you"'));
    expect(renderResult(linkedin(), { owner: false, lang: "en-US" })).toContain("On this sheet and didn&#x27;t make it? Ask us to take it down");
  });

  it("jamais pour qui a fait la fiche, ni sur une fiche qui a un pseudo GitHub (« C'est moi » y suffit)", () => {
    expect(renderResult(linkedin(), { owner: true })).not.toContain('class="removal"');
    expect(renderResult(card({ id: "GhCard00001" }), { owner: false })).not.toContain('class="removal"');
  });
});

describe("bloc recruteur", () => {
  it("en fin de page, pour le visiteur seulement (§18.76) : un titre, une phrase, une pilule vers azerit.tech", () => {
    const visitor = renderResult(card({ id: "HireCard001" }), { owner: false });
    const owner = renderResult(card({ id: "HireCard002" }), { owner: true });
    expect(visitor.indexOf('class="after-block hire"')).toBeGreaterThan(visitor.indexOf('id="you"'));
    // La personne fichée a le pied de page, qui dit déjà qu'Azerit recrute.
    expect(owner).not.toContain('class="after-block hire"');
    const block = /<section class="after-block hire".*?<\/section>/.exec(visitor)?.[0] ?? "";
    expect(block).toContain('<h2 id="hire-title">Vous recrutez ?</h2>');
    expect(block).toMatch(/<a class="pill pill-ghost" href="https:\/\/azerit\.tech" target="_blank" rel="noopener">azerit\.tech/);
    expect(visitor).not.toContain("azerit-cta");
  });

  it("en anglais : « Hiring? »", () => {
    expect(renderResult(card({ id: "HireCard003" }), { owner: false, lang: "en-US" })).toContain(">Hiring?</h2>");
  });
});

describe("un dossier, une fiche, une note (§18.36)", () => {
  const cmp = (over: Partial<ComparisonData> = {}): Shareable => ({ kind: "comparison", comparison: { ...FIXTURE_COMPARISON, ...over } });
  const file = fileOf(FIXTURE_COMPARISON);
  const textOf = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
  // Ce que la page ne dit plus : une pièce contre l'autre.
  const VERSUS = /sous-vend|annonce \d|en montre plus|undersell|claims \d|shows more/i;

  it("pour le visiteur comme pour qui l'a fait, en français comme en anglais : un h1, une fiche, une note, ses pièces dessous", () => {
    for (const owner of [false, true])
      for (const lang of ["fr-FR", "en-US"]) {
        const html = renderResult(cmp({ id: `Dossier${owner ? 1 : 0}${lang.slice(0, 2)}`, declaredSource: "linkedin" }), { owner, lang });
        expect(html.match(/<h1/g)).toHaveLength(1);
        expect(html.match(/class="tys-card /g)).toHaveLength(1);
        expect(html.match(new RegExp(`>${file.overall}<`, "g"))).toHaveLength(1);
        expect(html).not.toContain(`>${FIXTURE_COMPARISON.cv.overall}<`);
        expect(html).not.toMatch(/class="cmp[ -"]/);
        expect(textOf(html)).not.toMatch(VERSUS);
        // L'en-tête d'une fiche seule, au-dessus de la fiche ; les pièces dessous.
        expect(html.indexOf('class="wanted"')).toBeLessThan(html.indexOf('class="result-stage"'));
        const line = lang === "fr-FR" ? "Sources au dossier\u00a0: LinkedIn et GitHub" : "Sources on file: LinkedIn and GitHub";
        expect(html).toContain(`<p class="pieces-line">${line}</p>`);
        expect(html.indexOf('class="pieces"')).toBeGreaterThan(html.indexOf('class="tys-card '));
      }
  });

  it("un CV au dossier : « CV et GitHub » ; le lien non prouvé et le code à prouver sur leur ligne", () => {
    expect(renderResult(cmp({ id: "DossierCv01" }), { owner: true })).toContain("Sources au dossier\u00a0: CV et GitHub");
    const unproven = renderResult(cmp({ id: "DossierLi01", declaredSource: "linkedin", linkUnproven: true }), { owner: false });
    expect(unproven).toContain('<p class="pieces-note">Lien entre les deux sources\u00a0: à confirmer</p>');
    expect(unproven).not.toContain("Code à prouver");
    const empty = renderResult(cmp({ id: "DossierEm01", github: { ...FIXTURE_COMPARISON.github, sealed: true } }), { owner: false });
    expect(empty).toContain('<p class="pieces-note">Code à prouver</p>');
  });

  it("un dossier scellé ne dit sa note ni au lecteur d'écran, ni dans le duel", () => {
    const sealed: CardData = { ...file, sealed: true };
    const html = renderResult(cmp({ id: "DossierSeal1", file: sealed }), { owner: false });
    expect(html).toContain("Fiche scellée\u00a0: le code reste à prouver.");
    expect(html).not.toMatch(/note \d+\./);
    expect(html).not.toContain('class="versus-line"');
  });
});

describe("la lecture du recruteur (§18.37)", () => {
  const grid = githubGridMock("gold", FIXTURES.gold.login ?? "dev")!;

  it("une fiche sans grille (d'avant, ou dénoncée et non revendiquée) n'affiche ni la grille, ni la ligne, ni les tuiles", () => {
    for (const owner of [true, false]) {
      const html = renderResult(card(), { owner, token: owner ? "tok" : undefined });
      expect(html).not.toContain('id="grille"');
      expect(html).not.toContain('class="fold rr"');
      expect(html).not.toContain("Comment c&#x27;est noté");
    }
  });

  it("avec sa grille : un seul pli fermé, « Comment c'est noté », huit tuiles notées sur 10, aucun « + n » (§18.76)", () => {
    const html = renderResult(card({ grid, overall: grid.overall }), { owner: true, token: "tok" });
    const fold = /<details class="fold rr">.*?<\/details>/s.exec(html)![0];
    expect(fold).toMatch(/^<details class="fold rr"><summary class="fold-row"><span>Comment c&#x27;est noté<\/span>/);
    expect(fold.match(/class="rr-tile /g)).toHaveLength(8);
    expect(fold.replace(/<[^>]+>/g, " ")).not.toMatch(/(^|\s)[+−]\s?\d/);
    // Le détail critère par critère et le calcul : un pli dans le pli, fermé ; plus d'invitation à toucher une tuile (§18.76).
    expect(fold).toMatch(/<details class="rg rg-fold"><summary class="rg-fold-sum"><span>Le détail, critère par critère<\/span>/);
    expect(html.match(/class="rg-row /g)).toHaveLength(8);
    expect(html).toContain('<h3 class="rg-final-title">La note de la fiche</h3>');
    expect(html).not.toContain('class="rr-detail"');
    expect(html).not.toContain("Voici comment Azerit");
    expect(html).not.toContain('id="grille"');
  });

  it("vue par un visiteur : le même pli, le même titre", () => {
    const html = renderResult(card({ grid, overall: grid.overall }), { owner: false });
    expect(html).toMatch(/<details class="fold rr"><summary class="fold-row"><span>Comment c&#x27;est noté<\/span>/);
    expect(html).not.toContain("lit @");
  });

  it("la ligne du recruteur et les huit tuiles : le premier des plis, après le verdict, la dénonciation et le partage (§18.48, §18.76, §18.81)", () => {
    const html = renderResult(card({ grid, overall: grid.overall }), { owner: true, token: "tok", plea: 4 });
    const order = at(html, ['class="result-stage"', 'class="after-head"', 'class="after-block denounce"', 'class="after-block out"', 'add-linkedin', 'class="rest"', 'class="fold rr"', 'class="fold email"']);
    expect(ascending(order), JSON.stringify(order)).toBe(true);
    expect(html.match(/class="rr-tile /g)).toHaveLength(8);
    expect(html).toMatch(/<p class="rr-line">[^<]+, [^<]+\. Point fort\u00a0: [^<]+, \d+\/10\./);
    // Les tuiles dans l'ordre du recruteur, les critères sans note en bas (deux au plus en tuiles).
    const names = [...html.matchAll(/<span class="rr-name">([^<]+)<\/span>/g)].map((m) => m[1]);
    const { scored, pending } = tileOrder(grid);
    expect(pending.length).toBeLessThanOrEqual(2);
    expect(names).toEqual([...scored, ...pending].map((c) => DICTS.fr.read.short[c.code]));
    expect(names[0]).toBe("Expérience");
    if (pending.length) expect(html).toContain('<p class="rr-pending">Pas encore au dossier</p>');
  });

  it("plus de deux critères sans note : une ligne, pas un mur de cases vides (§18.48)", () => {
    const low = githubGridMock("unknownLang", "x")!;
    const { scored, pending } = tileOrder(low);
    expect(pending.length).toBeGreaterThan(2);
    const html = renderResult(card({ grid: low, overall: low.overall }), { owner: true, token: "tok" });
    expect(html.match(/class="rr-tile /g) ?? []).toHaveLength(scored.length);
    const line = /<p class="rr-pending-line">([^<]+)<\/p>/.exec(html)?.[1] ?? "";
    expect(line).toBe(DICTS.fr.read.pendingLine(pending.map((c) => DICTS.fr.read.short[c.code]).join(", ")));
    expect(line).toMatch(/^Pas encore au dossier.: /);
    expect(html).not.toContain('class="rr-pending"');
  });

  it("fiche GitHub seule : « Ajoute ton LinkedIn au dossier », en miroir de l'ajout du GitHub ; jamais pour un visiteur", () => {
    const own = renderResult(card({ grid, overall: grid.overall }), { owner: true, token: "tok" });
    expect(own).toMatch(/<section class="after-block add-source add-linkedin"[^>]*><h2[^>]*>Ajoute ton LinkedIn au dossier<\/h2>/);
    expect(own.indexOf("add-linkedin")).toBeLessThan(own.indexOf('class="rest"'));
    expect(renderResult(card({ grid, overall: grid.overall }), { owner: false })).not.toContain("add-linkedin");
  });

  it("sous trois étoiles : la source qui manque remonte sous le verdict, avant le partage ; à trois et plus, avant les plis (§18.48, §18.76)", () => {
    const low = githubGridMock("unknownLang", "x")!;
    const one = renderResult(card({ id: "LowCard0001", grid: low, overall: low.overall }), { owner: true, token: "tok", plea: 3 });
    const order = at(one, ['class="after-head"', 'class="after-block add-source add-linkedin"', 'class="after-block out"', 'class="fold rr"']);
    expect(ascending(order), JSON.stringify(order)).toBe(true);
    const five = renderResult(card({ id: "HighCard001", grid, overall: grid.overall }), { owner: true, token: "tok" });
    const high = at(five, ['class="after-block out"', 'class="after-block add-source add-linkedin"', 'class="rest"', 'class="fold rr"']);
    expect(ascending(high), JSON.stringify(high)).toBe(true);
    // Fiche LinkedIn seule sous trois étoiles : « Ajoute ton GitHub » remonte de même.
    const li = renderResult(card({ id: "LowCard0002", overall: 30, source: "cv", declaredSource: "linkedin", linkedinUrl: "https://www.linkedin.com/in/x" }), { owner: true });
    expect(li.indexOf('class="after-block add-source"')).toBeLessThan(li.indexOf('class="after-block out"'));
    // Sous trois étoiles, le bouton de la source prend le rose, le partage passe en contour (§18.52).
    expect(one).toMatch(/<button type="submit" class="pill pill-big entry-submit"/);
    expect(one).toMatch(/class="pill pill-big out-main pill-ghost"/);
    expect(li).toMatch(/<button type="submit" class="pill pill-big entry-submit"/);
    expect(li).toMatch(/class="pill pill-big out-main pill-ghost"/);
    // À trois étoiles et plus, rien ne change : la source en contour, le partage en rose.
    expect(five).toMatch(/<button type="submit" class="pill pill-ghost entry-submit"/);
    expect(five).toMatch(/class="pill pill-big out-main"/);
  });

  it("le rang ne s'affiche que s'il flatte (top 10 et première moitié), écrit comme dans le texte partagé (§18.52)", () => {
    const week = (rank: number, total = 40, closed = false) => ({ week: 46, rank, total, gapToTop5: 12, inTop5: rank <= 5, closed });
    const line = (rank: number, low: boolean, total?: number, lang = "fr-FR", closed = false) => {
      stub(lang);
      return renderToStaticMarkup(createElement(LangProvider, null, createElement(WeekLine, { week: week(rank, total, closed), low }))).replace(/ /g, " ");
    };
    expect(line(14, true)).toBe("");
    expect(line(14, false)).toBe("");
    expect(line(8, true)).toContain("8e");
    // Le lancement : « 8e » sur huit, c'est la dernière place ; rien.
    expect(line(8, false, 8)).toBe("");
    expect(line(4, false, 8)).toContain("4e cette semaine");
    expect(line(9, false, 12, "fr-FR", true)).toBe("");
    // Le top 5 dit son rang, comme le texte partagé (« n° 1 cette semaine »).
    expect(line(1, false)).toBe('<p class="week-rank">N° 1 cette semaine : défends ta place jusqu&#x27;à dimanche</p>');
    expect(line(3, false)).toContain("3e cette semaine : défends ta place");
    expect(line(1, false, 40, "en-US")).toContain("#1 this week: hold your spot until Sunday");
    expect(DICTS.fr.result.week.share(1).replace(/ /g, " ")).toBe("n° 1 cette semaine");
  });

  it("le rang : du texte au-dessus du bouton, jamais un lien ; l'écart seulement s'il encourage (parcours 14 et 22, textes 18)", () => {
    const at = (rank: number, gap: number, low: boolean) => {
      stub("fr-FR");
      const w = { week: 46, rank, total: 40, gapToTop5: gap, inTop5: false, closed: false };
      return renderToStaticMarkup(createElement(LangProvider, null, createElement(WeekLine, { week: w, low }))).replace(/ /g, " ");
    };
    expect(at(8, 6, false)).toBe('<p class="week-rank">8e sur 40 cette semaine, à 6 points du top 5</p>');
    // Plus de 10 points, ou sous trois étoiles : le rang seul.
    expect(at(8, 49, false)).toBe('<p class="week-rank">8e sur 40 cette semaine</p>');
    expect(at(8, 4, true)).toBe('<p class="week-rank">8e sur 40 cette semaine</p>');
    expect(page).not.toMatch(/<a className="week-rank"/);
  });

  it("plus de « Voir le top de la semaine » dans le bloc de partage (§18.76) : le rang reste, la sortie part", () => {
    const after = readFileSync(join(__dirname, "../components/After.tsx"), "utf8");
    expect(after).not.toContain("BOARD_ID");
    expect(after).not.toContain("out-board");
  });

  it("le champ LinkedIn : le lien entier, ou ce qui suit linkedin.com/in/", () => {
    expect(linkedinFromField("camille-ardent")).toBe("https://www.linkedin.com/in/camille-ardent");
    expect(linkedinFromField("https://www.linkedin.com/in/camille-ardent/")).toBe("https://www.linkedin.com/in/camille-ardent");
    expect(linkedinFromField("  ")).toBeNull();
    expect(linkedinFromField("https://github.com/x")).toBeNull();
  });

  it("vue par un visiteur : le pli dans la colonne, sous le jury, le jeu dit dedans", () => {
    const html = renderResult(card({ grid, overall: grid.overall }), { owner: false });
    const col = html.slice(html.indexOf('class="visitor-col"'));
    expect(col.indexOf('class="fold rr"')).toBeGreaterThan(col.indexOf('class="jury"'));
    // Le jeu dit, dans le pli : la dernière ligne avant sa fermeture.
    const fold = html.slice(html.indexOf('class="fold rr"'), html.indexOf("</details></div>", html.indexOf('class="fold rr"')));
    expect(fold).toContain("Pas une décision d&#x27;embauche");
  });
});

describe("ligne repliée", () => {
  const fold = (attention: boolean) =>
    renderToStaticMarkup(createElement(Fold, { name: "email", title: "Recevoir ma fiche par email", attention, children: createElement("p", null, "corps") }));

  it("fermée par défaut, le contenu monté", () => {
    expect(fold(false)).toBe(
      '<details class="fold email"><summary class="fold-row"><span>Recevoir ma fiche par email</span><svg class="fold-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg></summary><div class="fold-body"><p>corps</p></div></details>',
    );
  });

  it("un état qui demande l'attention l'ouvre", () => {
    expect(fold(true)).toMatch(/^<details class="fold email" open="">/);
  });
});
