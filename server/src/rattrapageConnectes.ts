// Rattrapage du §18.116 : les dossiers LinkedIn + GitHub faits par une personne connectée à
// LinkedIn, avec le GitHub qu'elle a donné ou confirmé, nés avant la règle et restés hors du
// top. La même règle qu'à la naissance (`signedInProof`, pipeline.ts), relue en base : le
// compte de la connexion LinkedIn (`accounts.linkedin_json`) porte ce profil, sûrement le sien
// (email ou photo), et ce dossier (sa fiche, ou le GitHub qu'elle a donné). Idempotent : un
// dossier déjà prouvé n'est plus regardé. Jamais un dossier né d'une dénonciation.
// Le script : ops/rattrapage-dossiers-connectes.ts.

import type { Store } from "./db";
import { githubDeclaredOf } from "./linkedinProfile/url";
import { githubFitsName } from "./names";

export interface SignedInDossier {
  id: string;
  login: string;
  linkedinUrl: string;
  /** Le nom de la connexion LinkedIn. */
  name: string;
  /** Le nom affiché sur GitHub, s'il y en a un. */
  githubName: string | null;
  /** La raison de la preuve, ou null : le GitHub n'est pas plausiblement le sien, le dossier reste hors du top. */
  proof: "signin+name" | null;
}

/** Les dossiers de personnes connectées encore non prouvés, et ce que la règle en dit. */
export function signedInDossiers(store: Store): SignedInDossier[] {
  const rows = store.db
    .prepare(
      `SELECT c.id, c.login, json_extract(c.facts_json, '$.linkedinUrl') AS url,
              json_extract(a.linkedin_json, '$.name') AS name,
              (SELECT g.facts_json FROM cards g WHERE g.parent_id = c.id AND g.source = 'github' LIMIT 1) AS gh
       FROM cards c
       JOIN accounts a ON a.linkedin_key IS NOT NULL
         AND json_extract(a.linkedin_json, '$.url') = json_extract(c.facts_json, '$.linkedinUrl')
         AND json_extract(a.linkedin_json, '$.how') IN ('email', 'photo')
         AND (a.card_id = c.id OR lower(json_extract(a.linkedin_json, '$.github.login')) = c.login)
       WHERE c.parent_id IS NULL AND c.kind = 'comparison' AND c.source = 'linkedin' AND c.login IS NOT NULL
         AND c.denounce_born = 0
         AND COALESCE(json_extract(c.facts_json, '$.linkedinProven'), 0) <> 1
       ORDER BY c.created_at`,
    )
    .all() as { id: string; login: string; url: string; name: string | null; gh: string | null }[];
  const seen = new Set<string>();
  const out: SignedInDossier[] = [];
  for (const r of rows) {
    if (seen.has(r.id) || !r.name) continue;
    seen.add(r.id);
    let facts: unknown = null;
    try {
      facts = r.gh ? JSON.parse(r.gh) : null;
    } catch {
      facts = null;
    }
    const gh = githubDeclaredOf(facts);
    const fits = githubFitsName(r.name, gh?.login ?? r.login, gh?.name);
    out.push({ id: r.id, login: r.login, linkedinUrl: r.url, name: r.name, githubName: gh?.name ?? null, proof: fits ? "signin+name" : null });
  }
  return out;
}

/** Applique la règle : chaque dossier plausible est prouvé, et remplace les fiches plus anciennes de sa personne. */
export function proveSignedInDossiers(store: Store, list = signedInDossiers(store)): number {
  let n = 0;
  for (const d of list) if (d.proof && store.proveLinkedin(d.id, d.proof)) n++;
  return n;
}
