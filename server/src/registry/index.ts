// Le registre GitHub ↔ LinkedIn de l'App Azerit (SPEC §18.95) : la base
// Postgres du VPS (`azerit`, conteneur `azerit-postgres`), lue avant toute
// recherche payante et enrichie de ce que le jeu établit.
//
// Lire :
// - le LinkedIn d'un GitHub, le GitHub d'un LinkedIn (`account_links`, règles de
//   l'App, rules.ts). Force 2 ou 3 : prouvé ; force 1 : trouvé, pas prouvé ;
// - un CV déjà lu de moins de 90 jours (`cvs`) : le jugement le prend tel quel,
//   sans payer Apify ;
// - la photo déjà téléchargée d'un profil (`photos`), pour reconnaître qui se connecte.
// Écrire, en ajout seul et sous le nom `testyourskills` (`azerit.writer`) :
// - un lien que le jeu établit (source `testyourskills`, étape = le signal) ;
// - les comptes qui manquent ; un CV payé chez Apify, si le compte n'en a aucun.
// Jamais une mise à jour, jamais une suppression, jamais un email.
//
// Chaque lecture a 300 ms. Une panne, une lenteur ou pas de base (AZERIT_DB_URL
// absent) : le jeu fait exactement comme avant, et la base est laissée en paix
// trente secondes.

import { normalizeLinkedinUrl } from "../../../shared/entry";
import type { LinkedinProfile } from "../linkedinProfile/profile";
import { githubKey, isoSeconds, latestVersion, linkedinKey, newCvDocument, packCv, parseIso, profileFromApp, trimApifyItem, unpackCv, withoutPlaces } from "./appFormat";
import { nameStartsWith, slugOfName, slugRanges } from "./names";
import { samePublicFullName } from "../names";
import { PgRegistryDb } from "./pg";
import { DECLARED, onlyOwner, soleOwner, strongest, validLinks, type LinkRow } from "./rules";

export { DECLARED, SEARCHED, VERIFIED } from "./rules";

/** Un compte de l'App : sa plateforme, son `handle_key`, son identifiant tel qu'écrit. */
export interface AccountRef {
  platform: "github" | "linkedin";
  key: string;
  handle: string;
}

/** Ce que le registre demande à la base ; Postgres en production (pg.ts), une mémoire en test (memory.ts). */
export interface RegistryDb {
  /** Les liens d'un compte vers les comptes d'une autre plateforme, dans l'ordre d'écriture, lignes marquées exclues. */
  links(from: { platform: AccountRef["platform"]; key: string }, otherPlatform: AccountRef["platform"]): Promise<(LinkRow & { handle: string })[]>;
  cv(linkedinKey: string): Promise<{ data: Uint8Array; fetchedAt: string } | null>;
  photo(linkedinKey: string): Promise<{ data: Uint8Array; contentType: string } | null>;
  /** Les comptes LinkedIn dont l'adresse tombe dans ces tranches (names.ts), `perRange` au plus par tranche. */
  namesakes(ranges: { lo: string; hi: string }[], perRange: number): Promise<{ key: string; cv: { data: Uint8Array; fetchedAt: string } | null; hasPhoto: boolean }[]>;
  /** Les profils LinkedIn qu'un email désigne chez l'App (fonction d'ops/registre-email.sql). */
  linkedinByEmail(email: string): Promise<string[]>;
  /** Les comptes qui manquent ; rend le nombre créé. */
  addAccounts(accounts: AccountRef[]): Promise<number>;
  /** Un lien `testyourskills`, sauf s'il en existe déjà un au moins aussi fort ; true s'il est écrit. */
  addLink(link: { github: AccountRef; linkedin: AccountRef; strength: number; step: string; at: string }): Promise<boolean>;
  /** Un CV pour un compte qui n'en a aucun (jamais une version de plus) ; true s'il est écrit. */
  addCv(linkedin: AccountRef, cv: { data: Buffer; sha256: string; fetchedAt: string }): Promise<boolean>;
  close(): Promise<void>;
}

