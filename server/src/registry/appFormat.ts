// Les formats de la base de l'App Azerit (SPEC §18.95), lus et écrits à
// l'identique de son code Python :
//
// - `accounts.handle_key` (`azerit/db/_accounts.handle_key`) : un login GitHub
//   en minuscules ; pour LinkedIn, le slug décodé et sans casse ;
// - un CV de `cvs` (`identity_store.save_cv`) : JSON compressé par zlib,
//   `{schema, url, logins, versions: [{sha256, fetched_at, campaign, login, profile}]}`,
//   où `profile` est la sortie de l'acteur Apify réduite par `cv_enrich.trim_profile`,
//   et `sha256` l'empreinte de `json.dumps(profile, sort_keys=True, ensure_ascii=False)`.
//
// Rien ici ne parle à la base : des fonctions pures, testées sans elle.

import { createHash } from "node:crypto";
import { deflateSync, inflateSync } from "node:zlib";
import { linkedinSlug, normalizeLinkedinUrl } from "../../../shared/entry";
import { buildProfile, clip, firstContract, withContract, yearOf, type LinkedinProfile } from "../linkedinProfile/profile";

export const CV_SCHEMA = "azerit-cv-store-v1";

/** `handle_key` d'un login GitHub. */
export const githubKey = (login: string): string => login.trim().replace(/^\/+|\/+$/g, "").toLowerCase();

/** `handle_key` d'un profil LinkedIn (adresse en toute forme), ou null. */
export function linkedinKey(url: string): string | null {
  const slug = linkedinSlug(url);
  return slug ? slug.toLowerCase() : null;
}

