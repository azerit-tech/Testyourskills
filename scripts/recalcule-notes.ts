// Recalcul des notes au barème du jour (SPEC §18.106, barème 0.6.0). Une note ne se
// recalcule que si tout ce qu'elle lit est gardé en base :
//   - une fiche GitHub seule : les faits (`facts_json`) et la lecture du code (`ai_json`)
//     sont gardés, la grille se refait à l'identique du pipeline (scoreGithub) ;
//   - une fiche LinkedIn ou CV, un dossier : la lecture du profil n'est jamais gardée (vie
//     privée, §18.84), et le barème 0.6.0 lit des choses que la grille rangée ne dit pas
//     (les postes et leurs employeurs, les technos rattachées, les résultats datés). Elles
//     sont comptées « à relire » et laissées telles quelles : il faut une nouvelle lecture
//     (fournisseur LinkedIn et IA), que ce script ne lance pas.
// Jamais touchés : les fiches remplacées (`superseded_by`, l'historique) et les pièces d'un
// dossier (`parent_id`, elles portent la note de leur dossier). La note recalculée prend
// l'aléa de la fiche (±1 à 3, tiré sur son id), comme une fiche neuve.
//
// Usage (dans le conteneur, après une sauvegarde de la base) :
//   node_modules/.bin/tsx scripts/recalcule-notes.ts            # à blanc : ce qui changerait
//   node_modules/.bin/tsx scripts/recalcule-notes.ts --oui      # écrit
//   ... --db /chemin/cards.db                                  # une autre base (une copie)
// Il ne dit que des comptes et des notes, jamais un nom ni un pseudo.

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import Database from "better-sqlite3";
import { IMAGE_DESIGN_DIR } from "../shared/images";
import { jitterCard } from "../shared/jitter";
import type { CodeReadingResult } from "../shared/readings";
import type { CardData } from "../shared/types";
import { starsFor } from "../shared/types";
import type { GithubFacts } from "../server/src/github/facts";
import { SCORING } from "../server/src/scoring/config";
import { scoreGithub } from "../server/src/scoring/github";
import { JITTER_BOUNDS } from "../server/src/pipeline";

export interface RawRow {
  id: string;
  parent_id: string | null;
  kind: string;
  source: string;
  superseded_by: string | null;
  json: string;
  facts_json: string | null;
  ai_json: string | null;
}

export type Verdict =
  | { id: string; kind: "recomputed"; before: number; after: number; data: CardData }
  | { id: string; kind: "reread"; before: number; why: string }
  | { id: string; kind: "current"; before: number }
  | { id: string; kind: "kept"; why: string };

/** Ce que devient une ligne : recalculée, à relire, déjà à jour, ou gardée telle quelle. Pur. */
export function verdictOf(r: RawRow, version: string = SCORING.version): Verdict {
  if (r.parent_id) return { id: r.id, kind: "kept", why: "pièce d'un dossier" };
  if (r.superseded_by) return { id: r.id, kind: "kept", why: "fiche remplacée" };
  const data = JSON.parse(r.json) as CardData;
  if (!data.grid || !Array.isArray(data.grid.criteria) || !Number.isFinite(data.overall)) return { id: r.id, kind: "kept", why: "sans grille" };
  const before = data.overall;
  if (data.scoringVersion === version) return { id: r.id, kind: "current", before };
  if (r.kind !== "card" || r.source !== "github" || !r.facts_json) return { id: r.id, kind: "reread", before, why: "lecture LinkedIn ou CV non gardée" };
  const codeRead = data.grid.criteria.some((c) => c.code === "CODE" && c.score !== null);
  // Une fiche d'avant `ai_json` : sa lecture du code n'est pas gardée, la refaire sans elle la changerait.
  if (r.ai_json === null && codeRead) return { id: r.id, kind: "reread", before, why: "lecture du code non gardée" };
  const facts = JSON.parse(r.facts_json) as GithubFacts;
  const ai = r.ai_json ? (JSON.parse(r.ai_json) as CodeReadingResult | null) : null;
  const body = scoreGithub(facts, ai, { lang: data.lang ?? "fr", judgedInSeconds: data.judgedInSeconds ?? 0 });
  // La note finale comme le pipeline : l'aléa de la fiche, tiré sur son id (shared/jitter.ts).
  const next = jitterCard<CardData>({ ...data, grid: body.grid, overall: body.overall, tier: body.tier, scoringVersion: body.scoringVersion }, r.id, JITTER_BOUNDS);
  return { id: r.id, kind: "recomputed", before, after: next.overall, data: next };
}

