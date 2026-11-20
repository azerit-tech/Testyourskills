// Rattrapage du §18.124 : les fiches GitHub seules du top de la semaine cherchent leur LinkedIn
// par le nom (une recherche par fiche) ; un lien fort fait le dossier LinkedIn + GitHub, prouvé
// « match », qui remplace la fiche comme « Ajoute ton LinkedIn ». Logique : server/src/rattrapageLinkedin.ts.
//
// Usage, en production (sauvegarde d'abord, ops/DEPLOY.md) :
//   ssh azerit docker exec testyourskills node_modules/.bin/tsx ops/rattrapage-linkedin-github.ts            # ce qu'il ferait (une recherche par fiche)
//   ssh azerit docker exec testyourskills node_modules/.bin/tsx ops/rattrapage-linkedin-github.ts --oui      # le fait (une lecture de profil et un jugement par lien fort)
//   … --top 100 : les 100 premiers du classement (50 par défaut).
// Sans --oui, rien n'est écrit (les recherches restent en cache un jour : --oui ne les repaie pas).
// Idempotent : une fiche remplacée sort du top, son dossier a son LinkedIn.
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { useBudgetDb } from "../server/src/ai/budget";
import { Store } from "../server/src/db";
import { realDeps } from "../server/src/deps";
import { TokenPool, tokensFromEnv } from "../server/src/github/tokens";
import { linkedinProfilesFromEnv } from "../server/src/linkedinProfile/index";
import { linkedinSearchFromEnv } from "../server/src/linkedinProfile/search";
import { matchLinkedinFor, type GithubHints } from "../server/src/match/linkedin";
import { Pipeline } from "../server/src/pipeline";
import { backfillLinkedin, topGithubOnly } from "../server/src/rattrapageLinkedin";
import { registryFromEnv } from "../server/src/registry/index";

const apply = process.argv.includes("--oui");
const topArg = process.argv.indexOf("--top");
const top = topArg > 0 ? Math.max(1, Number(process.argv[topArg + 1]) || 50) : 50;
const dbPath = resolve(process.env.DB_PATH ?? join(import.meta.dirname, "../var/cards.db"));
if (!existsSync(dbPath)) {
  console.error(`Base introuvable : ${dbPath}`);
  process.exit(1);
}
const store = new Store(dbPath);
useBudgetDb(store.db);
const registry = registryFromEnv(process.env) ?? undefined;
const profiles = linkedinProfilesFromEnv(process.env, store.db, undefined, registry) ?? undefined;
const people = linkedinSearchFromEnv(process.env, store.db) ?? undefined;
if (!people) {
  console.error("Recherche LinkedIn par nom sans clé (BRAVE_SEARCH_API_KEY, SERPER_API_KEY) : rien à faire.");
  process.exit(1);
}
const tokens = tokensFromEnv(process.env);

/** Le profil GitHub frais : les faits d'avant le §18.124 n'ont pas la ville. Un appel REST, gratuit. */
async function hints(login: string): Promise<GithubHints | null> {
  const res = await fetch(`https://api.github.com/users/${encodeURIComponent(login)}`, {
    headers: { accept: "application/vnd.github+json", "user-agent": "testyourskills", ...(tokens[0] ? { authorization: `Bearer ${tokens[0]}` } : {}) },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;
  const u = (await res.json()) as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return { login, name: s(u.name), company: s(u.company), location: s(u.location), blog: s(u.blog), bio: s(u.bio) };
}

const pipeline =
  apply && profiles ? new Pipeline({ store, deps: realDeps, githubToken: tokens[0] ?? "", githubPool: new TokenPool(tokens), linkedin: profiles }) : undefined;
if (apply && !pipeline) console.warn("Pas de lecteur de profils LinkedIn (APIFY_TOKEN) : recherche seule, rien n'est écrit.");

const cards = topGithubOnly(store, top);
console.log(`${cards.length} fiche(s) GitHub seule(s) sans LinkedIn dans les ${top} premiers de la semaine.`);
const lines = await backfillLinkedin(
  {
    store,
    hints,
    match: (gh) => matchLinkedinFor({ namesakes: registry ? (n) => registry.namesakes(n) : undefined, byName: (n, q) => people.byName(n, q) }, gh, { budgetMs: 10_000 }),
    pipeline,
  },
  cards,
  (l) => {
    const m = l.match;
    const what = m ? `${m.strength.padEnd(6)} ${m.proposal.url}  (${m.why.join(", ")})` : "rien  ";
    const done = l.dossier ? `  → dossier ${l.dossier}` : l.dossier === null ? "  → dossier non fait" : "";
    console.log(`#${String(l.card.rank).padStart(3)} ${l.card.id}  @${l.card.login}  « ${l.name ?? "—"} »  ${what}  ${l.ms} ms${done}`);
  },
);
const strong = lines.filter((l) => l.match?.strength === "strong").length;
if (!apply) console.log(`${strong} lien(s) fort(s) à attacher. Rien n'est écrit : relancer avec --oui.`);
else console.log(`${lines.filter((l) => l.dossier).length} dossier(s) fait(s) sur ${strong} lien(s) fort(s).`);
await pipeline?.drain();
await registry?.close().catch(() => {});
useBudgetDb(null);
store.close();
