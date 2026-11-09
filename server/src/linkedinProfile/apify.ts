// Lecture d'un profil LinkedIn public par un acteur Apify (SPEC §18.24), le
// fournisseur par défaut : un « LinkedIn profile scraper » sans cookies, environ
// 1 à 4 $ les 1 000 profils.
//
// API officielle (https://docs.apify.com/api/v2) :
//   POST https://api.apify.com/v2/acts/{user~actor}/run-sync-get-dataset-items?timeout=60
//   Authorization: Bearer APIFY_TOKEN, corps = l'entrée de l'acteur (JSON),
//   réponse = les éléments du jeu de données (un tableau JSON).
//
// Les acteurs n'ont pas tous la même sortie : le normaliseur lit les noms de
// champs les plus courants (harvestapi, dev_fusion, et leurs cousins) et ignore
// le reste. Jamais d'email : l'entrée par défaut demande le mode sans email, et
// aucun champ de contact n'est lu, hormis les liens vers un GitHub.

import { normalizeLinkedinUrl } from "../../../shared/entry";
import { buildProfile, clip, yearOf, type LinkedinProfile, type LinkedinProvider, type LinkedinRole, type LinkedinSchool, type ProviderResult } from "./profile";

export const APIFY_API = "https://api.apify.com/v2";
/** Acteur par défaut : sans cookies, sans email (4 $ les 1 000 profils au 9 novembre 2026). */
export const DEFAULT_APIFY_ACTOR = "harvestapi~linkedin-profile-scraper";
/** Entrée par défaut, pour cet acteur ; `{url}` est remplacé par l'adresse du profil. */
export const DEFAULT_APIFY_INPUT = '{"profileScraperMode":"Profile details no email ($4 per 1k)","queries":["{url}"]}';
/** Délai maximal d'une lecture : au-delà, la fiche GitHub sort seule. */
export const APIFY_TIMEOUT_MS = 60_000;

export class ApifyError extends Error {
  constructor(readonly status: number, msg: string) {
    super(msg);
    this.name = "ApifyError";
  }
}

export interface ApifyOptions {
  token: string;
  /** Identifiant `user~actor` (ou l'id de l'acteur). */
  actor?: string;
  /** Entrée JSON de l'acteur, avec `{url}` à la place de l'adresse du profil. */
  inputTemplate?: string;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  timeoutMs?: number;
}

/** L'entrée de l'acteur : le modèle, `{url}` remplacé partout (en chaîne JSON). */
export function apifyInput(template: string, url: string): unknown {
  const fill = (v: unknown): unknown =>
    typeof v === "string" ? v.split("{url}").join(url) : Array.isArray(v) ? v.map(fill) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x)])) : v;
  return fill(JSON.parse(template));
}

export class ApifyProvider implements LinkedinProvider {
  readonly name = "apify" as const;
  readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly base: string;
  private readonly actor: string;
  private readonly template: string;

  constructor(private readonly opts: ApifyOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.base = (opts.baseUrl ?? APIFY_API).replace(/\/+$/, "");
    this.actor = opts.actor?.trim() || DEFAULT_APIFY_ACTOR;
    this.template = opts.inputTemplate?.trim() || DEFAULT_APIFY_INPUT;
    this.timeoutMs = opts.timeoutMs ?? APIFY_TIMEOUT_MS;
    apifyInput(this.template, "x"); // un modèle illisible casse au démarrage, pas à la première fiche
  }

