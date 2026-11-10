// Profil LinkedIn réduit à ce qui sert au jugement (SPEC §18.24) : titre,
// résumé, postes (intitulé, entreprise, dates, description, type de contrat),
// formation, compétences, distinctions et prix, adresse du profil. Ni âge, ni lieu, ni langue parlée,
// ni photo, ni contact : le reste de la réponse du fournisseur est jeté ici,
// avant tout stockage.

/**
 * Type de contrat d'un poste, quand le fournisseur le donne (§18.37, critère
 * Expérience : stage et alternance comptent pour moitié).
 */
export const CONTRACT_TYPES = ["full_time", "part_time", "internship", "work_study", "freelance"] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];

export interface LinkedinRole {
  title: string;
  company: string;
  /** "AAAA-MM" ou null. */
  start: string | null;
  /** "AAAA-MM", ou null pour un poste en cours. */
  end: string | null;
  description: string;
  /** Type de contrat donné par le fournisseur ; absent s'il ne le donne pas (et dans les profils gardés avant le §18.37). */
  contract?: ContractType;
}

export interface LinkedinSchool {
  school: string;
  degree: string;
  field: string;
  start: number | null;
  end: number | null;
}

/** Une distinction ou un prix de la section « Honors & awards » (§18.37, critère École et sélection). */
export interface LinkedinHonor {
  title: string;
  /** Qui l'a décerné ; "" s'il n'est pas dit. */
  issuer: string;
  /** "AAAA-MM" ou null. */
  date: string | null;
  description: string;
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
  /** Distinctions et prix, dix au plus ; absent s'il n'y en a pas (et dans les profils gardés avant le §18.37). */
  honors?: LinkedinHonor[];
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
export const MAX_HONORS = 10;

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

const plain = (s: string) => s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * « Internship », « Stage », « Alternance », « Freelance », « Temps plein »,
 * « CDI »… → le type de contrat ; null si le texte n'en est pas un. Saisonnier,
 * bénévolat et l'inconnu ne donnent rien.
 */
export function contractOf(v: unknown): ContractType | null {
  if (typeof v !== "string") return null;
  const s = plain(v).trim();
  if (!s || s.length > 60) return null;
  if (/\b(apprenticeship|apprentice|alternance|alternant|apprentissage|apprenti|work[- ]?study|contrat pro(fessionnalisation)?)\b/.test(s)) return "work_study";
  if (/\b(internship|intern|stage|stagiaire|trainee|traineeship|praktikum)\b/.test(s)) return "internship";
  if (/\b(freelance|freelancer|self[- ]employed|independant|independante|auto[- ]?entrepreneur|micro[- ]?entrepreneur|consultant independant)\b/.test(s)) return "freelance";
  if (/\b(part[- ]time|temps partiel|mi[- ]temps)\b/.test(s)) return "part_time";
  if (/\b(full[- ]time|temps plein|cdi|cdd|permanent|contract|salarie|salariee)\b/.test(s)) return "full_time";
  return null;
}

/** Le premier type de contrat lisible parmi des textes candidats. */
export function firstContract(...vs: unknown[]): ContractType | null {
  for (const v of vs) {
    const c = contractOf(v);
    if (c) return c;
  }
  return null;
}

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
  honors?: (LinkedinHonor | null)[];
}

/** Une distinction lue, bornée ; null sans titre. */
export function honorOf(h: { title?: unknown; issuer?: unknown; date?: unknown; description?: unknown }): LinkedinHonor | null {
  const title = clip(h.title, 160);
  if (!title) return null;
  return { title, issuer: clip(h.issuer, 160), date: monthOf(h.date), description: clip(h.description, 400) };
}

/** Profil réduit, ou null s'il est vide (ni nom, ni titre, ni poste). */
export function buildProfile(p: ProfileParts): LinkedinProfile | null {
  // Postes en cours d'abord, puis le passé, du plus récent au plus ancien.
  const roles = p.roles
    .filter((r): r is LinkedinRole => r !== null && !!(r.title || r.company))
    .map(({ contract, ...r }) => (contract && (CONTRACT_TYPES as readonly string[]).includes(contract) ? { ...r, contract } : r))
    .sort((a, b) => ((a.end === null) !== (b.end === null) ? (a.end === null ? -1 : 1) : (b.start ?? "").localeCompare(a.start ?? "")))
    .slice(0, MAX_ROLES);
  const education = p.education.filter((s): s is LinkedinSchool => s !== null && !!s.school).slice(0, MAX_SCHOOLS);
  const seen = new Set<string>();
  const skills = p.skills
    .map((s) => clip(s, 40))
    .filter((s) => s && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()))
    .slice(0, MAX_SKILLS);
  const seenHonors = new Set<string>();
  const honors = (p.honors ?? [])
    .filter((h): h is LinkedinHonor => h !== null && !!h.title)
    .filter((h) => !seenHonors.has(h.title.toLowerCase()) && !!seenHonors.add(h.title.toLowerCase()))
    .slice(0, MAX_HONORS);
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
    ...(honors.length ? { honors } : {}),
    ...(/^https:\/\//.test(photo) ? { photoUrl: photo } : {}),
  };
  if (!profile.name && !profile.headline && !profile.title && !roles.length) return null;
  return profile;
}

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** `{ contract }` s'il est connu, sinon rien : un poste sans type n'a pas la clé. */
export const withContract = (c: ContractType | null): { contract?: ContractType } => (c ? { contract: c } : {});

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
        ...withContract(firstContract(r.employment_type, r.employmentType)),
      };
    }),
    education: list(d.education?.schools).map((raw) => {
      const o = obj(raw);
      if (!o) return null;
      return { school: clip(o.school, 120), degree: clip(o.degree, 120), field: clip(o.field_of_study, 120), start: yearOf(o.start_year), end: yearOf(o.end_year) };
    }),
    skills: list(d.skills?.professional_network_skills),
    // Forme non vérifiée sur un vrai profil : liste à plat, ou sous `honors.honors`.
    honors: [...list(d.honors), ...list(d.honors?.honors)].map((raw) => {
      const h = obj(raw);
      if (!h) return null;
      return honorOf({
        title: h.title ?? h.name,
        issuer: h.issuer ?? h.issued_by ?? h.issuer_name,
        date: h.issued_date ?? h.issue_date ?? h.date ?? h.issued_on,
        description: h.description,
      });
    }),
  });
}
