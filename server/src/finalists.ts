// Les finalistes d'une prime (§18.4) : les dix premiers du classement figé, avec
// ce que l'entreprise recevra s'ils l'ont accepté (pseudo, email, lien de fiche,
// preuves). Pour scripts/finalists.ts, sur la machine d'Azerit : jamais servi
// par une route, jamais écrit dans les journaux.

import { FINALISTS } from "../../shared/primes";
import { primePhase, type Prime, type Season } from "../../shared/season";
import type { Store } from "./db";
import { standings } from "./primes";

export interface Finalist {
  rank: number;
  login: string;
  email: string;
  cardUrl: string;
  overall: number;
  proofs: string[];
}

export interface FinalistsReport {
  prime: Prime;
  /** Close : classement figé. Sinon, provisoire. */
  closed: boolean;
  total: number;
  finalists: Finalist[];
}

export function finalists(store: Store, season: Season, prime: Prime, baseUrl: string, now = Date.now()): FinalistsReport {
  const list = standings(store, season, prime, now);
  const contact = store.db.prepare(`SELECT email, proofs_json FROM entries WHERE login = ? AND prime_id = ?`);
  const top = list.slice(0, FINALISTS).map((s) => {
    const row = contact.get(s.login, prime.id) as { email: string; proofs_json: string | null } | undefined;
    let proofs: string[] = [];
    try {
      const parsed: unknown = row?.proofs_json ? JSON.parse(row.proofs_json) : [];
      if (Array.isArray(parsed)) proofs = parsed.filter((x): x is string => typeof x === "string");
    } catch {
      /* preuves illisibles : aucune */
    }
    return { rank: s.rank, login: s.login, email: row?.email ?? "", cardUrl: `${baseUrl}/c/${s.cardId}`, overall: s.overall, proofs };
  });
  return { prime, closed: primePhase(season, prime, now) === "closed", total: list.length, finalists: top };
}

const csvCell = (s: string) => (/[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** CSV (séparateur virgule), une ligne par finaliste, les preuves séparées par une espace. */
export function finalistsCsv(r: FinalistsReport): string {
  const head = "rang,login,email,note,fiche,preuves";
  const rows = r.finalists.map((f) => [String(f.rank), f.login, f.email, String(f.overall), f.cardUrl, f.proofs.join(" ")].map(csvCell).join(","));
  return [head, ...rows].join("\n");
}

/** Le texte pour la console : l'état du classement, puis un finaliste par bloc. */
export function finalistsText(r: FinalistsReport): string {
  const lines = [
    `${r.prime.company} (${r.prime.id}) : ${r.finalists.length} finalistes sur ${r.total} inscriptions.`,
    r.closed ? "Prime close : classement figé." : "Prime encore ouverte : classement provisoire, il bougera jusqu'à la clôture.",
    "",
  ];
  for (const f of r.finalists) {
    lines.push(`${f.rank}. @${f.login}, note ${f.overall}`, `   ${f.email}`, `   ${f.cardUrl}`);
    for (const p of f.proofs) lines.push(`   ${p}`);
  }
  return lines.join("\n");
}
