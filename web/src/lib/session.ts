// Mémoire de session : pré-remplissage de l'entrée et cartes fraîches (en RAM),
// origine du visiteur venu par un lien partagé (sessionStorage).
import type { Fact } from "../../../shared/types";

export type Mode = "single" | "both";
export type Tab = "github" | "cv";

export interface Prefill {
  mode?: Mode;
  tab?: Tab;
  login?: string;
  file?: File | null;
  error?: Fact | string | null;
}

let prefill: Prefill | null = null;
/** Dernière saisie, pour « Réessayer » ou « Ajoute ton CV ». */
let lastInput: { login?: string; file?: File | null } = {};
/** Cartes demandées dans cet onglet : elles ont droit à l'ouverture de pack. */
const fresh = new Map<string, number>();

export function setPrefill(p: Prefill) {
  prefill = { file: lastInput.file ?? null, ...p };
}

/** Pré-remplit l'entrée avec la dernière saisie (bouton « Réessayer »). */
export function prefillFromLast(error: Fact | string | null) {
  const { login, file } = lastInput;
  prefill = { login, file: file ?? null, mode: login && file ? "both" : "single", tab: file && !login ? "cv" : "github", error };
}

export function takePrefill(): Prefill | null {
  const p = prefill;
  prefill = null;
  return p;
}

export function rememberInput(i: { login?: string; file?: File | null }) {
  lastInput = i;
}

export function markFresh(id: string) {
  fresh.set(id, Date.now());
}

export function freshSince(id: string): number | null {
  return fresh.get(id) ?? null;
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

export function rememberMine(card: MyCard) {
  memMine = { id: card.id, login: card.login ? card.login.toLowerCase() : null, overall: card.overall };
  try {
    localStorage.setItem(MINE_KEY, JSON.stringify(memMine));
  } catch {
    /* stockage bloqué : la RAM suffit pour cette visite */
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
