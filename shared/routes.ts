// Premiers segments d'adresse réservés au site : jamais pris pour un pseudo GitHub
// (§18.27). Une seule liste, lue par le front (App.tsx) et le serveur (app.ts).

/** Pages annoncées mais pas encore construites : leur adresse ramène à l'accueil. */
export const UPCOMING_PAGES = ["primes", "reglement", "vs", "badge", "u"] as const;

/** Routes qui existent déjà, côté front ou serveur. */
const SITE_ROUTES = ["c", "bandes", "api", "og", "auth", "avatar", "assets", "3d", "privacy", "confidentialite", "__devices"] as const;

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
