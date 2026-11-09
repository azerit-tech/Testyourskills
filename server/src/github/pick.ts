// Choix des fichiers pour la lecture IA (SPEC §4.3) : 3 repos les plus actifs,
// jusqu'à 10 fichiers chacun, les plus modifiés par les derniers commits puis les
// plus gros, hors générés/vendored/lockfiles/minifiés, 40 Ko au total.
// Les contenus viennent de raw.githubusercontent.com, sans jeton : si aucun des
// fichiers choisis ne se télécharge (panne, limite par IP), la fonction lève
// plutôt que de rendre une liste vide, qui voudrait dire « rien à lire ».

import type { RepoFiles } from "../../../shared/readings";
import { SCORING } from "../scoring/config";
import { isSourceCandidate } from "./detect";
import type { GithubFacts } from "./facts";
import { makeCtx, rawFile, rest, soft, type GithubAuth } from "./http";

const PICK = {
  filesPerRepo: 10,
  totalBytes: 40 * 1024,
  commitsInspected: 12,
  minFileBytes: 400,
  maxTestFiles: 3,
};

const isTestFile = (p: string) => /(^|\/)(tests?|spec|__tests__)\/|[._-](test|spec)\.[a-z]+$|_test\.[a-z]+$|(^|\/)test_[^/]+$/i.test(p);

const enc = new TextEncoder();
const bytes = (s: string) => enc.encode(s).length;

/** Des fichiers étaient à lire, aucun n'a pu être téléchargé : la fiche sortirait sans lecture, comme si le code n'existait pas. */
export class NoFilesReadError extends Error {
  constructor(wanted: number) {
    super(`aucun des ${wanted} fichiers choisis n'a pu être téléchargé`);
    this.name = "NoFilesReadError";
  }
}

/** Tronque à `max` octets, à la dernière fin de ligne. */
export function truncateTo(text: string, max: number): string {
  if (bytes(text) <= max) return text;
  const marker = "\n/* … tronqué */\n";
  let cut = text.slice(0, Math.max(0, max - bytes(marker)));
  while (bytes(cut) > max - bytes(marker)) cut = cut.slice(0, -64);
  const nl = cut.lastIndexOf("\n");
  if (nl > cut.length / 2) cut = cut.slice(0, nl);
  return cut + marker;
}

export async function pickFilesForReading(facts: GithubFacts, opts: { token: GithubAuth; signal?: AbortSignal }): Promise<RepoFiles[]> {
  const ctx = makeCtx(opts.token, opts.signal);
  const byName = new Map(facts.repos.map((r) => [r.name, r]));
  const chosen = facts.activeRepos
    .map((n) => ({ repo: byName.get(n), tree: facts.trees.find((t) => t.repo === n && t.available) }))
    .filter((x) => x.repo && x.tree && x.tree.sourceFiles.length > 0)
    .slice(0, SCORING.github.readRepos);

  // Classement des fichiers de chaque repo : touchés par les derniers commits, puis taille.
  const ranked = await Promise.all(
    chosen.map(async ({ repo, tree }) => {
      const oids = facts.commits
        .filter((c) => c.repo === repo!.name)
        .slice(0, PICK.commitsInspected)
        .map((c) => c.oid);
      const details = await Promise.all(
        oids.map((oid) => soft(ctx, () => rest<{ files?: { filename: string }[] }>(ctx, `/repos/${repo!.fullName}/commits/${oid}`))),
      );
      const touches = new Map<string, number>();
      for (const d of details) for (const f of d?.data?.files ?? []) touches.set(f.filename, (touches.get(f.filename) ?? 0) + 1);
      const sorted = tree!.sourceFiles
        .filter((f) => isSourceCandidate(f.path, f.size) && f.size >= PICK.minFileBytes)
        .sort((a, b) => (touches.get(b.path) ?? 0) - (touches.get(a.path) ?? 0) || b.size - a.size || a.path.localeCompare(b.path));
      // Surtout du code applicatif, quelques tests pour juger leur pertinence.
      const tests = sorted.filter((f) => isTestFile(f.path)).slice(0, PICK.maxTestFiles);
      const code = sorted.filter((f) => !isTestFile(f.path));
      const files = [...code.slice(0, PICK.filesPerRepo - tests.length), ...tests];
      return { repo: repo!, files };
    }),
  );

  // Contenus, répartis sur le budget total.
  let remaining = PICK.totalBytes;
  let wanted = 0;
  let fetched = 0;
  const out: RepoFiles[] = [];
  for (let i = 0; i < ranked.length; i++) {
    const { repo, files } = ranked[i];
    const contents = await Promise.all(files.map((f) => soft(ctx, () => rawFile(ctx, repo.fullName, repo.defaultBranch, f.path, 150_000))));
    wanted += files.length;
    fetched += contents.filter((c) => c !== null).length;
    const valid = files.map((f, j) => ({ path: f.path, content: contents[j] })).filter((f) => f.content && !f.content.includes("\u0000"));
    let budget = Math.floor(remaining / (ranked.length - i));
    const picked: { path: string; content: string }[] = [];
    for (let j = 0; j < valid.length && budget > 200; j++) {
      const share = Math.floor(budget / (valid.length - j));
      const content = truncateTo(valid[j].content!, Math.max(share, Math.min(budget, 1500)));
      picked.push({ path: valid[j].path, content });
      budget -= bytes(content);
      remaining -= bytes(content);
    }
    if (picked.length) out.push({ repo: repo.name, activity: Math.max(1, repo.activity), files: picked });
  }
  if (wanted > 0 && fetched === 0) throw new NoFilesReadError(wanted);
  return out;
}
