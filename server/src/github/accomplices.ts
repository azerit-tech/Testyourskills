// « Dénonce un complice » (SPEC §18.6) : les suggestions sont les gens qui
// committent avec le joueur, lus dans les contributeurs de ses repos actifs
// pendant la collecte. Pur et testé : pas d'appel ici.

export interface Accomplice {
  login: string;
  avatarUrl: string;
  /** Total de ses commits sur les repos actifs du joueur (« Complice principal », §18.26) ; absent des faits d'avant. */
  commits?: number;
}

/** Une ligne de GET /repos/{repo}/contributors. */
export interface RawContributor {
  login?: unknown;
  type?: unknown;
  avatar_url?: unknown;
  contributions?: unknown;
}

/** Combien on en garde dans les faits : trois s'affichent, les autres remplacent ceux qui ont masqué leur fiche. */
export const MAX_ACCOMPLICES = 6;

const LOGIN_RE = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

/**
 * Les complices d'un joueur : contributeurs de ses repos actifs, sans lui, sans
 * les bots (`type: Bot` ou login en `[bot]`), chacun une fois, du plus gros
 * total de commits au plus petit (à égalité, l'ordre d'apparition).
 */
export function pickAccomplices(lists: (RawContributor[] | null | undefined)[], self: string, max = MAX_ACCOMPLICES): Accomplice[] {
  const me = self.toLowerCase();
  const seen = new Map<string, { a: Accomplice; total: number; first: number }>();
  let order = 0;
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const c of list) {
      if (!c || typeof c.login !== "string") continue;
      // Les bots d'application ont un login en « [bot] », que la regex refuse déjà.
      if (c.type === "Bot" || /\[bot\]$/i.test(c.login) || !LOGIN_RE.test(c.login)) continue;
      const key = c.login.toLowerCase();
      if (key === me) continue;
      const n = typeof c.contributions === "number" && Number.isFinite(c.contributions) ? c.contributions : 0;
      const prev = seen.get(key);
      if (prev) {
        prev.total += n;
        continue;
      }
      const avatarUrl =
        typeof c.avatar_url === "string" && c.avatar_url.startsWith("https://") ? c.avatar_url : `https://github.com/${c.login}.png`;
      seen.set(key, { a: { login: c.login, avatarUrl }, total: n, first: order++ });
    }
  }
  return [...seen.values()]
    .sort((x, y) => y.total - x.total || x.first - y.first)
    .slice(0, max)
    .map((v) => ({ ...v.a, commits: v.total }));
}
