// Rattrapage de la photo LinkedIn (SPEC §18.98) : avant ce paragraphe, « Mettre ma photo
// LinkedIn » posait la photo sur la fiche de l'adresse, même quand un dossier l'avait
// remplacée : l'adresse montrait le dossier, sans la photo. Ce script copie la photo LinkedIn
// d'une fiche remplacée vers le dossier qui la montre, s'il n'en montre pas déjà une.
// Rien d'autre : les fiches nées sans photo ne peuvent pas être rattrapées (la photo de la
// connexion n'est jamais gardée, celle du fournisseur non plus) ; elles prennent la photo de
// la connexion la prochaine fois que la personne revient par LinkedIn.
//
// Usage : npx tsx --env-file-if-exists=.env scripts/photo-linkedin-backfill.ts [--apply]
// Sans --apply, il dit seulement ce qu'il ferait. Lit DB_PATH, BASE_URL comme le serveur.
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileOf } from "../shared/caseFile";
import { IMAGE_DESIGN_DIR } from "../shared/images";
import type { CardData, ComparisonData } from "../shared/types";
import { removeImages } from "../server/src/app";
import { Store } from "../server/src/db";
import { applyPhoto, ownPhoto, savePhoto, showsLinkedinPhoto } from "../server/src/linkedin";

const apply = process.argv.includes("--apply");
const prod = process.env.NODE_ENV === "production";
const baseUrl = (process.env.BASE_URL ?? (prod ? "https://skills.azerit.tech" : "http://localhost:5180")).replace(/\/+$/, "");
const dbPath = resolve(process.env.DB_PATH ?? join(import.meta.dirname, "../var/cards.db"));
if (!existsSync(dbPath)) {
  console.error(`Base introuvable : ${dbPath}`);
  process.exit(1);
}
const avatarDir = join(dirname(dbPath), "avatars");
const ogDir = join(dirname(dbPath), "og", IMAGE_DESIGN_DIR);
const store = new Store(dbPath);

const ids = (store.db.prepare(`SELECT id FROM cards WHERE parent_id IS NULL AND superseded_by IS NOT NULL ORDER BY created_at`).all() as { id: string }[]).map((r) => r.id);
let moved = 0;
let missing = 0;
for (const id of ids) {
  const old = store.getCard(id);
  const file = old ? store.fileRow(id) : null;
  if (!old || !file || file.id === old.id || !showsLinkedinPhoto(old) || showsLinkedinPhoto(file)) continue;
  const shown = old.kind === "comparison" ? fileOf(old.data as ComparisonData) : (old.data as CardData);
  const photo = await ownPhoto(shown.avatarUrl, baseUrl, avatarDir);
  if (!photo) {
    missing++;
    console.log(`${old.id} → ${file.id} : photo introuvable sur disque (${shown.avatarUrl}), rien à copier`);
    continue;
  }
  moved++;
  console.log(`${old.id} → ${file.id} : photo LinkedIn ${apply ? "copiée" : "à copier"}`);
  if (!apply) continue;
  const avatarUrl = await savePhoto(avatarDir, baseUrl, file.id, photo);
  await removeImages(ogDir, applyPhoto(store, file, avatarUrl));
}
store.close();
console.log(`${ids.length} fiches remplacées lues ; ${moved} photo(s) ${apply ? "copiée(s)" : "à copier"} ; ${missing} introuvable(s).${apply ? "" : " Relancer avec --apply pour écrire."}`);