/** `datetime.now().isoformat(timespec="seconds")` : l'heure locale, sans fuseau, comme l'App l'écrit. */
export function isoSeconds(at: number): string {
  const d = new Date(at);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** Une date de l'App (« 2026-11-16T16:04:38 », heure locale) en millisecondes ; NaN si illisible. */
export const parseIso = (s: unknown): number => (typeof s === "string" ? new Date(s.length === 19 ? s : s.slice(0, 19)).getTime() : NaN);

// --- Le CV de l'App ----------------------------------------------------------

export interface AppDate {
  year: number | null;
  month: string | null;
  text: string;
}

/** Un CV tel que `cv_enrich.trim_profile` le range. */
export interface AppProfile {
  public_url: string;
  name: string;
  headline: string;
  location: string;
  experiences: {
    position: string;
    company: string;
    company_slug: string;
    employment_type: string;
    start: AppDate;
    end: AppDate;
    duration: string;
    location: string;
    description: string;
  }[];
  education: { school: string; degree: string; field: string; start_year: number | null; end_year: number | null }[];
  skills: string[];
}

export interface AppCvVersion {
  sha256: string;
  fetched_at: string;
  campaign: string;
  login: string;
  profile: AppProfile;
}

export interface AppCvDocument {
  schema: string;
  url: string;
  logins: string[];
  versions: AppCvVersion[];
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
/** `x or ""` de Python, pour un champ texte. */
const str = (v: unknown): string => (typeof v === "string" ? v : v === null || v === undefined || v === false || v === 0 ? "" : String(v));
/** `x[:n]` de Python : par points de code, pas par moitiés de caractère. */
const cut = (s: string, n: number): string => {
  const cps = Array.from(s);
  return cps.length <= n ? s : cps.slice(0, n).join("");
};
/** Une valeur de l'acteur telle qu'elle est, `None` si absente : l'App la recopie sans la vérifier. */
const asIs = <T>(v: unknown): T => (v === undefined ? null : v) as T;
/** `_date` de l'App. */
const date = (raw: unknown): AppDate => {
  const r = obj(raw);
  return { year: asIs(r.year), month: asIs(r.month), text: str(r.text) };
};

/** `_canonical_url` de l'App : l'adresse sous laquelle l'acteur rend le profil, slug tel qu'écrit. */
function canonicalUrl(item: Obj): string {
  for (const raw0 of [item.linkedinUrl, item.publicIdentifier]) {
    let raw = typeof raw0 === "string" ? raw0.trim() : "";
    if (!raw) continue;
    if (!raw.includes("/")) raw = `https://www.linkedin.com/in/${raw}`;
    const m = /linkedin\.com\/in\/([^/?#\s]+)/i.exec(raw);
    if (m && normalizeLinkedinUrl(raw)) return `https://www.linkedin.com/in/${m[1]}`;
  }
  return "";
}

/**
 * La sortie brute de `harvestapi~linkedin-profile-scraper` → le CV de l'App, à
 * l'identique de `cv_enrich.trim_profile` (jamais d'image, jamais de contact).
 * null si l'élément n'a ni nom ni poste.
 */
export function trimApifyItem(raw: unknown): AppProfile | null {
  const item = obj(raw);
  const experiences = arr(item.experience).map((e0) => {
    const e = obj(e0);
    return {
      position: str(e.position),
      company: str(e.companyName),
      company_slug: str(e.companyUniversalName),
      employment_type: str(e.employmentType),
      start: date(e.startDate),
      end: date(e.endDate),
      duration: str(e.duration),
      location: str(e.location),
      description: cut(str(e.description), 600),
    };
  });
  const education = arr(item.education).map((e0) => {
    const e = obj(e0);
    return {
      school: str(e.schoolName),
      degree: str(e.degree),
      field: str(e.fieldOfStudy),
      start_year: asIs<number | null>(obj(e.startDate).year),
      end_year: asIs<number | null>(obj(e.endDate).year),
    };
  });
  const skills = arr(item.skills)
    .map((s) => (s && typeof s === "object" ? str((s as Obj).name) : str(s)).trim())
    .filter(Boolean)
    .slice(0, 40);
  const loc = item.location;
  const profile: AppProfile = {
    public_url: canonicalUrl(item),
    name: [item.firstName, item.lastName].filter((x) => typeof x === "string" && x).join(" "),
    headline: str(item.headline),
    location: loc && typeof loc === "object" && !Array.isArray(loc) ? str((loc as Obj).linkedinText) : str(loc),
    experiences,
    education,
    skills,
  };
  return profile.name || experiences.length ? profile : null;
}

/**
 * Le CV sans lieu : le jeu ne lit ni ne garde le lieu d'une personne (§18.24),
 * il ne l'écrit pas non plus chez l'App. Les champs restent, vides, comme quand
 * l'acteur ne les donne pas.
 */
export function withoutPlaces(p: AppProfile): AppProfile {
  return { ...p, location: "", experiences: p.experiences.map((e) => ({ ...e, location: "" })) };
}

/** `json.dumps(v, sort_keys=True, ensure_ascii=False)` de Python, séparateurs par défaut compris. */
export function pyJson(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NaN";
  if (typeof v === "string") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(pyJson).join(", ")}]`;
  const o = v as Obj;
  const keys = Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${keys.map((k) => `${JSON.stringify(k)}: ${pyJson(o[k])}`).join(", ")}}`;
}

/** `identity_store._digest` : l'empreinte d'une version de CV. */
export const cvDigest = (profile: AppProfile): string => createHash("sha256").update(pyJson(profile), "utf8").digest("hex");

/** Le document d'un CV neuf, une seule version : ce que `save_cv` écrit pour un compte sans CV. */
export function newCvDocument(url: string, profile: AppProfile, opts: { login?: string; fetchedAt: string }): AppCvDocument {
  const login = opts.login ?? "";
  return {
    schema: CV_SCHEMA,
    url,
    logins: login ? [login] : [],
    versions: [{ sha256: cvDigest(profile), fetched_at: opts.fetchedAt, campaign: "", login, profile }],
  };
}

/** `zlib.compress(json.dumps(doc, ensure_ascii=False).encode(), 6)`. */
export const packCv = (doc: AppCvDocument): Buffer => deflateSync(Buffer.from(JSON.stringify(doc), "utf8"), { level: 6 });

/** La colonne `data` d'un CV → son document, ou null s'il ne se lit pas. */
export function unpackCv(data: Uint8Array): AppCvDocument | null {
  try {
    const doc = JSON.parse(inflateSync(data).toString("utf8")) as AppCvDocument;
    return doc && Array.isArray(doc.versions) ? doc : null;
  } catch {
    return null;
  }
}

/** La dernière lecture (celle que `load_cv` rend), ou null. */
export function latestVersion(doc: AppCvDocument): AppCvVersion | null {
  const vs = doc.versions.filter((v) => v && typeof v === "object" && v.profile && typeof v.profile === "object");
  if (!vs.length) return null;
  return vs.reduce((a, b) => (String(b.fetched_at ?? "") >= String(a.fetched_at ?? "") ? b : a));
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/** `{year: 2022, month: "Mar"}` → "2022-03" ; null sans année. */
function monthOfAppDate(d: unknown): string | null {
  const o = obj(d);
  const y = yearOf(o.year);
  if (!y) return null;
  const m = typeof o.month === "string" ? (MONTHS[o.month.trim().slice(0, 3).toLowerCase()] ?? (Number(o.month) >= 1 && Number(o.month) <= 12 ? Number(o.month) : 1)) : 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

/**
 * Le CV de l'App → le profil réduit du jugement (linkedinProfile/profile.ts). Le
 * CV de l'App ne garde ni résumé ni distinctions : ils restent vides. Le lieu
 * n'est pas repris. null s'il est vide.
 */
export function profileFromApp(url: string, p: AppProfile): LinkedinProfile | null {
  const roles = arr(p.experiences).map((e0) => {
    const e = obj(e0);
    const end = obj(e.end);
    return {
      title: clip(e.position, 120),
      company: clip(e.company, 120),
      start: monthOfAppDate(e.start),
      // Sans année de fin, le poste est en cours (« Present »).
      end: yearOf(end.year) ? monthOfAppDate(end) : null,
      description: clip(e.description, 600),
      ...withContract(firstContract(e.employment_type)),
    };
  });
  const current = roles.find((r) => r.end === null && r.title);
  return buildProfile({
    url,
    name: p.name,
    headline: p.headline,
    title: current?.title,
    summary: "",
    roles,
    education: arr(p.education).map((s0) => {
      const s = obj(s0);
      return { school: clip(s.school, 120), degree: clip(s.degree, 120), field: clip(s.field, 120), start: yearOf(s.start_year), end: yearOf(s.end_year) };
    }),
    skills: arr(p.skills),
  });
}