/** Les notes de toutes les fiches vivantes, avant et après : la note recalculée, sinon celle d'aujourd'hui. */
export function summary(verdicts: Verdict[]) {
  const live = verdicts.filter((v): v is Exclude<Verdict, { kind: "kept" }> => v.kind !== "kept");
  const before = live.map((v) => v.before);
  const after = live.map((v) => (v.kind === "recomputed" ? v.after : v.before));
  const moved = verdicts.filter((v): v is Extract<Verdict, { kind: "recomputed" }> => v.kind === "recomputed" && v.after !== v.before);
  const deltas = new Map<number, number>();
  for (const v of moved) deltas.set(v.after - v.before, (deltas.get(v.after - v.before) ?? 0) + 1);
  const stars = (xs: number[]) => {
    const n = [0, 0, 0, 0, 0, 0];
    for (const x of xs) n[starsFor(x) - 1]++;
    return n;
  };
  /** Les fiches qui partagent leur note avec au moins une autre. */
  const ties = (xs: number[]) => {
    const c = new Map<number, number>();
    for (const x of xs) c.set(x, (c.get(x) ?? 0) + 1);
    return [...c.values()].filter((k) => k > 1).reduce((s, k) => s + k, 0);
  };
  const count = (k: Verdict["kind"]) => verdicts.filter((v) => v.kind === k).length;
  return {
    live: live.length,
    recomputed: count("recomputed"),
    moved: moved.length,
    reread: count("reread"),
    current: count("current"),
    kept: count("kept"),
    deltas: [...deltas.entries()].sort((a, b) => a[0] - b[0]),
    starsBefore: stars(before),
    starsAfter: stars(after),
    tiesBefore: ties(before),
    tiesAfter: ties(after),
  };
}

function report(s: ReturnType<typeof summary>, verdicts: Verdict[], write: boolean) {
  const out: string[] = [];
  out.push(`Barème ${SCORING.version}. Fiches vivantes : ${s.live} (déjà à jour ${s.current}). Gardées telles quelles : ${s.kept} (pièces de dossier, fiches remplacées, sans grille).`);
  out.push(`Recalculées : ${s.recomputed}, dont ${s.moved} changent de note.`);
  out.push(`À relire (lecture non gardée, laissées telles quelles) : ${s.reread}.`);
  const why = new Map<string, number>();
  for (const v of verdicts) if (v.kind === "reread") why.set(v.why, (why.get(v.why) ?? 0) + 1);
  for (const [w, n] of why) out.push(`  ${w} : ${n}`);
  const notes = verdicts.filter((v) => v.kind === "reread").map((v) => (v as { before: number }).before).sort((a, b) => a - b);
  if (notes.length) out.push(`  leurs notes d'aujourd'hui : ${notes.join(", ")}`);
  out.push(`Écarts : ${s.deltas.length ? s.deltas.map(([d, n]) => `${d > 0 ? "+" : ""}${d} × ${n}`).join(", ") : "aucun"}.`);
  out.push(`Étoiles 1 à 6, avant : ${s.starsBefore.join(" / ")} ; après : ${s.starsAfter.join(" / ")}.`);
  out.push(`Fiches à égalité avec une autre, avant : ${s.tiesBefore} ; après : ${s.tiesAfter}.`);
  out.push(write ? "Écrit." : "À blanc : rien d'écrit. Relancer avec --oui pour écrire.");
  console.log(out.join("\n"));
}

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes("--oui");
  const at = args.indexOf("--db");
  const dbPath = resolve(at >= 0 && args[at + 1] ? args[at + 1] : (process.env.DB_PATH ?? join(import.meta.dirname, "../var/cards.db")));
  if (!existsSync(dbPath)) {
    console.error(`Base introuvable : ${dbPath}`);
    process.exit(1);
  }
  const db = new Database(dbPath, { readonly: !write, fileMustExist: true });
  const rows = db.prepare(`SELECT id, parent_id, kind, source, superseded_by, json, facts_json, ai_json FROM cards ORDER BY created_at`).all() as RawRow[];
  const verdicts = rows.map((r) => verdictOf(r));
  const s = summary(verdicts);
  const changed = verdicts.filter((v): v is Extract<Verdict, { kind: "recomputed" }> => v.kind === "recomputed");
  if (write && changed.length) {
    const update = db.prepare(`UPDATE cards SET json = ? WHERE id = ? AND parent_id IS NULL AND superseded_by IS NULL`);
    db.transaction(() => {
      for (const v of changed) update.run(JSON.stringify(v.data), v.id);
    })();
    // Les images partagées portent la note : elles se refont à la prochaine demande.
    const { removeImages } = await import("../server/src/app");
    await removeImages(join(dirname(dbPath), "og", IMAGE_DESIGN_DIR), changed.filter((v) => v.after !== v.before).map((v) => v.id));
  }
  db.close();
  report(s, verdicts, write);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