/** Ce que le jeu demande au registre : des lectures qui ne lèvent jamais, des écritures qu'on n'attend pas. */
export interface RegistryPort {
  linkedinOf(login: string): Promise<{ url: string; strength: number } | null>;
  githubOf(url: string): Promise<{ login: string; strength: number } | null>;
  profileOf(url: string): Promise<LinkedinProfile | null>;
  photoOf(url: string): Promise<{ bytes: Uint8Array; ext: "jpg" | "png" } | null>;
  /**
   * Les profils de l'App à ce nom (§18.96), le nom et le titre de leur CV. `partial` : le
   * dernier mot est en cours de frappe, seuls les profils dont le CV dit le nom sortent.
   * Sinon (un nom complet), aussi les profils sans CV dont l'adresse est ce nom (`name` null) :
   * ils ne servent qu'à comparer une photo. Jamais d'erreur : [] .
   */
  namesakes(name: string, opts?: { partial?: boolean }): Promise<Namesake[]>;
  /** Le seul profil LinkedIn qu'un email vérifié désigne chez l'App, ou null. */
  linkedinOfEmail(email: string): Promise<string | null>;
  /** Un lien établi par le jeu ; `step` : le signal (`github_social`, `linkedin_signin:photo+github_email`…). */
  recordLink(link: { login: string; url: string; strength: number; step: string }): void;
  recordAccounts(accounts: { github?: string | null; linkedin?: string | null }): void;
  /** Un profil payé chez Apify (sortie brute de l'acteur) ; `login` : le GitHub prouvé de ce profil. */
  recordProfile(url: string, raw: unknown, opts?: { login?: string }): void;
}

/** Un profil de l'App trouvé par le nom (§18.96) : rien de plus que ce que « C'est toi ? » montre. */
export interface Namesake {
  url: string;
  /** Le nom du CV ; null sans CV (l'adresse seule est faite du nom). */
  name: string | null;
  headline: string;
  /** L'App garde sa photo. */
  hasPhoto: boolean;
}

/** Comptes lus par tranche d'adresses. */
export const NAMESAKES_PER_RANGE = 25;
/** Profils rendus par une recherche par nom. */
export const NAMESAKES_MAX = 8;
/** La fonction des emails absente ou refusée : plus demandée pendant ce temps-là. */
export const EMAIL_OFF_MS = 10 * 60_000;

/** Un lien de force 2 ou plus vaut « prouvé » pour la fiche (§18.24). */
export const isProven = (strength: number) => strength >= DECLARED;

export const READ_TIMEOUT_MS = 300;
/** Un CV de l'App plus vieux que ça est relu chez Apify (la fiche, elle, vit 90 jours). */
export const CV_MAX_AGE_DAYS = 90;
/** Après une panne ou une lenteur, la base est laissée en paix ce temps-là. */
export const COOLDOWN_MS = 30_000;
const LOGIN_RE = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;
const PHOTO_EXT: Record<string, "jpg" | "png"> = { "image/jpeg": "jpg", "image/png": "png" };

export interface RegistryOptions {
  readTimeoutMs?: number;
  cvMaxAgeDays?: number;
  cooldownMs?: number;
  now?: () => number;
  log?: (msg: string) => void;
}

const linkedinRef = (url: string): AccountRef | null => {
  const key = linkedinKey(url);
  return key ? { platform: "linkedin", key, handle: key } : null;
};
const githubRef = (login: string): AccountRef | null => (LOGIN_RE.test(login) ? { platform: "github", key: githubKey(login), handle: login } : null);

export class Registry implements RegistryPort {
  private readonly readTimeoutMs: number;
  private readonly maxAgeMs: number;
  private readonly cooldownMs: number;
  private readonly now: () => number;
  private readonly log: (msg: string) => void;
  private pausedUntil = 0;
  private emailOffUntil = 0;
  private readonly pending = new Set<Promise<unknown>>();

  constructor(
    private readonly db: RegistryDb,
    o: RegistryOptions = {},
  ) {
    this.readTimeoutMs = o.readTimeoutMs ?? READ_TIMEOUT_MS;
    this.maxAgeMs = (o.cvMaxAgeDays ?? CV_MAX_AGE_DAYS) * 24 * 3600_000;
    this.cooldownMs = o.cooldownMs ?? COOLDOWN_MS;
    this.now = o.now ?? Date.now;
    this.log = o.log ?? ((m) => console.warn(m));
  }

