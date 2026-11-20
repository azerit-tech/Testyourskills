// Nettoyage des bandes (§18.123) : une personne, une ligne par ligue. Avant lui, une fiche
// remplacée par le dossier de sa personne gardait ses entrées sous son ancienne clé (une fiche
// LinkedIn seule dénoncée, `li:{adresse}`, puis son dossier, `gh:{login}`) : la même personne
// comptait deux fois (Florent, « 2 fiches » chez Criteo). Le nettoyage :
// 1. les entrées et les sorties des fiches remplacées passent sous le dossier qui les remplace
//    (`adoptSuperseded`, comme une fiche neuve), la sienne gardée s'il en a une ;
// 2. une entrée portée par une pièce de dossier passe à son dossier ;
// 3. ce qui ne compte toujours pas (fiche remplacée, deuxième fiche de la même personne dans
//    la ligue, `leagueRows`) est supprimé. Les sorties (band_optouts) restent.
// À blanc par défaut, dans un point de sauvegarde défait à la fin : ce qui est affiché est
// exactement ce que --oui écrirait. Idempotent : relancé, il ne trouve plus rien à faire.
// Le script : ops/nettoyage-bandes.ts.

import { BAND_TYPES, type BandType } from "../../shared/bands";
import { adoptSuperseded, forgetBands, leagueRows, starsOfRow } from "./bands";
import type { Store } from "./db";
import { forgetWeekRanks } from "./top";

export interface BandCleanup {
  /** Les dossiers qui ont repris les entrées ou les sorties des fiches qu'ils remplacent. */
  adopted: { id: string; changes: number }[];
  /** Les entrées portées par une pièce, passées à son dossier. */
  pieces: { pieceId: string; dossierId: string }[];
  /** Les entrées supprimées : la personne compte déjà dans la ligue, ou sa fiche est remplacée. */
  removed: { personKey: string; type: BandType; band: string; cardId: string; why: "superseded" | "duplicate" | "piece" }[];
}

export function cleanBands(store: Store, o: { apply?: boolean; now?: number } = {}): BandCleanup {
  const now = o.now ?? Date.now();
  const out: BandCleanup = { adopted: [], pieces: [], removed: [] };
  const db = store.db;
  db.exec("SAVEPOINT nettoyage_bandes");
  try {
    // 1. Les fiches remplacées : leurs entrées vont au dossier qui les remplace.
    const roots = db.prepare(`SELECT DISTINCT superseded_by AS id FROM cards WHERE superseded_by IS NOT NULL AND parent_id IS NULL ORDER BY superseded_by`).all() as { id: string }[];
    for (const { id } of roots) {
      const root = store.getCard(id);
      const changes = root ? adoptSuperseded(store, root, now) : 0;
      if (changes) out.adopted.push({ id, changes });
    }
    // 2. Une pièce n'a pas de note à elle : son entrée passe à son dossier.
    const pieces = db
      .prepare(`SELECT DISTINCT m.card_id AS pieceId, c.parent_id AS dossierId FROM band_members m JOIN cards c ON c.id = m.card_id WHERE c.parent_id IS NOT NULL`)
      .all() as { pieceId: string; dossierId: string }[];
    for (const p of pieces) {
      const dossier = store.getCard(p.dossierId);
      if (!dossier) continue;
      db.prepare(`UPDATE band_members SET card_id = ?, stars = ? WHERE card_id = ?`).run(dossier.id, starsOfRow(dossier), p.pieceId);
      out.pieces.push(p);
    }
    forgetBands(db);
    // 3. Ce qui ne compte toujours pas est supprimé.
    const del = db.prepare(`DELETE FROM band_members WHERE person_key = ? AND kind = ?`);
    for (const type of BAND_TYPES) {
      for (const r of leagueRows(db, type, now)) {
        if (!r.out) continue;
        del.run(r.personKey, type);
        out.removed.push({ personKey: r.personKey, type, band: r.id, cardId: r.cardId, why: r.out });
      }
    }
  } catch (e) {
    db.exec("ROLLBACK TO nettoyage_bandes; RELEASE nettoyage_bandes");
    throw e;
  }
  db.exec(o.apply ? "RELEASE nettoyage_bandes" : "ROLLBACK TO nettoyage_bandes; RELEASE nettoyage_bandes");
  forgetBands(db);
  forgetWeekRanks(db);
  return out;
}
