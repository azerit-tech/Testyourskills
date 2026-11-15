// Mémoire de session : pré-remplissage de l'entrée et cartes fraîches (en RAM),
// origine du visiteur venu par un lien partagé (sessionStorage).
import { linkedinSlug, type Door } from "../../../shared/entry";
import type { Fact } from "../../../shared/types";

export type Mode = "single" | "both";
export type Tab = "github" | "cv";

export interface Prefill {
  mode?: Mode;
  tab?: Tab;
  login?: string;
  file?: File | null;
  error?: Fact | string | null;
  /** L'erreur est une limite (commissariat fermé) : le même toucher échouerait encore. */
  blocked?: boolean;
}

let prefill: Prefill | null = null;
/** Dernière saisie, pour « Réessayer » ou « Ajoute ton CV ». */
let lastInput: { login?: string; file?: File | null } = {};
/** Cartes demandées dans cet onglet : elles ont droit à l'ouverture de pack. */
const fresh = new Map<string, number>();
/** Le pseudo GitHub tapé pour chacune : l'attente en montre l'avatar dès la première seconde (§18.27). */
const freshLogins = new Map<string, string>();
/** Le nom du lien LinkedIn collé pour chacune (« camille-ardent ») : la plaque de l'attente le porte. */
const freshSlugs = new Map<string, string>();

export function setPrefill(p: Prefill) {
  prefill = { file: lastInput.file ?? null, ...p };
}

/** Pré-remplit l'entrée avec la dernière saisie (bouton « Réessayer »). `blocked` : une limite, pas une faute de saisie. */
export function prefillFromLast(error: Fact | string | null, blocked = false) {
  const { login, file } = lastInput;
  // Le dossier vient d'échouer : l'accueil n'a plus à y ramener.
  clearPending();
  prefill = { login, file: file ?? null, mode: login && file ? "both" : "single", tab: file && !login ? "cv" : "github", error, blocked };
}

/**
 * Le préremplissage en attente, sans le consommer : un rendu peut être jeté
 * avant d'être affiché (page chargée à la demande, rendu repris), et le
 * formulaire qui reste à l'écran doit encore le trouver (`/<pseudo>`, §18.48).
 * Le formulaire affiché le retire ensuite (`dropPrefill`).
 */
export function peekPrefill(): Prefill | null {
  return prefill;
}

/** Le formulaire affiché a repris ce préremplissage : il ne sert plus. */
export function dropPrefill(p: Prefill | null) {
  if (p && prefill === p) prefill = null;
}

/** Lit et retire le préremplissage d'un coup (hors d'un rendu React). */
export function takePrefill(): Prefill | null {
  const p = prefill;
  prefill = null;
  return p;
}

export function rememberInput(i: { login?: string; file?: File | null }) {
  lastInput = i;
}

/** `login` : le pseudo GitHub de la demande, s'il y en a un (ni lien LinkedIn, ni CV seul). `cv` : un CV joint. */
export function markFresh(id: string, login?: string | null, linkedin?: string | null, cv = false) {
  fresh.set(id, Date.now());
  if (login) freshLogins.set(id, login);
  if (cv) freshCvs.add(id);
  memPending = { id, at: Date.now() };
  writeSession(PENDING_KEY, JSON.stringify(memPending));
  seen.delete(id);
  writeSession(OWED_KEY, id);
  const slug = linkedin ? linkedinSlug(linkedin) : null;
  if (slug) freshSlugs.set(id, slug);
  writeSession(SOURCE_KEY, JSON.stringify({ id, login: login ?? null, slug, cv }));
}

/** Les sources de la dernière demande, recopiées pour un rechargement en pleine attente : la plaque garde son nom. */
const SOURCE_KEY = "tys_fresh_src";
const freshCvs = new Set<string>();

function storedSource(id: string): { login: string | null; slug: string | null; cv: boolean } | null {
  try {
    const v = JSON.parse(readSession(SOURCE_KEY) ?? "null") as { id?: unknown; login?: unknown; slug?: unknown; cv?: unknown } | null;
    if (!v || v.id !== id) return null;
    return { login: typeof v.login === "string" ? v.login : null, slug: typeof v.slug === "string" ? v.slug : null, cv: v.cv === true };
  } catch {
    return null;
  }
}