  /** Une panne : on le dit une fois, et la base est laissée en paix un moment. */
  private fail(what: string, err: unknown) {
    if (this.now() >= this.pausedUntil) {
      const e = err as { code?: unknown; name?: unknown };
      this.log(`[registre] ${what} indisponible (${typeof e?.code === "string" ? e.code : String(e?.name ?? "erreur")}) : rien ne change, nouvel essai dans ${Math.round(this.cooldownMs / 1000)} s.`);
    }
    this.pausedUntil = this.now() + this.cooldownMs;
  }

  /** Une lecture : son résultat dans le délai, sinon null. Jamais une erreur. */
  private async read<T>(what: string, fn: () => Promise<T | null>): Promise<T | null> {
    if (this.now() < this.pausedUntil) return null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = Symbol("late");
    try {
      const r = await Promise.race([fn(), new Promise<typeof late>((res) => (timer = setTimeout(() => res(late), this.readTimeoutMs)))]);
      if (r === late) {
        this.fail(what, { name: "lenteur" });
        return null;
      }
      return r;
    } catch (err) {
      this.fail(what, err);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Une écriture : partie, jamais attendue par la fiche. */
  private write(what: string, fn: () => Promise<unknown>): void {
    if (this.now() < this.pausedUntil) return;
    const p = fn()
      .catch((err) => this.fail(what, err))
      .finally(() => this.pending.delete(p));
    this.pending.add(p);
  }

  /** Les écritures en vol (tests, arrêt du serveur). */
  async flush(): Promise<void> {
    while (this.pending.size) await Promise.all([...this.pending]);
  }

  async close(): Promise<void> {
    await this.flush();
    await this.db.close();
  }

  linkedinOf(login: string): Promise<{ url: string; strength: number } | null> {
    const gh = githubRef(login);
    if (!gh) return Promise.resolve(null);
    return this.read("lien GitHub → LinkedIn", async () => {
      const best = strongest(validLinks(await this.db.links(gh, "linkedin")));
      if (!best) return null;
      // Le même LinkedIn sur un autre GitHub : un homonyme ou une fusion à trancher, rien.
      if (!soleOwner(gh.key, best, await this.db.links({ platform: "linkedin", key: best.key }, "github"))) return null;
      const url = normalizeLinkedinUrl(`https://www.linkedin.com/in/${encodeURIComponent(best.key)}`);
      return url ? { url, strength: best.strength } : null;
    });
  }

  githubOf(raw: string): Promise<{ login: string; strength: number } | null> {
    const li = linkedinRef(raw);
    if (!li) return Promise.resolve(null);
    return this.read("lien LinkedIn → GitHub", async () => {
      const rows = await this.db.links(li, "github");
      const best = onlyOwner(validLinks(rows));
      if (!best) return null;
      // Le login tel qu'écrit (sa casse), sinon sa clé.
      const handle = [...rows].reverse().find((r) => r.other === best.key)?.handle ?? best.key;
      return LOGIN_RE.test(handle) ? { login: handle, strength: best.strength } : null;
    });
  }

  profileOf(raw: string): Promise<LinkedinProfile | null> {
    const url = normalizeLinkedinUrl(raw);
    const li = url ? linkedinRef(url) : null;
    if (!url || !li) return Promise.resolve(null);
    return this.read("CV", async () => {
      const row = await this.db.cv(li.key);
      if (!row) return null;
      const doc = unpackCv(row.data);
      const v = doc ? latestVersion(doc) : null;
      const at = parseIso(v?.fetched_at ?? row.fetchedAt);
      if (!v || !(this.now() - at < this.maxAgeMs)) return null;
      return profileFromApp(url, v.profile);
    });
  }

  photoOf(raw: string): Promise<{ bytes: Uint8Array; ext: "jpg" | "png" } | null> {
    const li = linkedinRef(raw);
    if (!li) return Promise.resolve(null);
    return this.read("photo", async () => {
      const row = await this.db.photo(li.key);
      const ext = row ? PHOTO_EXT[row.contentType] : undefined;
      return row && ext ? { bytes: row.data, ext } : null;
    });
  }

  namesakes(name: string, o: { partial?: boolean } = {}): Promise<Namesake[]> {
    const ranges = slugRanges(name, o);
    if (!ranges.length) return Promise.resolve([]);
    return this.read("recherche par nom", async () => {
      const rows = await this.db.namesakes(ranges, NAMESAKES_PER_RANGE);
      const out: Namesake[] = [];
      const seen = new Set<string>();
      for (const r of rows) {
        if (seen.has(r.key)) continue;
        seen.add(r.key);
        const url = normalizeLinkedinUrl(`https://www.linkedin.com/in/${encodeURIComponent(r.key)}`);
        if (!url) continue;
        const doc = r.cv ? unpackCv(r.cv.data) : null;
        const p = doc ? latestVersion(doc)?.profile : undefined;
        const cvName = typeof p?.name === "string" ? p.name.trim().slice(0, 120) : "";
        const headline = typeof p?.headline === "string" ? p.headline.trim().slice(0, 200) : "";
        if (o.partial) {
          if (cvName && nameStartsWith(cvName, name)) out.push({ url, name: cvName, headline, hasPhoto: r.hasPhoto });
        } else if (cvName) {
          if (samePublicFullName(name, cvName)) out.push({ url, name: cvName, headline, hasPhoto: r.hasPhoto });
        } else if (slugOfName(r.key, ranges)) {
          out.push({ url, name: null, headline: "", hasPhoto: r.hasPhoto });
        }
      }
      // Ceux dont le CV dit le nom d'abord.
      return [...out.filter((n) => n.name), ...out.filter((n) => !n.name)].slice(0, NAMESAKES_MAX);
    }).then((r) => r ?? []);
  }

  linkedinOfEmail(email: string): Promise<string | null> {
    const e = email.trim();
    if (!/^[^@\s]{1,64}@[^@\s]{1,190}$/.test(e) || this.now() < this.emailOffUntil) return Promise.resolve(null);
    return this.read("profil par l'email", async () => {
      let keys: string[];
      try {
        keys = await this.db.linkedinByEmail(e);
      } catch (err) {
        // La fonction pas encore posée par Jacques, ou refusée : rien, sans troubler le reste.
        const code = (err as { code?: unknown })?.code;
        if (code === "42883" || code === "42501") {
          if (this.now() >= this.emailOffUntil) this.log(`[registre] profil par l'email : fonction absente ou refusée (${code}), rien ne change.`);
          this.emailOffUntil = this.now() + EMAIL_OFF_MS;
          return null;
        }
        throw err;
      }
      const urls = [...new Set(keys.map((k) => normalizeLinkedinUrl(`https://www.linkedin.com/in/${encodeURIComponent(k)}`)).filter((u): u is string => !!u))];
      return urls.length === 1 ? urls[0]! : null;
    });
  }

  recordLink(link: { login: string; url: string; strength: number; step: string }): void {
    const github = githubRef(link.login);
    const linkedin = linkedinRef(link.url);
    const strength = Math.floor(link.strength);
    if (!github || !linkedin || strength < 1 || strength > DECLARED) return;
    const at = isoSeconds(this.now());
    this.write("écriture d'un lien", async () => {
      await this.db.addAccounts([github, linkedin]);
      await this.db.addLink({ github, linkedin, strength, step: link.step.slice(0, 120), at });
    });
  }

  recordAccounts(a: { github?: string | null; linkedin?: string | null }): void {
    const refs = [a.github ? githubRef(a.github) : null, a.linkedin ? linkedinRef(a.linkedin) : null].filter((x): x is AccountRef => !!x);
    if (refs.length) this.write("écriture des comptes", () => this.db.addAccounts(refs));
  }

  recordProfile(raw: string, item: unknown, opts: { login?: string } = {}): void {
    const url = normalizeLinkedinUrl(raw);
    const li = url ? linkedinRef(url) : null;
    const trimmed = trimApifyItem(item);
    if (!url || !li || !trimmed) return;
    const profile = withoutPlaces(trimmed);
    const login = opts.login && githubRef(opts.login) ? opts.login : undefined;
    const fetchedAt = isoSeconds(this.now());
    const doc = newCvDocument(url, profile, { login, fetchedAt });
    this.write("écriture d'un CV", async () => {
      await this.db.addAccounts([li]);
      await this.db.addCv(li, { data: packCv(doc), sha256: doc.versions[0]!.sha256, fetchedAt });
    });
  }
}

/** AZERIT_DB_URL : la base de l'App, sous le rôle `testyourskills` (ops/registre-role.sql). Absent : pas de registre. */
export function registryFromEnv(env: NodeJS.ProcessEnv): Registry | null {
  const url = env.AZERIT_DB_URL?.trim();
  if (!url) return null;
  return new Registry(new PgRegistryDb(url));
}
