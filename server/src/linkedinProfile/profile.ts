// Profil LinkedIn réduit à ce qui sert au jugement (SPEC §18.24) : titre,
// résumé, postes (intitulé, entreprise, dates, description), formation,
// compétences, adresse du profil. Ni lieu, ni photo, ni contact : le reste de la
// réponse Crustdata est jeté ici, avant tout stockage.

export interface LinkedinRole {
  title: string;
  company: string;
  /** "AAAA-MM" ou null. */
  start: string | null;
  /** "AAAA-MM", ou null pour un poste en cours. */
  end: string | null;
  description: string;
}

export interface LinkedinSchool {
  school: string;
  degree: string;
  field: string;
  start: number | null;
  end: number | null;
}

export interface LinkedinProfile {
  url: string;
  name: string;
  headline: string;
  title: string;
  summary: string;
  roles: LinkedinRole[];
  education: LinkedinSchool[];
  skills: string[];
  /** Photo, si le fournisseur la donne. Jamais gardée en cache (store.ts). */
  photoUrl?: string;
}

/** Ce que rend un fournisseur pour une adresse de profil. */
export interface ProviderResult {
  /** null : profil introuvable (privé, supprimé, retiré à la demande de la personne). */
  profile: LinkedinProfile | null;
  /** Le compte GitHub que le profil donne (ses liens), sinon null. */
  githubLogin: string | null;
  /** false : le fournisseur n'a pas regardé (Crustdata sans les plateformes dev). */
  githubChecked: boolean;
}

/** Un fournisseur de profils LinkedIn publics : Apify (défaut) ou Crustdata (§18.24). */
export interface LinkedinProvider {
  readonly name: "apify" | "crustdata";
  /** Durée maximale d'une lecture : au-delà, la fiche GitHub sort seule. */
  readonly timeoutMs: number;
  /** `withGithub` : le compte GitHub est demandé (entrée LinkedIn). */
  fetchProfile(url: string, opts?: { withGithub?: boolean; signal?: AbortSignal }): Promise<ProviderResult>;
}

export const MAX_ROLES = 15;
export const MAX_SCHOOLS = 6;
export const MAX_SKILLS = 50;

export const clip = (v: unknown, n: number): string => (typeof v === "string" ? v.replace(/\s+\n/g, "\n").trim().slice(0, n) : "");

/** "2017-01-01T00:00:00+00:00", "2017-01", "2017" → "2017-01" ; sinon null. */
export function monthOf(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = /^(\d{4})(?:-(\d{2}))?/.exec(v.trim());
  if (!m) return null;
  const month = m[2] ?? "01";
  return Number(month) >= 1 && Number(month) <= 12 ? `${m[1]}-${month}` : null;
}

export const yearOf = (v: unknown): number | null => {
  const n = typeof v === "string" && /^\d{4}$/.test(v.trim()) ? Number(v) : v;
  return typeof n === "number" && n > 1900 && n < 2200 ? Math.floor(n) : null;
};

/** Champs bruts d'un profil, avant le tri, les bornes et le dédoublonnage communs aux fournisseurs. */
export interface ProfileParts {
  url: string;
  name?: unknown;
  headline?: unknown;
  title?: unknown;
  summary?: unknown;
  photoUrl?: unknown;
  roles: (LinkedinRole | null)[];
  education: (LinkedinSchool | null)[];
  skills: unknown[];
}

/** Profil réduit, ou null s'il est vide (ni nom, ni titre, ni poste). */
export function buildProfile(p: ProfileParts): LinkedinProfile | null {
  // Postes en cours d'abord, puis le passé, du plus récent au plus ancien.
  const roles = p.roles
    .filter((r): r is LinkedinRole => r !== null && !!(r.title || r.company))
    .sort((a, b) => ((a.end === null) !== (b.end === null) ? (a.end === null ? -1 : 1) : (b.start ?? "").localeCompare(a.start ?? "")))
    .slice(0, MAX_ROLES);
  const education = p.education.filter((s): s is LinkedinSchool => s !== null && !!s.school).slice(0, MAX_SCHOOLS);
  const seen = new Set<string>();
  const skills = p.skills
    .map((s) => clip(s, 40))
    .filter((s) => s && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()))
    .slice(0, MAX_SKILLS);
  const photo = clip(p.photoUrl, 500);
  const profile: LinkedinProfile = {
    url: p.url,
    name: clip(p.name, 120),
    headline: clip(p.headline, 220),
    title: clip(p.title, 120),
    summary: clip(p.summary, 2000),
    roles,
    education,
    skills,
    ...(/^https:\/\//.test(photo) ? { photoUrl: photo } : {}),
  };
  if (!profile.name && !profile.headline && !profile.title && !roles.length) return null;
  return profile;
}

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/**
 * `person_data` d'une réponse Crustdata `POST /person/enrich` → profil réduit.
 * null si le profil est vide.
 */
export function profileFromPersonData(url: string, data: unknown): LinkedinProfile | null {
  const d = data as Record<string, any> | null;
  if (!d || typeof d !== "object") return null;
  const basic = (d.basic_profile ?? {}) as Record<string, unknown>;
  const emp = (d.experience?.employment_details ?? {}) as { current?: unknown; past?: unknown };
  const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : null);
  return buildProfile({
    url,
    name: basic.name,
    headline: basic.headline,
    title: basic.current_title,
    summary: basic.summary,
    roles: [...list(emp.current), ...list(emp.past)].map((raw) => {
      const r = obj(raw);
      if (!r) return null;
      return {
        title: clip(r.title, 120),
        company: clip(r.name ?? r.company_name, 120),
        start: monthOf(r.start_date),
        end: monthOf(r.end_date),
        description: clip(r.description, 600),
      };
    }),
    education: list(d.education?.schools).map((raw) => {
      const o = obj(raw);
      if (!o) return null;
      return { school: clip(o.school, 120), degree: clip(o.degree, 120), field: clip(o.field_of_study, 120), start: yearOf(o.start_year), end: yearOf(o.end_year) };
    }),
    skills: list(d.skills?.professional_network_skills),
  });
}