/** Le nom du lien LinkedIn collé pour cette fiche dans cet onglet, ou null. */
export function freshSlug(id: string): string | null {
  return freshSlugs.get(id) ?? storedSource(id)?.slug ?? null;
}

/** Un CV a été joint à cette demande, dans cet onglet. */
export function freshCv(id: string): boolean {
  return freshCvs.has(id) || storedSource(id)?.cv === true;
}

// --- Le film joue une fois (§18.48) ------------------------------------------
// Une fiche demandée ici a droit à son film tant qu'il ne s'est pas posé (vu en
// entier, passé, ou replié faute de pouvoir jouer) ; ensuite, revenir sur la
// fiche ne le relance plus, seul « Revoir ma poursuite » le fait. La marque
// « fraîche » elle-même reste (elle dit aussi à qui est la fiche). La dette est
// recopiée dans sessionStorage : une page rechargée en plein film le rejoue,
// depuis le début, la personne ne l'ayant pas vu.

const OWED_KEY = "tys_film_owed";
/** Les fiches dont le film s'est posé dans cet onglet. */
const seen = new Set<string>();

/** Le film de cette fiche reste à voir : demandée ici (ou rechargée en plein film), pas encore posée. */
export function filmOwed(id: string): boolean {
  if (seen.has(id)) return false;
  return fresh.has(id) || readSession(OWED_KEY) === id;
}

/** Le film s'est posé (vu, passé ou replié) : il ne rejouera plus seul. */
export function markFilmSeen(id: string) {
  seen.add(id);
  if (readSession(OWED_KEY) === id) removeSession(OWED_KEY);
}

/** Le pseudo GitHub tapé pour cette fiche dans cet onglet, ou null. */
export function freshLogin(id: string): string | null {
  return freshLogins.get(id) ?? storedSource(id)?.login ?? null;
}

export function freshSince(id: string): number | null {
  return fresh.get(id) ?? null;
}

// --- Le dossier en cours (§18.48) --------------------------------------------
// La dernière demande partie de cet onglet. Tant que sa fiche n'est pas sortie,
// l'accueil y ramène (« Ton dossier s'ouvre encore »). RAM, recopiée dans
// sessionStorage pour survivre à un rechargement.

const PENDING_KEY = "tys_pending";
/** Passé ce délai, le serveur a tranché depuis longtemps : le dossier n'est plus « en cours ». */
export const PENDING_MAX_MS = 10 * 60_000;
let memPending: { id: string; at: number } | null = null;

/** L'id du dossier demandé dans cet onglet et pas encore vu fini, ou null. */
export function pendingFile(now = Date.now()): string | null {
  let p = memPending;
  if (!p) {
    try {
      const v = JSON.parse(readSession(PENDING_KEY) ?? "null") as { id?: unknown; at?: unknown } | null;
      if (v && typeof v.id === "string" && typeof v.at === "number") p = { id: v.id, at: v.at };
    } catch {
      /* rien */
    }
  }
  return p && p.id && now - p.at < PENDING_MAX_MS ? p.id : null;
}

/** Le dossier est sorti, ou a échoué. Avec un id : seulement si c'est encore celui-là. */
export function clearPending(id?: string) {
  if (id && pendingFile() !== id) return;
  memPending = null;
  writeSession(PENDING_KEY, "");
}

// --- La porte de l'entrée ----------------------------------------------------
// LinkedIn ou GitHub : la porte choisie tient pour la session, d'un formulaire à
// l'autre (accueil, « Et toi ? ») et d'une page à l'autre. RAM, recopiée dans
// sessionStorage pour survivre à un rechargement.

const DOOR_KEY = "tys_door";
let memDoor: Door | null = null;

export function sessionDoor(): Door {
  if (memDoor) return memDoor;
  const stored = readSession(DOOR_KEY);
  return stored === "github" || stored === "linkedin" ? stored : "linkedin";
}

export function rememberDoor(door: Door) {
  memDoor = door;
  writeSession(DOOR_KEY, door);
}

// --- Ma fiche (§18.7) --------------------------------------------------------
// La dernière fiche faite ou revendiquée dans ce navigateur, pour la ligne de
// comparaison d'une fiche partagée (« Toi 78 · @X 71 »). localStorage, repli en
// RAM si le stockage est bloqué.

