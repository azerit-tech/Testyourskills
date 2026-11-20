// Les bandes côté navigateur (§18.38) : l'API, sa démo (?mock=1), et un souvenir
// local, les bandes de la personne (sa ligne au classement de l'accueil, §18.92).
import { boardPerson } from "../../../shared/boardPerson";
import type { BandLeaguePage, BandPage, BandRef, BandsTop, BandStanding, BandType, MyBands } from "../../../shared/bands";
import { RANKING_ANCHOR } from "../../../shared/routes";
import { BAND_MIN_MEMBERS, BAND_TYPES, bandHasPage, companyCheck, schoolById } from "../../../shared/bands";
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
  /** Le classement de chaque ligue pour l'accueil ; `mine` : ses bandes, rendues en plus si elles sont plus bas. */
  async top(mine: Partial<Record<BandType, string | null>> = {}): Promise<BandsTop | null> {
    if (isMock()) return mock.top(mine);
    const q = BAND_TYPES.filter((k) => mine[k]).map((k) => `${k}=${encodeURIComponent(mine[k]!)}`).join("&");
    return getJson<BandsTop>(`/api/bands/top${q ? `?${q}` : ""}`).catch(() => null);
  },
  /** La suite du classement d'une ligue, `limit` lignes après les `offset` premières (§18.126) ; null si le serveur ne répond pas. */
  async league(type: BandType, offset: number, limit: number): Promise<BandLeaguePage | null> {
    if (isMock()) return mock.league(type, offset, limit);
    return getJson<BandLeaguePage>(`/api/bands/top/${type}?offset=${offset}&limit=${limit}`).catch(() => null);
  },
  /** Les fiches d'une bande (ouverte au classement de l'accueil) ; null si elle n'existe pas. Une panne réseau remonte en ApiError. */
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

/** Les bandes de la personne, retenues ici : sa ligne au classement de l'accueil, sans fiche à lire. */
export function rememberMyBands(mb: MyBands) {
  writeJson(MINE_KEY, { ecole: mb.ecole?.id ?? null, boite: mb.boite?.id ?? null });
}

export function myBandIds(): Record<BandType, string | null> {
  const v = readJson<Record<string, unknown>>(MINE_KEY);
  const id = (x: unknown) => (typeof x === "string" ? x : null);
  return { ecole: id(v?.ecole), boite: id(v?.boite) };
}

/** Les pastilles proposées sous la fiche : celle lue sur la fiche. */
export function suggestedPills(type: BandType, mb: MyBands): BandRef[] {
  const s = mb.suggest[type];
  return s ? [s] : [];
}

/** Les étoiles sur leur échelle de six, pour un texte de partage (« ★★★★☆☆ », §18.48 : toute note a son échelle). */
export const starLine = (n: number) => {
  const k = Math.max(0, Math.min(6, n));
  return "★".repeat(k) + "☆".repeat(6 - k);
};

/** Le lien partagé d'une bande : le classement de l'accueil (§18.101), en anglais si on partage depuis l'anglais. */
export const rankingShareUrl = (lang: "fr" | "en") => `${window.location.origin}/${lang === "en" ? "?lang=en" : ""}#${RANKING_ANCHOR}`;

/* ---------- la démo (?mock=1) ---------- */

function standing(type: BandType, id: string, label: string, score: number, members: number): Omit<BandStanding, "rank" | "gap" | "ahead"> {
  return { type, id, label, score, members, missing: Math.max(0, BAND_MIN_MEMBERS - members), hasPage: bandHasPage(type, id, members) };
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

/**
 * Les personnes de démo d'une bande, comme leurs fiches les portent : une fiche GitHub
 * avec son nom et sa photo, des fiches LinkedIn seules (un nom, pas de pseudo, avec ou
 * sans photo), une fiche GitHub sans nom (son @pseudo), un nom très long.
 */
const MOCK_PEOPLE: { name?: string; login?: string; avatarUrl?: string }[] = [
  { name: "Léa Martin-Dubois", login: "leamd", avatarUrl: "https://avatars.githubusercontent.com/u/583231?v=4" },
  { name: "Inès Carpentier" },
  { name: "Yanis Belkacem", avatarUrl: "/mock-linkedin.svg" },
  { login: "nour-rs" },
  { name: "Théo Dubois" },
  { name: "Marie-Charlotte Vandenberghe-Lefebvre de Montmorency" },
  { name: "Camille Roux", login: "camroux" },
];

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
    b.hasPage = bandHasPage(type, b.id, b.members);
  }
  const ranked = list.filter((b) => b.members >= BAND_MIN_MEMBERS).sort((a, b) => b.score - a.score || b.members - a.members);
  return list.map((b) => {
    const i = ranked.indexOf(b);
    if (i < 0) return { ...b, rank: null, gap: null, ahead: null };
    const ahead = i > 0 ? ranked[i - 1] : null;
    return { ...b, rank: i + 1, gap: ahead ? ahead.score - b.score : null, ahead: ahead ? { id: ahead.id, label: ahead.label, rank: i } : null };
  });
}

