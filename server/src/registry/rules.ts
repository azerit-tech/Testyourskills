// Le meilleur lien GitHub ↔ LinkedIn d'un compte, d'après les lignes de
// `account_links`, avec les règles de l'App Azerit (identity_store.py :
// `_effective`, `_is_rejected`, `known_links`), pour qu'une fiche ne croie
// jamais un lien que l'App elle-même ne servirait pas.

/** Forces de l'App : 3 vérifié par un opérateur, 2 déclaré par la personne ou livré, 1 trouvé par une recherche. */
export const VERIFIED = 3;
export const DECLARED = 2;
export const SEARCHED = 1;

/** Une ligne d'`account_links` vue d'un compte : l'autre côté (`other`, son `handle_key`) et la preuve. */
export interface LinkRow {
  other: string;
  source: string;
  strength: number;
  rejected: boolean;
  observedAt: string;
}

export interface BestLink {
  key: string;
  strength: number;
}

/** Une recherche (web, Brave, Haiku) n'est jamais « déclarée » : sa force plafonne à 1. */
const isSearch = (source: string) => /search|haiku/i.test(source);

/**
 * Les liens encore valables, par compte d'en face : la force effective
 * recalculée (recherche plafonnée à 1 ; `cv_fetch_declared` jamais au-dessus des
 * lignes antérieures du même couple), puis les rejets, qui ne tombent que devant
 * un lien vérifié, ou déclaré après le rejet. Les lignes sont dans l'ordre
 * d'écriture.
 */
export function validLinks(rows: LinkRow[]): Map<string, { strength: number; observedAt: string }> {
  const seen = new Map<string, number>();
  const effective: LinkRow[] = [];
  const rejectedAt = new Map<string, string>();
  for (const r of rows) {
    if (r.rejected) {
      const prev = rejectedAt.get(r.other);
      if (prev === undefined || r.observedAt > prev) rejectedAt.set(r.other, r.observedAt);
      continue;
    }
    let s = r.strength;
    if (isSearch(r.source)) s = Math.min(s, SEARCHED);
    if (r.source === "cv_fetch_declared" && seen.has(r.other)) s = Math.min(s, seen.get(r.other)!);
    seen.set(r.other, Math.max(seen.get(r.other) ?? 0, s));
    effective.push({ ...r, strength: s });
  }
  const out = new Map<string, { strength: number; observedAt: string }>();
  for (const r of effective) {
    if (r.strength < SEARCHED) continue;
    const when = rejectedAt.get(r.other);
    if (when !== undefined && r.strength < VERIFIED && !(r.strength >= DECLARED && r.observedAt > when)) continue;
    const cur = out.get(r.other);
    if (!cur || r.strength > cur.strength || (r.strength === cur.strength && r.observedAt >= cur.observedAt)) out.set(r.other, { strength: r.strength, observedAt: r.observedAt });
  }
  return out;
}

/** Le lien le plus fort, puis le plus récent. */
export function strongest(valid: Map<string, { strength: number; observedAt: string }>): BestLink | null {
  let best: { key: string; strength: number; observedAt: string } | null = null;
  for (const [key, v] of valid) {
    if (!best || v.strength > best.strength || (v.strength === best.strength && v.observedAt >= best.observedAt)) best = { key, ...v };
  }
  return best ? { key: best.key, strength: best.strength } : null;
}

/**
 * Le seul compte d'en face, ou celui qu'un opérateur a vérifié. Deux comptes
 * GitHub sur le même LinkedIn (deux personnes, ou une fusion à trancher) : aucun,
 * comme l'App, tant qu'un opérateur ne l'a pas vérifié.
 */
export function onlyOwner(valid: Map<string, { strength: number; observedAt: string }>): BestLink | null {
  if (valid.size === 1) return strongest(valid);
  const verified = [...valid].filter(([, v]) => v.strength >= VERIFIED);
  return verified.length === 1 ? { key: verified[0]![0], strength: verified[0]![1].strength } : null;
}

/**
 * Le meilleur lien d'un GitHub vaut-il pour lui seul ? Oui s'il est vérifié, ou
 * si aucun autre GitHub ne porte ce même LinkedIn. `back` : les lignes du
 * LinkedIn retenu, vues de lui. Plus prudent que l'App, qui ne compte que les
 * GitHub dont c'est aussi le meilleur lien : jamais un lien qu'elle refuserait.
 */
export function soleOwner(loginKey: string, best: BestLink, back: LinkRow[]): boolean {
  if (best.strength >= VERIFIED) return true;
  return [...validLinks(back).keys()].every((k) => k === loginKey);
}
