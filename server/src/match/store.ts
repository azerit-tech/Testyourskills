// Les propositions sous une fiche (SPEC §18.100) : une ligne par fiche, son
// GitHub ou son LinkedIn trouvé pendant sa lecture, et la réponse de la personne.
// Supprimées avec la fiche. Jamais un email.

import type Database from "better-sqlite3";
import type { Proposal } from "../../../shared/types";

export function ensureProposalTables(db: Database.Database) {
  db.exec(`CREATE TABLE IF NOT EXISTS proposals (
    card_id    TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    answer     TEXT CHECK (answer IN ('yes', 'no'))
  )`);
}

export function saveProposal(db: Database.Database, cardId: string, p: Proposal, now = Date.now()) {
  db.prepare(`INSERT OR REPLACE INTO proposals (card_id, data, created_at, answer) VALUES (?, ?, ?, NULL)`).run(cardId, JSON.stringify(p), now);
}

function parse(raw: string): Proposal | null {
  try {
    const p = JSON.parse(raw) as Proposal;
    if (p?.kind === "github" && typeof p.login === "string") return p;
    if (p?.kind === "linkedin" && typeof p.url === "string") return p;
  } catch {
    /* ligne illisible : rien à proposer */
  }
  return null;
}

/** La proposition d'une fiche à laquelle la personne n'a pas encore répondu, sinon null. */
export function openProposal(db: Database.Database, cardId: string): Proposal | null {
  const row = db.prepare(`SELECT data FROM proposals WHERE card_id = ? AND answer IS NULL`).get(cardId) as { data: string } | undefined;
  return row ? parse(row.data) : null;
}

/** La réponse de la personne ; true si une proposition ouverte l'attendait. */
export function answerProposal(db: Database.Database, cardId: string, answer: "yes" | "no"): boolean {
  return db.prepare(`UPDATE proposals SET answer = ? WHERE card_id = ? AND answer IS NULL`).run(answer, cardId).changes > 0;
}

export function removeProposals(db: Database.Database, ids: string[]) {
  const stmt = db.prepare(`DELETE FROM proposals WHERE card_id = ?`);
  db.transaction(() => ids.forEach((id) => stmt.run(id)))();
}
