// Rattrapage des bandes (§18.82, §18.119) : les fiches vivantes qui entrent au classement
// mais ne sont jamais entrées dans la bande de leur école et de leur boîte. Nées avant
// l'entrée d'office (19 novembre), dénoncées avant le §18.119, ou resservies du cache
// (une fiche resservie ne relance pas l'entrée d'office) : chacune passe par la même
// entrée d'office qu'une fiche neuve (`autoJoinBands`), qui ne rouvre jamais une ligue
// quittée à la main. En plus : une ligue déjà tenue n'est pas touchée du tout (`keepHeld`).
// Idempotent : relancé, il ne trouve plus rien à faire.
// Le script : ops/rattrapage-bandes.ts.

import type { BandType } from "../../shared/bands";
import { autoJoinBands, forgetBands, personKey } from "./bands";
import type { CardRow, Store } from "./db";
import { enteringRootIds, forgetWeekRanks } from "./top";

export interface BandCatchUp {
  id: string;
  /** Le @pseudo, sinon l'adresse LinkedIn, sinon l'id. */
  who: string;
  joined: { type: BandType; label: string }[];
  /** Les entrées de sa fiche d'avant (même personne, autre clé) passées sous ce dossier. */
  moved: boolean;
}

const has = (store: Store, key: string) =>
  !!store.db.prepare(`SELECT 1 FROM band_members WHERE person_key = ? UNION ALL SELECT 1 FROM band_optouts WHERE person_key = ?`).get(key, key);

/**
 * La fiche d'avant que ce dossier remplace, quand ses entrées ou ses sorties sont tenues sous
 * une autre clé (l'adresse LinkedIn d'une fiche LinkedIn seule) et que le dossier n'en tient
 * aucune : elles passent sous lui, sans rien perdre, comme « Ajoute ton GitHub ».
 */
function previousOf(store: Store, root: CardRow): CardRow | null {
  const key = personKey(store, root);
  if (has(store, key)) return null;
  const ids = store.db
    .prepare(`SELECT id FROM cards WHERE superseded_by = ? AND parent_id IS NULL AND denounce_born = 0 ORDER BY created_at DESC`)
    .all(root.id) as { id: string }[];
  for (const { id } of ids) {
    const old = store.getCard(id);
    if (old && personKey(store, old) !== key && has(store, personKey(store, old))) return old;
  }
  return null;
}

/** Ce que l'entrée d'office ferait pour chaque fiche ; l'écrit seulement avec `apply`. */
export function catchUpBands(store: Store, o: { apply?: boolean; now?: number } = {}): BandCatchUp[] {
  const now = o.now ?? Date.now();
  const out: BandCatchUp[] = [];
  // À blanc, la même entrée d'office tourne dans un point de sauvegarde, puis tout est défait :
  // ce qui est affiché est exactement ce que --oui écrirait.
  store.db.exec("SAVEPOINT rattrapage_bandes");
  try {
    for (const id of enteringRootIds(store.db, now)) {
      const row = store.getCard(id);
      if (!row) continue;
      const from = previousOf(store, row);
      const types = autoJoinBands(store, row, { now, from, keepHeld: true });
      if (!types.length && !from) continue;
      const key = personKey(store, row);
      const label = (type: BandType) =>
        (store.db.prepare(`SELECT label FROM band_members WHERE person_key = ? AND kind = ?`).get(key, type) as { label: string } | undefined)?.label ?? "?";
      const url = (row.facts as { linkedinUrl?: unknown } | null)?.linkedinUrl;
      const login = store.loginOf(row);
      out.push({ id, who: login ? `@${login}` : typeof url === "string" ? url : id, joined: types.map((type) => ({ type, label: label(type) })), moved: !!from });
    }
  } catch (e) {
    store.db.exec("ROLLBACK TO rattrapage_bandes; RELEASE rattrapage_bandes");
    throw e;
  }
  store.db.exec(o.apply ? "RELEASE rattrapage_bandes" : "ROLLBACK TO rattrapage_bandes; RELEASE rattrapage_bandes");
  forgetBands(store.db);
  forgetWeekRanks(store.db);
  return out;
}
