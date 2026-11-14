// Les bandes côté navigateur (§18.38) : l'API, sa démo (?mock=1), et deux
// souvenirs locaux, la bande de la dernière page vue (sa pastille passe en
// premier sous la fiche) et les bandes choisies ici (« Ta bande » sur /bandes).
import type { BandBoard, BandPage, BandRef, BandsTop, BandStanding, BandType, MyBands } from "../../../shared/bands";
import { BAND_MIN_MEMBERS, schoolById } from "../../../shared/bands";
import { isMock, tokens } from "./api";
import { ApiError } from "./errors";

const JSON_HEADERS = { Accept: "application/json" };

async function getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { ...JSON_HEADERS, ...headers } });
  } catch {
    throw new ApiError(0, "network", null);
  }
  if (!res.ok) throw await errorOf(res);
  return (await res.json()) as T;
}

async function errorOf(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as { code?: string; message?: { fr: string; en: string } };
    return new ApiError(res.status, body.code ?? "internal", body.message && typeof body.message === "object" ? body.message : null);
  } catch {
    return new ApiError(res.status, res.status === 429 ? "rate_limited" : "internal", null);
  }
}

/** Le jeton de la fiche, s'il a été créé ici ; sinon la session du propriétaire (cookie) fait foi. */
const cardHeaders = (cardId: string): Record<string, string> => {
  const token = tokens.get(cardId);
  return token ? { "x-card-token": token } : {};
};

async function post(url: string, cardId: string, body: unknown): Promise<MyBands> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...JSON_HEADERS, ...cardHeaders(cardId) }, body: JSON.stringify(body) });
  } catch {
    throw new ApiError(0, "network", null);
  }
  if (!res.ok) throw await errorOf(res);
  return (await res.json()) as MyBands;
}