/** L'ordre de l'accueil : le tableau, puis les bandes en formation qui ont leur page, les plus étoilées d'abord. */
function mockOrder(type: BandType): BandStanding[] {
  const all = mockStandings(type);
  return [
    ...all.filter((b) => b.rank !== null).sort((a, b) => a.rank! - b.rank!),
    ...all.filter((b) => b.rank === null && b.hasPage).sort((a, b) => b.score - a.score || b.members - a.members),
  ];
}

const mock = {
  // Comme le serveur : le tableau, puis les bandes en formation qui ont leur page, les plus étoilées d'abord.
  top(mine: Partial<Record<BandType, string | null>> = {}): BandsTop {
    const out: BandsTop = { ecole: [], boite: [], totals: {} };
    for (const type of BAND_TYPES) {
      const order = mockOrder(type);
      out[type] = order.slice(0, 5);
      out.totals![type] = order.length;
      const i = mine[type] ? order.findIndex((b) => b.id === mine[type]) : -1;
      if (i >= 5) (out.mine ??= {})[type] = { place: i + 1, band: order[i]! };
    }
    return out;
  },
  league(type: BandType, offset: number, limit: number): BandLeaguePage {
    const order = mockOrder(type);
    const from = Math.max(0, offset);
    return { type, total: order.length, entries: order.slice(from, from + Math.min(100, limit)).map((band, i) => ({ place: from + i + 1, band })) };
  },
  page(type: BandType, id: string): BandPage | null {
    const band = mockStandings(type).find((b) => b.id === id) ?? (type === "ecole" && schoolById(id) ? { ...standing("ecole", id, schoolById(id)!.label, 0, 0), rank: null, gap: null, ahead: null } : null);
    if (!band?.hasPage) return null;
    const profiles = [
      // Les noms épicènes du vrai catalogue (data/profiles.json).
      { fr: "Machine à livrer", en: "Delivery machine" },
      { fr: "Légende du milieu", en: "Underworld legend" },
      { fr: "Cerveau", en: "Mastermind" },
      null,
    ];
    const positions = ["BE", "FE", "DATA", "FS", "OPS"] as const;
    // Comme le serveur (§18.88, §18.119, §18.127) : toutes les fiches jusqu'à 50 (BAND_PAGE_MEMBERS), chacune avec
    // sa personne (nom court, niveau, sans lien), dénoncée ou non.
    const count = Math.min(band.members, 50);
    const members = Array.from({ length: count }, (_, i) => {
      const p = MOCK_PEOPLE[i % MOCK_PEOPLE.length]!;
      // Une fiche de démo qui s'ouvre vraiment (mock.ts lit le type dans l'id) : GitHub, ou LinkedIn seule.
      const cardId = `m-${p.login ? "gold" : "li"}-bande${i + 1}`;
      return {
        stars: Math.max(1, 6 - Math.floor(i / 3)),
        profile: profiles[i % profiles.length]!,
        position: positions[i % positions.length],
        ...boardPerson(p, cardId, null, (["junior", "mid", "student", "senior"] as const)[i % 4]),
      };
    });
    return { band, members };
  },
  mine(cardId: string): MyBands {
    // Comme le serveur (§18.82) : la fiche posée est déjà dans la bande de son école et de sa boîte.
    if (!mockJoined.has(cardId)) mockJoined.set(cardId, { ecole: { id: "centralesupelec", label: "CentraleSupélec" }, boite: { id: "doctolib", label: "Doctolib" } });
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
    const known = pick.id ? (MOCK_BANDS[type].find((b) => b.id === pick.id)?.label ?? schoolById(pick.id)?.label ?? null) : null;
    // Comme le serveur : un nom de boîte tapé passe par la même vérification (insulte, adresse, @, numéro).
    const check = known === null && type === "boite" ? companyCheck(pick.name) : null;
    if (check && "refused" in check) {
      const fact =
        check.refused === "word"
          ? { fr: "Ce nom ne passe pas. Donne le nom de ta boîte, tel qu'il s'écrit.", en: "That name won't do. Give your company's name as it's written." }
          : check.refused === "contact"
            ? { fr: "Le nom de la boîte seulement : ni adresse, ni @, ni numéro.", en: "Just the company's name: no address, no @, no number." }
            : { fr: "Pas une bande. Donne le nom de ta boîte.", en: "Not a crew. Give your company's name." };
      throw new ApiError(400, check.refused === "none" ? "not_a_band" : "refused", fact);
    }
    const ref = check && "ref" in check ? check.ref : { id: pick.id ?? "", label: known ?? pick.id ?? "" };
    if (!ref.id) throw new ApiError(400, "not_a_band", { fr: "Pas une bande.", en: "Not a crew." });
    mockJoined.set(cardId, { ...mockJoined.get(cardId), [type]: { id: ref.id, label: ref.label } });
    return mock.mine(cardId);
  },
  leave(cardId: string, type: BandType): MyBands {
    const j = { ...mockJoined.get(cardId) };
    delete j[type];
    mockJoined.set(cardId, j);
    return mock.mine(cardId);
  },
};