  async fetchProfile(url: string, opts: { signal?: AbortSignal } = {}): Promise<ProviderResult> {
    const runSeconds = Math.max(1, Math.floor(this.timeoutMs / 1000));
    const t = AbortSignal.timeout(this.timeoutMs + 2000);
    const res = await this.fetchImpl(`${this.base}/acts/${encodeURIComponent(this.actor)}/run-sync-get-dataset-items?timeout=${runSeconds}&format=json&clean=true`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.opts.token}`, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(apifyInput(this.template, url)),
      signal: opts.signal ? AbortSignal.any([opts.signal, t]) : t,
    });
    if (!res.ok) throw new ApifyError(res.status, `apify ${res.status}`);
    const items = await res.json().catch(() => null);
    const item = Array.isArray(items) ? items.find((x) => x && typeof x === "object" && !(x as { error?: unknown }).error) : null;
    if (!item) return { profile: null, githubLogin: null, githubChecked: true };
    const profile = profileFromApifyItem(url, item);
    return { profile, githubLogin: profile ? githubFromApifyItem(item) : null, githubChecked: true };
  }
}

// --- Normaliseur tolérant -----------------------------------------------------

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
/** Première valeur non vide parmi des clés possibles. */
const pick = (o: Obj | null, ...keys: string[]): unknown => {
  for (const k of keys) {
    const v = o?.[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
};
const text = (v: unknown): string => {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  const name = obj(v)?.name;
  return typeof name === "string" ? name : "";
};
/** Un texte, ou une liste de morceaux de texte ({ text }) comme en rendent certains acteurs. */
const prose = (v: unknown): string =>
  Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x : text(obj(x)?.text))).filter(Boolean).join("\n") : text(v);

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, fev: 2, fév: 2, mar: 3, apr: 4, avr: 4, may: 5, mai: 5, jun: 6, juin: 6, jul: 7, juil: 7,
  aug: 8, aou: 8, aoû: 8, sep: 9, oct: 10, nov: 11, dec: 12, déc: 12,
};

const PRESENT_RE = /^(present|présent|aujourd'hui|now|current|actuel)/i;

/** "Mar", "mars", "Sept.", 3 → 3 ; sinon null. */
function monthNum(v: unknown): number | null {
  if (typeof v === "number") return v >= 1 && v <= 12 ? v : null;
  const s = String(v ?? "").toLowerCase().replace(/\.$/, "");
  return MONTHS[s] ?? MONTHS[s.slice(0, 4)] ?? MONTHS[s.slice(0, 3)] ?? null;
}

/**
 * Une date de poste, quelle que soit sa forme : "Mar 2022", "3-2022", "2022-03",
 * "2022", { year, month }, { text }. "present" pour un poste en cours, null sinon.
 */
export function whenOf(v: unknown): string | "present" | null {
  const o = obj(v);
  if (o) {
    const y = yearOf(o.year);
    if (y) return `${y}-${String(monthNum(o.month) ?? 1).padStart(2, "0")}`;
    return whenOf(o.text ?? o.date);
  }
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  if (PRESENT_RE.test(s)) return "present";
  let m = /^(\d{4})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2]!.padStart(2, "0")}`;
  m = /^(\d{1,2})[-/](\d{4})$/.exec(s);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12) return `${m[2]}-${m[1]!.padStart(2, "0")}`;
  m = /^([A-Za-zéûÉ]{3,9})\.?\s+(\d{4})$/.exec(s);
  if (m) return `${m[2]}-${String(monthNum(m[1]) ?? 1).padStart(2, "0")}`;
  m = /^(\d{4})$/.exec(s);
  return m ? `${m[1]}-01` : null;
}

/** "Jan 2019 - Present · 3 yrs", "2014 - 2019" → les deux bouts. */
function rangeOf(v: unknown): [unknown, unknown] {
  if (typeof v !== "string") return [undefined, undefined];
  const parts = v.split("·")[0]!.split(/\s+[-–—]\s+|\s+to\s+/i);
  return [parts[0]?.trim(), parts[1]?.trim()];
}

function roleOf(raw: unknown, company?: string): LinkedinRole | null {
  const r = obj(raw);
  if (!r) return null;
  const range = rangeOf(pick(r, "caption", "dateRange", "period", "date"));
  const start = whenOf(pick(r, "startDate", "start_date", "starts_at", "jobStartedOn", "start", "from") ?? range[0]);
  const endRaw = pick(r, "endDate", "end_date", "ends_at", "jobEndedOn", "end", "to") ?? range[1];
  const end = endRaw === undefined || r.jobStillWorking === true || r.isCurrent === true || r.current === true ? "present" : whenOf(endRaw);
  const companyRaw = text(pick(r, "companyName", "company_name", "company", "organization", "subtitle"));
  return {
    title: clip(text(pick(r, "position", "title", "jobTitle", "role", "name")), 120),
    // « Paysolde · Full-time » : on ne garde que l'entreprise.
    company: clip(company ?? companyRaw.split("·")[0], 120),
    start: start === "present" ? null : start,
    end: end === "present" ? null : end,
    description: clip(prose(pick(r, "description", "jobDescription", "summary")), 600),
  };
}

function rolesOf(item: Obj): (LinkedinRole | null)[] {
  const raw = arr(pick(item, "experience", "experiences", "positions", "position", "jobs"));
  return raw.flatMap((x) => {
    const o = obj(x);
    // Postes groupés sous une même entreprise : { companyName, positions: [...] }.
    const nested = arr(pick(o, "positions", "subComponents", "roles"));
    if (o && nested.some((n) => pick(obj(n), "position", "title", "jobTitle"))) {
      const company = text(pick(o, "companyName", "company", "title", "name"));
      return nested.map((n) => roleOf(n, company));
    }
    return [roleOf(x)];
  });
}

