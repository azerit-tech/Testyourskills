// Le champ unique de l'accueil (SPEC §18.24) : un pseudo GitHub, une adresse
// GitHub, ou une adresse de profil LinkedIn. Même détection côté front et
// côté serveur.

const GITHUB_LOGIN_RE = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

/** Slug de profil LinkedIn : lettres (accents compris), chiffres, tiret, soulignement. */
const SLUG_RE = /^[\p{L}\p{N}_-]{3,100}$/u;

/** Hôtes LinkedIn : linkedin.com, www., et les sous-domaines de pays (fr., de.…). */
const LINKEDIN_HOST_RE = /^(?:[a-z]{2,3}\.|www\.)?linkedin\.com$/i;

/**
 * Normalise une adresse de profil LinkedIn, ou null si ce n'en est pas une.
 * Accepte « linkedin.com/in/lea », « https://fr.linkedin.com/in/Léa-M/?trk=x »,
 * « www.linkedin.com/in/lea-m-123/details/ ». Refuse les pages d'entreprise,
 * les anciens /pub/, les autres domaines. Sortie : https://www.linkedin.com/in/<slug>,
 * slug en minuscules et encodé, qui sert aussi de clé de cache.
 */
export function normalizeLinkedinUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s || s.length > 300) return null;
  let u: URL;
  try {
    u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username || u.password || u.port) return null;
  if (!LINKEDIN_HOST_RE.test(u.hostname)) return null;
  const parts = u.pathname.split("/").filter(Boolean);
  if (parts[0]?.toLowerCase() !== "in" || !parts[1]) return null;
  let slug: string;
  try {
    slug = decodeURIComponent(parts[1]);
  } catch {
    return null;
  }
  slug = slug.normalize("NFC").toLowerCase();
  if (!SLUG_RE.test(slug)) return null;
  return `https://www.linkedin.com/in/${encodeURIComponent(slug)}`;
}

/** Pseudo GitHub tiré de « lea », « @lea », « github.com/lea », « https://github.com/lea/repo », sinon null. */
export function parseGithubLogin(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let s = raw.trim();
  if (!s || s.length > 200) return null;
  s = s.replace(/^@/, "");
  const m = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/?#\s]+)/i.exec(s);
  if (m) s = m[1]!;
  else if (/[/.:]/.test(s)) return null;
  s = s.replace(/\/+$/, "");
  return GITHUB_LOGIN_RE.test(s) ? s : null;
}

export type Entry = { kind: "github"; login: string } | { kind: "linkedin"; url: string };

/** Ce que contient le champ : un GitHub, un LinkedIn, ou rien d'utilisable (null). */
export function detectEntry(raw: unknown): Entry | null {
  if (typeof raw !== "string") return null;
  if (/linkedin\.com/i.test(raw)) {
    const url = normalizeLinkedinUrl(raw);
    return url ? { kind: "linkedin", url } : null;
  }
  const login = parseGithubLogin(raw);
  return login ? { kind: "github", login } : null;
}

// --- Les deux portes de l'accueil -------------------------------------------
// Le formulaire montre deux portes, LinkedIn d'abord, puis GitHub. Le champ de
// la porte LinkedIn porte le préfixe fixe « linkedin.com/in/ » : on y tape ce qui
// suit, ou on y colle le lien entier. Une adresse de l'autre porte bascule.

export type Door = "linkedin" | "github";

/** Le slug décodé d'un lien de profil LinkedIn valide (« céline-dupré »), sinon null. */
export function linkedinSlug(raw: unknown): string | null {
  const url = normalizeLinkedinUrl(raw);
  if (!url) return null;
  return decodeURIComponent(url.slice("https://www.linkedin.com/in/".length));
}

/**
 * Ce que donne le champ d'une porte à l'envoi.
 * - `linkedin` / `github` : de quoi lancer la fiche ; `switchTo` quand l'entrée
 *   appartient à l'autre porte (le formulaire bascule, puis lance) ;
 * - `error` : `empty` (rien de tapé), `linkedin` (pas un profil LinkedIn),
 *   `github` (pas un pseudo GitHub).
 */
export type DoorResult =
  | { kind: "linkedin"; url: string; switchTo?: Door }
  | { kind: "github"; login: string; switchTo?: Door }
  | { kind: "error"; error: "empty" | "linkedin" | "github" };

export function resolveDoor(door: Door, raw: string): DoorResult {
  const s = raw.trim();
  if (!s) return { kind: "error", error: "empty" };
  const hasLinkedin = /linkedin\.com/i.test(s);
  const hasGithub = !hasLinkedin && /github\.com/i.test(s);
  if (door === "linkedin") {
    if (hasGithub) {
      const login = parseGithubLogin(s);
      return login ? { kind: "github", login, switchTo: "github" } : { kind: "error", error: "linkedin" };
    }
    // Ce qui suit le préfixe : « camille-ardent », « /in/camille-ardent », « in/camille-ardent/ ».
    const url = normalizeLinkedinUrl(hasLinkedin ? s : `linkedin.com/in/${s.replace(/^\/?(?:in\/)?/i, "")}`);
    return url ? { kind: "linkedin", url } : { kind: "error", error: "linkedin" };
  }
  if (hasLinkedin) {
    const url = normalizeLinkedinUrl(s);
    return url ? { kind: "linkedin", url, switchTo: "linkedin" } : { kind: "error", error: "linkedin" };
  }
  const login = parseGithubLogin(s);
  return login ? { kind: "github", login } : { kind: "error", error: "github" };
}
