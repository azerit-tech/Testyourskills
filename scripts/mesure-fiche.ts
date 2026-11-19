// Mesure d'une vraie fiche, phase par phase (SPEC §18.92) : le pipeline du serveur,
// ses vrais modules, une base en mémoire. Rien n'est écrit sur le disque, sauf --json.
//
// Usage : npx tsx --env-file=.env scripts/mesure-fiche.ts <pseudo GitHub | lien LinkedIn>… [options]
//   --profil-simule <fichier.json>  réponse d'acteur Apify rendue à la place d'une vraie lecture
//                                   (sans APIFY_TOKEN) ; « camille-ardent » y devient le pseudo de --lie
//   --profil-ms <n>                 durée simulée de cette lecture (4000 par défaut, la durée mesurée en production)
//   --lie <pseudo>                  le GitHub que le profil simulé donne, et dont le serveur se porte garant
//   --identite <pseudo>             entrée LinkedIn : le GitHub que l'identité prouve par l'email (§18.80)
//   --detail                        toutes les étapes de la collecte GitHub et du choix des fichiers
//   --json <dossier>                range les lignes produites (notes, grille, lecture du code) pour comparer deux versions
//
// Chaque fiche coûte de vrais appels (GitHub, OpenRouter) : une poignée à la fois.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { detectEntry } from "../shared/entry";
import type { CardData, ComparisonData } from "../shared/types";
import { Store } from "../server/src/db";
import { realDeps } from "../server/src/deps";
import { TokenPool, tokensFromEnv } from "../server/src/github/tokens";
import { ApifyProvider } from "../server/src/linkedinProfile/apify";
import { LinkedinProfiles, linkedinProfilesFromEnv } from "../server/src/linkedinProfile/index";
import { LinkedinCache } from "../server/src/linkedinProfile/store";
import { Pipeline } from "../server/src/pipeline";
import type { Trace } from "../server/src/timing";

const args = process.argv.slice(2);
const VALUED = ["--profil-simule", "--profil-ms", "--lie", "--json", "--identite"];
const val = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const entries = args.filter((a, i) => !a.startsWith("--") && !VALUED.includes(args[i - 1] ?? ""));
if (!entries.length) {
  console.error("usage : npx tsx --env-file=.env scripts/mesure-fiche.ts <pseudo GitHub | lien LinkedIn>… [--profil-simule f.json --profil-ms 4000 --lie pseudo] [--identite pseudo] [--detail] [--json dossier]");
  process.exit(1);
}

const store = new Store(":memory:");
const fixture = val("--profil-simule");
const delay = Number(val("--profil-ms") ?? 4000);
const tied = val("--lie");

const simulated = (file: string) => {
  const body = readFileSync(file, "utf8").replaceAll("camille-ardent", tied ?? "camille-ardent");
  const fetchImpl = (async (_url: unknown, init?: { signal?: AbortSignal }) => {
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, delay);
      init?.signal?.addEventListener("abort", () => (clearTimeout(t), reject(init.signal!.reason)), { once: true });
    });
    return new Response(body, { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return new LinkedinProfiles({ cache: new LinkedinCache(store.db), provider: new ApifyProvider({ token: "simulé", fetchImpl }) });
};
const linkedin = fixture ? simulated(fixture) : (linkedinProfilesFromEnv(process.env, store.db) ?? undefined);
const SIMULATED_URL = "https://www.linkedin.com/in/camille-ardent";

const traces: Trace[] = [];
const pipeline = new Pipeline({
  store,
  deps: realDeps,
  githubPool: new TokenPool(tokensFromEnv(process.env)),
  linkedin,
  ...(fixture && tied ? { vouched: { login: tied, linkedinUrl: SIMULATED_URL } } : {}),
  timingLog: (line, trace) => {
    console.log(line);
    traces.push(trace);
  },
});

const out = val("--json");
if (out) mkdirSync(out, { recursive: true });

for (const entry of entries) {
  const found = detectEntry(entry);
  const linkedinUrl = found?.kind === "linkedin" ? found.url : undefined;
  console.log(`\n— ${entry}${linkedin ? (fixture ? ` (profil LinkedIn simulé, ${delay} ms)` : " (LinkedIn lu)") : " (sans LinkedIn)"}`);
  const before = traces.length;
  const known = val("--identite");
  const identity = known ? { identity: { githubLogin: known, how: "email" as const, sureProfile: true } } : {};
  const { id } = pipeline.start(linkedinUrl ? { lang: "fr", linkedinUrl, ...identity } : { lang: "fr", login: entry });
  await pipeline.wait(id);
  const trace = traces[before];
  if (args.includes("--detail") && trace) {
    const steps = (prefix: string) =>
      trace.phases
        .filter((p) => p.name.startsWith(prefix))
        .sort((a, b) => a.at + a.ms - (b.at + b.ms))
        .map((p) => `${p.name.slice(prefix.length)} ${(p.at / 1000).toFixed(1)}→${((p.at + p.ms) / 1000).toFixed(1)}`)
        .join(", ");
    console.log("  collecte : " + steps("gh."));
    console.log("  fichiers : " + steps("lu."));
  }
  const state = pipeline.jobState(id);
  if (state?.state === "error") {
    console.log(`  échec : ${state.code}`);
    continue;
  }
  const rows = store.db.prepare("SELECT id, kind, source, json AS data_json, ai_json FROM cards WHERE id = ? OR parent_id = ? ORDER BY parent_id IS NOT NULL, source").all(id, id) as {
    id: string;
    kind: string;
    source: string;
    data_json: string;
    ai_json: string | null;
  }[];
  const root = JSON.parse(rows[0]!.data_json) as CardData | ComparisonData;
  const grid = root.grid;
  const overall = grid?.overall ?? (root as CardData).overall;
  const reading = rows.map((r) => (r.ai_json ? (JSON.parse(r.ai_json) as { readings?: { repo: string; level: number }[] } | null) : null)).find((a) => a?.readings);
  console.log(`  ${rows[0]!.kind} ${rows[0]!.source} · note ${overall}${grid ? ` · ${grid.criteria.map((c) => `${c.code} ${c.score ?? "—"}`).join(" ")}` : ""}`);
  if (reading?.readings) console.log(`  code lu : ${reading.readings.map((r) => `${r.repo} ${r.level}`).join(", ")}`);
  if (out) {
    const name = entry.replace(/[^A-Za-z0-9_-]+/g, "_").slice(-60);
    writeFileSync(join(out, `${name}.json`), JSON.stringify({ entry, rows: rows.map((r) => ({ kind: r.kind, source: r.source, data: JSON.parse(r.data_json), ai: r.ai_json ? JSON.parse(r.ai_json) : null })) }, null, 2));
  }
}
store.close();