export const bandsApi = {
  /** Les cinq premières de chaque ligue (l'accueil) ; null si le serveur ne répond pas. */
  async top(): Promise<BandsTop | null> {
    if (isMock()) return mock.top();
    return getJson<BandsTop>("/api/bands/top").catch(() => null);
  },
  /** Le tableau d'une ligue, et sa propre bande si elle est plus bas. */
  async board(type: BandType, withId?: string | null): Promise<BandBoard | null> {
    if (isMock()) return mock.board(type, withId ?? null);
    const q = withId ? `&with=${encodeURIComponent(withId)}` : "";
    return getJson<BandBoard>(`/api/bands?type=${type}${q}`).catch(() => null);
  },
  /** La page d'une bande ; null si elle n'existe pas. Une panne réseau remonte en ApiError. */
  async page(type: BandType, id: string): Promise<BandPage | null> {
    if (isMock()) return mock.page(type, id);
    try {
      return await getJson<BandPage>(`/api/bands/${type}/${encodeURIComponent(id)}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  },
  /** Les bandes de la personne fichée ; null si elle n'y a pas droit (dénoncée, pas à elle). */
  async mine(cardId: string): Promise<MyBands | null> {
    const mb = isMock() ? mock.mine(cardId) : await getJson<MyBands>(`/api/card/${encodeURIComponent(cardId)}/bands`, cardHeaders(cardId)).catch(() => null);
    if (mb) rememberMyBands(mb);
    return mb;
  },
  async join(cardId: string, type: BandType, pick: { id?: string; name?: string }): Promise<MyBands> {
    const mb = isMock() ? mock.join(cardId, type, pick) : await post("/api/bands/join", cardId, { cardId, type, ...pick });
    rememberMyBands(mb);
    return mb;
  },
  async leave(cardId: string, type: BandType): Promise<MyBands> {
    const mb = isMock() ? mock.leave(cardId, type) : await post("/api/bands/leave", cardId, { cardId, type });
    rememberMyBands(mb);
    return mb;
  },
};

/* ---------- souvenirs locaux ---------- */

const HINT_KEY = "tys_band_hint";
const MINE_KEY = "tys_my_bands";

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* stockage bloqué : rien de grave, la pastille ne sera pas en tête */
  }
}

const isRef = (v: unknown): v is BandRef =>
  !!v && typeof v === "object" && ((v as BandRef).type === "ecole" || (v as BandRef).type === "boite") && typeof (v as BandRef).id === "string" && typeof (v as BandRef).label === "string";

/** La bande d'où l'on vient (sa page vue) : « Fais ta fiche pour… », puis sa pastille en tête. */
export function rememberBandHint(ref: BandRef) {
  writeJson(HINT_KEY, { type: ref.type, id: ref.id, label: ref.label });
}

export function bandHint(): BandRef | null {
  const v = readJson<unknown>(HINT_KEY);
  return isRef(v) ? v : null;
}

/** Les bandes choisies depuis ce navigateur, pour « Ta bande » sur /bandes. */
export function rememberMyBands(mb: MyBands) {
  writeJson(MINE_KEY, { ecole: mb.ecole?.id ?? null, boite: mb.boite?.id ?? null });
}

export function myBandIds(): Record<BandType, string | null> {
  const v = readJson<Record<string, unknown>>(MINE_KEY);
  const id = (x: unknown) => (typeof x === "string" ? x : null);
  return { ecole: id(v?.ecole), boite: id(v?.boite) };
}

/** Les pastilles proposées sous la fiche : la bande d'où l'on vient d'abord, puis celle lue sur la fiche. */
export function suggestedPills(type: BandType, mb: MyBands, hint: BandRef | null): BandRef[] {
  const out: BandRef[] = [];
  if (hint && hint.type === type) out.push(hint);
  const s = mb.suggest[type];
  if (s && !out.some((r) => r.id === s.id)) out.push(s);
  return out;
}

/** Les étoiles pleines seulement, comme la ligne du §18.38 (« ★★★★ »). */
export const filledStars = (n: number) => "★".repeat(Math.max(0, Math.min(6, n)));

export const bandUrl = (b: Pick<BandRef, "type" | "id">) => `${window.location.origin}/bandes/${b.type}/${b.id}`;

/* ---------- la démo (?mock=1) ---------- */

function standing(type: BandType, id: string, label: string, score: number, members: number): Omit<BandStanding, "rank" | "gap" | "ahead"> {
  return { type, id, label, score, members, missing: Math.max(0, BAND_MIN_MEMBERS - members) };
}

const MOCK_BANDS: Record<BandType, Omit<BandStanding, "rank" | "gap" | "ahead">[]> = {
  ecole: [
    standing("ecole", "epitech", "Epitech", 88, 23),
    standing("ecole", "ecole-42", "École 42", 81, 19),
    standing("ecole", "centralesupelec", "CentraleSupélec", 74, 17),
    standing("ecole", "insa-lyon", "INSA Lyon", 41, 9),
    standing("ecole", "enseeiht", "ENSEEIHT", 12, 3),
    standing("ecole", "utc", "UTC", 5, 1),
  ],
  boite: [
    standing("boite", "doctolib", "Doctolib", 52, 11),
    standing("boite", "datadog", "Datadog", 47, 10),
    standing("boite", "qonto", "Qonto", 21, 5),
    standing("boite", "back-market", "Back Market", 4, 1),
  ],
};

const mockJoined = new Map<string, Partial<Record<BandType, { id: string; label: string }>>>();

function mockStandings(type: BandType): BandStanding[] {
  const list = MOCK_BANDS[type].map((b) => ({ ...b }));
  // Les choix faits en démo s'ajoutent à leur bande (un dossier de 4 étoiles).
  for (const joined of mockJoined.values()) {
    const j = joined[type];
    if (!j) continue;
    let b = list.find((x) => x.id === j.id);
    if (!b) list.push((b = standing(type, j.id, j.label, 0, 0)));
    b.score += 4;
    b.members += 1;
    b.missing = Math.max(0, BAND_MIN_MEMBERS - b.members);
  }
  const ranked = list.filter((b) => b.members >= BAND_MIN_MEMBERS).sort((a, b) => b.score - a.score || b.members - a.members);
  return list.map((b) => {
    const i = ranked.indexOf(b);
    if (i < 0) return { ...b, rank: null, gap: null, ahead: null };
    const ahead = i > 0 ? ranked[i - 1] : null;
    return { ...b, rank: i + 1, gap: ahead ? ahead.score - b.score : null, ahead: ahead ? { id: ahead.id, label: ahead.label, rank: i } : null };
  });
}

const mock = {
  top(): BandsTop {
    const top = (t: BandType) => mockStandings(t).filter((b) => b.rank !== null).sort((a, b) => a.rank! - b.rank!).slice(0, 5);
    return { ecole: top("ecole"), boite: top("boite") };
  },
  board(type: BandType, withId: string | null): BandBoard {
    const all = mockStandings(type);
    const entries = all.filter((b) => b.rank !== null).sort((a, b) => a.rank! - b.rank!);
    const extra = withId && !entries.some((b) => b.id === withId) ? (all.find((b) => b.id === withId) ?? null) : null;
    return { type, total: entries.length, entries: entries.slice(0, 20), extra };
  },
  page(type: BandType, id: string): BandPage | null {
    const band = mockStandings(type).find((b) => b.id === id) ?? (type === "ecole" && schoolById(id) ? { ...standing("ecole", id, schoolById(id)!.label, 0, 0), rank: null, gap: null, ahead: null } : null);
    if (!band) return null;
    const profiles = [
      { fr: "Le Bâtisseur", en: "The Builder" },
      { fr: "Le Mainteneur", en: "The Maintainer" },
      { fr: "L'Architecte", en: "The Architect" },
      null,
    ];
    const members = Array.from({ length: Math.min(band.members, 12) }, (_, i) => ({
      stars: Math.max(1, 6 - Math.floor(i / 3)),
      profile: profiles[i % profiles.length],
      ...(i === 0 ? { login: "leamd", cardId: "m-gold-abcd" } : {}),
    }));
    return { band, members };
  },
  mine(cardId: string): MyBands {
    const joined = mockJoined.get(cardId) ?? {};
    const find = (t: BandType) => (joined[t] ? (mockStandings(t).find((b) => b.id === joined[t]!.id) ?? null) : null);
    return {
      stars: 4,
      ecole: find("ecole"),
      boite: find("boite"),
      suggest: { ecole: { type: "ecole", id: "centralesupelec", label: "CentraleSupélec" }, boite: { type: "boite", id: "doctolib", label: "Doctolib" } },
    };
  },
  join(cardId: string, type: BandType, pick: { id?: string; name?: string }): MyBands {
    const label = pick.id ? (MOCK_BANDS[type].find((b) => b.id === pick.id)?.label ?? schoolById(pick.id)?.label ?? pick.id) : (pick.name ?? "").trim();
    const id = pick.id ?? label.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!id) throw new ApiError(400, "not_a_band", { fr: "Ce nom ne fait pas une bande.", en: "That name doesn't make a crew." });
    mockJoined.set(cardId, { ...mockJoined.get(cardId), [type]: { id, label } });
    return mock.mine(cardId);
  },
  leave(cardId: string, type: BandType): MyBands {
    const j = { ...mockJoined.get(cardId) };
    delete j[type];
    mockJoined.set(cardId, j);
    return mock.mine(cardId);
  },
};
