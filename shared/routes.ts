// Premiers segments d'adresse réservés au site : jamais pris pour un pseudo GitHub
// (§18.27). Une seule liste, lue par le front (App.tsx) et le serveur (app.ts).

/** Pages annoncées mais pas encore construites : leur adresse ramène à l'accueil. */
export const UPCOMING_PAGES = ["vs", "badge", "u"] as const;

/** L'ancre du classement des écoles et des boîtes sur l'accueil (§18.101) : « Classement » y mène, les anciennes adresses /bandes aussi. */
export const RANKING_ANCHOR = "classement";

/** Routes qui existent déjà, côté front ou serveur. « bandes » reste réservé : ses anciennes adresses redirigent vers le classement (§18.101). */
const SITE_ROUTES = ["c", "bandes", "primes", "reglement", "api", "og", "auth", "avatar", "assets", "3d", "privacy", "confidentialite", "credits", "__devices"] as const;

export const RESERVED_SEGMENTS: ReadonlySet<string> = new Set<string>([...UPCOMING_PAGES, ...SITE_ROUTES]);

const UPCOMING: ReadonlySet<string> = new Set<string>(UPCOMING_PAGES);

/** Premier segment d'un chemin, en minuscules (« /Primes/x » → « primes »). */
function firstSegment(path: string): string {
  return (path.split("/").find((s) => s !== "") ?? "").toLowerCase();
}

/** Un mot réservé, quelle que soit la casse. Un pseudo qui commence par lui (« usain ») passe. */
export function isReservedSegment(segment: string): boolean {
  return RESERVED_SEGMENTS.has(segment.toLowerCase());
}

/** Chemin d'une page à venir, ou d'un de ses sous-chemins : il ramène à l'accueil. */
export function isUpcomingPath(path: string): boolean {
  return UPCOMING.has(firstSegment(path));
}

const LOGIN_RE = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

/**
 * Un chemin que le site sait afficher (le routeur du front, web/src/lib/router.ts).
 * Les autres reçoivent la page introuvable du site, en 404 pour les robots. La
 * fiche et la prime inconnues ont leur propre 404 (app.ts, primePages.ts).
 */
export function isSitePage(path: string): boolean {
  if (path === "/" || path === "") return true;
  if (/^\/c\/[A-Za-z0-9_-]+\/?$/.test(path)) return true;
  if (/^\/(confidentialite|privacy|credits)\/?$/.test(path)) return true;
  // Les anciennes adresses des bandes : 301 vers le classement de l'accueil (server/src/bandPages.ts, §18.101).
  if (/^\/bandes(?:\/|$)/i.test(path)) return true;
  if (/^\/primes(?:\/|$)/i.test(path) || /^\/reglement\/?$/i.test(path) || isUpcomingPath(path)) return true;
  // /{pseudo} : l'accueil, le champ prérempli.
  const one = /^\/([^/]+)\/?$/.exec(path)?.[1];
  if (!one) return false;
  let seg = one;
  try {
    seg = decodeURIComponent(one);
  } catch {
    /* gardé tel quel */
  }
  seg = seg.trim().replace(/^@/, "");
  return LOGIN_RE.test(seg) && !isReservedSegment(seg);
}