export interface MyCard {
  id: string;
  login: string | null;
  overall: number;
}

const MINE_KEY = "tys_mine";
let memMine: MyCard | null = null;
/** Envoyé sur window quand la fiche en mémoire change : la barre du haut y gagne « Ma fiche ». */
export const MINE_EVENT = "tys:mine";

export function rememberMine(card: MyCard) {
  memMine = { id: card.id, login: card.login ? card.login.toLowerCase() : null, overall: card.overall };
  clearPending(card.id);
  try {
    localStorage.setItem(MINE_KEY, JSON.stringify(memMine));
  } catch {
    /* stockage bloqué : la RAM suffit pour cette visite */
  }
  try {
    window.dispatchEvent(new Event(MINE_EVENT));
  } catch {
    /* hors navigateur */
  }
}

export function myCard(): MyCard | null {
  try {
    const raw = localStorage.getItem(MINE_KEY);
    if (raw) {
      const v = JSON.parse(raw) as Partial<MyCard>;
      if (typeof v.id === "string" && typeof v.overall === "number" && Number.isFinite(v.overall)) {
        return { id: v.id, login: typeof v.login === "string" ? v.login : null, overall: v.overall };
      }
    }
  } catch {
    /* rien */
  }
  return memMine;
}

/** Fiches dénoncées depuis ce navigateur (§18.6) : leur dénonciateur n'y voit pas « Avis de recherche à ton nom ». */
const DENOUNCED_KEY = "tys_denounced";
const memDenounced = new Set<string>();

export function rememberDenounced(id: string) {
  memDenounced.add(id);
  try {
    const list = JSON.parse(localStorage.getItem(DENOUNCED_KEY) ?? "[]") as unknown;
    const ids = Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : [];
    if (!ids.includes(id)) ids.push(id);
    localStorage.setItem(DENOUNCED_KEY, JSON.stringify(ids.slice(-50)));
  } catch {
    /* la RAM suffit */
  }
}

export function iDenounced(id: string): boolean {
  if (memDenounced.has(id)) return true;
  try {
    const list = JSON.parse(localStorage.getItem(DENOUNCED_KEY) ?? "[]") as unknown;
    return Array.isArray(list) && list.includes(id);
  } catch {
    return false;
  }
}

// --- Origine du visiteur (§18.0) ---------------------------------------------
// Un lien partagé porte ?r={id de la fiche}. On garde la première origine de la
// session dans sessionStorage, pour la joindre aux fiches créées ensuite. Le
// stockage peut être bloqué (navigateur intégré de LinkedIn) : chaque accès est
// protégé, et la RAM prend le relais pour la page en cours.

const REF_KEY = "tys_ref";
const REF_VISIT_KEY = "tys_ref_visit";
/** Format des ids de fiche : 10 caractères base62 (newId côté serveur). */
const CARD_ID_RE = /^[A-Za-z0-9]{10}$/;

let memRef: string | null = null;
let memVisitSent = false;

function readSession(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSession(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* stockage bloqué : la RAM suffit pour cette page */
  }
}

function removeSession(key: string) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* rien */
  }
}

/** Origine de la session : l'id de la fiche par le lien de laquelle on est arrivé. */
export function currentRef(): string | null {
  const stored = readSession(REF_KEY);
  return stored && CARD_ID_RE.test(stored) ? stored : memRef;
}

/**
 * À l'arrivée : lit ?r=, garde la première origine valide de la session et
 * retire r de la barre d'adresse sans recharger ni changer de route. Renvoie
 * l'origine si la visite est à compter (une seule fois par session), sinon null.
 */
export function captureRef(): string | null {
  let url: URL;
  try {
    url = new URL(window.location.href);
  } catch {
    return null;
  }
  if (!url.searchParams.has("r")) return null;
  const r = url.searchParams.get("r") ?? "";
  url.searchParams.delete("r");
  try {
    // Même chemin, même état : le routeur n'a rien à recalculer.
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  } catch {
    /* rien */
  }
  if (!CARD_ID_RE.test(r)) return null;
  if (!currentRef()) {
    memRef = r;
    writeSession(REF_KEY, r);
  }
  if (memVisitSent || readSession(REF_VISIT_KEY)) return null;
  memVisitSent = true;
  writeSession(REF_VISIT_KEY, "1");
  return currentRef();
}
