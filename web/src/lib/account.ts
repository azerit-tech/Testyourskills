// Le compte léger côté front (SPEC §18.91) : ce que /api/me en dit, gardé en mémoire
// et en indice local pour que la barre et l'entrée l'aient dès la première image,
// puis vérifié auprès du serveur. Jamais d'erreur : au moindre doute, pas de compte.
import { useEffect, useState } from "react";
import { api, isMock, setMockAccount, mockAccount, type Account, type AccountSource } from "./api";
import { forgetMine } from "./session";

export type { Account, AccountSource };

const HINT_KEY = "tys_account";
/** Envoyé sur window quand le compte connu change. */
export const ACCOUNT_EVENT = "tys:account";

let mem: Account | null | undefined;

function readHint(): Account | null {
  try {
    const raw = localStorage.getItem(HINT_KEY);
    if (!raw) return null;
    const a = JSON.parse(raw) as Partial<Account>;
    if (!Array.isArray(a.sources)) return null;
    return {
      cardId: typeof a.cardId === "string" ? a.cardId : null,
      cardLogin: typeof a.cardLogin === "string" ? a.cardLogin : null,
      ...(a.cardLinkedin === true ? { cardLinkedin: true } : {}),
      overall: typeof a.overall === "number" ? a.overall : null,
      sources: a.sources.filter((s): s is AccountSource => s === "linkedin" || s === "github"),
      avatarUrl: typeof a.avatarUrl === "string" ? a.avatarUrl : null,
      initial: typeof a.initial === "string" ? a.initial : null,
      known: a.known === true,
    };
  } catch {
    return null;
  }
}

/** Le compte connu tout de suite (cette page, ou l'indice local), sinon null. Synchrone. */
export function knownAccount(): Account | null {
  if (mem !== undefined) return mem;
  return isMock() ? mockAccount() : readHint();
}

function setKnown(a: Account | null) {
  mem = a;
  try {
    if (a) localStorage.setItem(HINT_KEY, JSON.stringify(a));
    else localStorage.removeItem(HINT_KEY);
  } catch {
    /* stockage bloqué : la RAM suffit */
  }
  try {
    window.dispatchEvent(new Event(ACCOUNT_EVENT));
  } catch {
    /* hors navigateur */
  }
}

let loading: Promise<Account | null> | null = null;
/** Demande le compte au serveur (une fois par page, sauf `force`). */
export function loadAccount(force = false): Promise<Account | null> {
  if (!loading || force) {
    loading = api.getAccount().then((a) => {
      setKnown(a);
      return a;
    });
  }
  return loading;
}

/** Pour les tests : comme une page qui vient de se charger. */
export function resetAccount() {
  mem = undefined;
  loading = null;
}

/** Le compte, relu dès qu'il change. */
export function useAccount(): Account | null {
  const [a, setA] = useState<Account | null>(knownAccount);
  useEffect(() => {
    const on = () => setA(knownAccount());
    window.addEventListener(ACCOUNT_EVENT, on);
    void loadAccount().then(on);
    return () => window.removeEventListener(ACCOUNT_EVENT, on);
  }, []);
  return a;
}

/** Se déconnecter : les deux cookies, et ce navigateur oublie la fiche du compte. */
export async function signOut(): Promise<void> {
  const was = knownAccount();
  await api.logout().catch(() => undefined);
  if (was?.cardId) forgetMine(was.cardId);
  setKnown(null);
}

// --- Démo ----------------------------------------------------------------------

/** Démo : la connexion crée le compte, ou y ajoute la source ; rend la fiche du compte s'il en a une. */
export function mockSignIn(source: AccountSource): string | null {
  const a = mockAccount();
  const next: Account = a
    ? { ...a, sources: a.sources.includes(source) ? a.sources : [...a.sources, source] }
    : { cardId: null, cardLogin: null, overall: null, sources: [source], avatarUrl: source === "linkedin" ? "/mock-linkedin.svg" : null, initial: "L", known: false };
  setMockAccount(next);
  return next.cardId;
}

/** Démo : la fiche lancée par l'entrée connectée va au compte, comme sur le serveur. */
export function mockLinkCard(cardId: string) {
  const a = mockAccount();
  if (a) setMockAccount({ ...a, cardId });
}