function schoolOf(raw: unknown): LinkedinSchool | null {
  const o = obj(raw);
  if (!o) return null;
  const range = rangeOf(pick(o, "period", "caption", "dateRange", "date"));
  const year = (v: unknown) => {
    const w = whenOf(v);
    return w && w !== "present" ? Number(w.slice(0, 4)) : yearOf(obj(v)?.year ?? v);
  };
  return {
    school: clip(text(pick(o, "schoolName", "school", "institution", "title", "name")), 120),
    degree: clip(text(pick(o, "degree", "degreeName", "degree_name", "subtitle")), 120),
    field: clip(text(pick(o, "fieldOfStudy", "field_of_study", "field")), 120),
    start: year(pick(o, "startDate", "start_date", "starts_at", "start") ?? range[0]),
    end: year(pick(o, "endDate", "end_date", "ends_at", "end") ?? range[1]),
  };
}

function skillsOf(item: Obj): unknown[] {
  const raw = pick(item, "skills", "skill", "topSkills");
  if (typeof raw === "string") return raw.split(/[,•·|]/).map((s) => s.trim());
  return arr(raw).map((s) => (typeof s === "string" ? s : text(pick(obj(s), "name", "title", "skill"))));
}

/** Un élément de jeu de données d'un acteur → profil réduit, ou null s'il est vide. */
export function profileFromApifyItem(url: string, raw: unknown): LinkedinProfile | null {
  const item = obj(raw);
  if (!item) return null;
  const first = text(pick(item, "firstName", "first_name"));
  const last = text(pick(item, "lastName", "last_name"));
  const roles = rolesOf(item);
  const current = roles.find((r) => r && r.end === null);
  return buildProfile({
    url: normalizeLinkedinUrl(pick(item, "linkedinUrl", "url", "profileUrl", "publicProfileUrl", "linkedin_url")) ?? url,
    name: pick(item, "fullName", "full_name", "name") ?? [first, last].filter(Boolean).join(" "),
    headline: pick(item, "headline", "occupation", "tagline"),
    title: pick(item, "jobTitle", "currentPosition", "job_title") ?? current?.title,
    summary: prose(pick(item, "about", "summary", "description", "bio")),
    photoUrl: pick(item, "photo", "profilePic", "profilePicHighQuality", "profilePicture", "profile_pic_url", "pictureUrl", "avatar"),
    roles,
    education: arr(pick(item, "education", "educations", "schools")).map(schoolOf),
    skills: skillsOf(item),
  });
}

const GITHUB_PROFILE_RE = /(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38})(\/[^\s"'<>)]*)?/gi;
/** Chemins de github.com qui ne sont pas des comptes. */
const NOT_ACCOUNTS = new Set(["orgs", "about", "features", "pricing", "topics", "collections", "sponsors", "marketplace", "settings", "login", "join"]);

/**
 * Le compte GitHub que le profil LinkedIn donne lui-même : ses liens (site web,
 * section contact) d'abord, puis son résumé. Un lien vers un dépôt ne compte
 * qu'à défaut d'un lien vers un compte. Jamais les descriptions de postes : un
 * dépôt d'employeur n'est pas la personne.
 */
export function githubFromApifyItem(raw: unknown): string | null {
  const item = obj(raw);
  if (!item) return null;
  const linkTexts: string[] = [];
  const walk = (v: unknown, depth: number) => {
    if (depth > 3) return;
    if (typeof v === "string") linkTexts.push(v);
    else if (Array.isArray(v)) v.forEach((x) => walk(x, depth + 1));
    else if (obj(v)) Object.values(v as Obj).forEach((x) => walk(x, depth + 1));
  };
  for (const k of ["websites", "website", "contactInfo", "contact_info", "contact", "links", "github", "githubUrl", "github_url", "personalWebsite"]) walk(item[k], 0);
  for (const source of [linkTexts, [text(pick(item, "about", "summary"))]]) {
    let fallback: string | null = null;
    for (const s of source) {
      for (const m of s.matchAll(GITHUB_PROFILE_RE)) {
        const login = m[1]!;
        if (NOT_ACCOUNTS.has(login.toLowerCase())) continue;
        const rest = (m[2] ?? "").replace(/[?#].*$/, "");
        if (!rest || rest === "/") return login;
        fallback ??= login;
      }
    }
    if (fallback) return fallback;
  }
  return null;
}
