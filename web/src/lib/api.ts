// Client de l'API. En mode démo (?mock=1 ou VITE_MOCK=1), tout passe par mock.ts.
import type { CardData, JobState, Lang } from "../../../shared/types";
import { mockApi } from "./mock";
import { ApiError } from "./errors";
import { currentRef } from "./session";

export { ApiError };

export type AnalyticsEvent = "card_generated" | "card_shared" | "card_email" | "cta_azerit_clicked" | "shared_visit";

export interface CreateInput {
  login?: string;
  cv?: File;
  lang: Lang;
}

export interface CreateResult {
  id: string;
  deleteToken?: string;
  cached?: boolean;
}

const MOCK_KEY = "tys_mock";

/** Le mode démo est collant pendant la session, pour survivre aux navigations. */
export function isMock(): boolean {
  if (import.meta.env.VITE_MOCK === "1") return true;
  try {
    const q = new URLSearchParams(window.location.search).get("mock");
    if (q === "1") sessionStorage.setItem(MOCK_KEY, "1");
    if (q === "0") sessionStorage.removeItem(MOCK_KEY);
    return sessionStorage.getItem(MOCK_KEY) === "1";
  } catch {
    return false;
  }
}

async function readError(res: Response): Promise<ApiError> {
  const fallback =
    res.status === 429 ? "rate_limited" : res.status === 503 ? "busy" : res.status === 404 ? "not_found" : "internal";
  try {
    const body = await res.json();
    // Deux formes acceptées : { error: { code, message } } ou { state: "error", code, message }.
    const err = body?.error ?? body;
    const msg = err?.message && typeof err.message === "object" ? err.message : null;
    return new ApiError(res.status, err?.code ?? fallback, msg);
  } catch {
    return new ApiError(res.status, fallback, null);
  }
}

export interface AppConfig {
  linkedin: boolean;
}

let configPromise: Promise<AppConfig> | null = null;

/** Fonctions disponibles côté serveur (ex. connexion LinkedIn), lue une fois. */
function getConfig(): Promise<AppConfig> {
  if (!configPromise) {
    configPromise = isMock()
      ? Promise.resolve({ linkedin: true })
      : fetch("/api/config", { headers: { Accept: "application/json" } })
          .then((r): Promise<{ linkedin?: boolean }> => (r.ok ? r.json() : Promise.resolve({})))
          .then((c) => ({ linkedin: c?.linkedin === true }))
          .catch(() => ({ linkedin: false }));
  }
  return configPromise;
}

/** Démarre la connexion LinkedIn pour poser la photo sur la carte. */
function startLinkedInPhoto(id: string, token: string) {
  if (isMock()) {
    mockApi.setPhoto(id);
    // Simule le retour du serveur après l'autorisation.
    window.history.replaceState(window.history.state, "", `/c/${id}?photo=linkedin`);
    window.dispatchEvent(new PopStateEvent("popstate"));
    return;
  }
  window.location.href = `/auth/linkedin/start?card=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}`;
}

async function createCard(input: CreateInput): Promise<CreateResult> {
  if (isMock()) return mockApi.createCard(input);
  let res: Response;
  // Fiche d'origine si on est arrivé par un lien partagé (§18.0) ; le serveur l'ignore si elle n'existe pas.
  const ref = currentRef() ?? undefined;
  try {
    if (input.cv) {
      const fd = new FormData();
      fd.append("cv", input.cv);
      if (input.login) fd.append("login", input.login);
      fd.append("lang", input.lang);
      if (ref) fd.append("ref", ref);
      res = await fetch("/api/card", { method: "POST", body: fd });
    } else {
      res = await fetch("/api/card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: input.login, lang: input.lang, ref }),
      });
    }
  } catch {
    throw new ApiError(0, "network", null);
  }
  if (!res.ok) throw await readError(res);
  return res.json();
}

async function getJob(id: string): Promise<JobState> {
  if (isMock()) return mockApi.getJob(id);
  let res: Response;
  try {
    res = await fetch(`/api/card/${encodeURIComponent(id)}`, { headers: { Accept: "application/json" } });
  } catch {
    throw new ApiError(0, "network", null);
  }
  if (!res.ok) throw await readError(res);
  return res.json();
}

async function sendEmail(cardId: string, email: string): Promise<void> {
  if (isMock()) return mockApi.sendEmail(cardId, email);
  const res = await fetch("/api/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cardId, email }),
  });
  if (!res.ok) throw await readError(res);
}

async function deleteCard(id: string, token: string): Promise<void> {
  if (isMock()) return mockApi.deleteCard(id, token);
  const res = await fetch(`/api/card/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`, { method: "DELETE" });
  if (!res.ok) throw await readError(res);
}

/** Analytics : tir sans attente, jamais bloquant. */
function track(event: AnalyticsEvent, cardId: string | null, meta: Record<string, unknown> = {}) {
  if (isMock()) {
    console.debug("[mock] event", event, cardId, meta);
    return;
  }
  try {
    void fetch("/api/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, cardId, meta }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* rien */
  }
}

/** La vraie carte d'exemple de l'accueil (§6.1) ; null tant que le serveur ne l'a pas calculée. */
async function getShowcase(): Promise<CardData | null> {
  if (isMock()) return mockApi.getShowcase();
  const res = await fetch("/api/showcase", { headers: { Accept: "application/json" } });
  if (!res.ok) return null;
  const body = (await res.json()) as { card?: CardData | null };
  return body.card ?? null;
}

export const api = { createCard, getJob, sendEmail, deleteCard, track, getConfig, startLinkedInPhoto, getShowcase };

/** URLs des images rendues par le serveur (§7). */
export const images = {
  og: (id: string) => `/og/${id}.png`,
  portrait: (id: string) => `/og/${id}-portrait.png`,
  card: (id: string) => `/og/${id}-card.png`,
};

// Jetons de suppression, gardés localement par id de carte.
const TOKENS_KEY = "tys_tokens";

function readTokens(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(TOKENS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export const tokens = {
  get(id: string): string | null {
    return readTokens()[id] ?? null;
  },
  set(id: string, token: string) {
    try {
      localStorage.setItem(TOKENS_KEY, JSON.stringify({ ...readTokens(), [id]: token }));
    } catch {
      /* rien */
    }
  },
  remove(id: string) {
    try {
      const all = readTokens();
      delete all[id];
      localStorage.setItem(TOKENS_KEY, JSON.stringify(all));
    } catch {
      /* rien */
    }
  },
};
