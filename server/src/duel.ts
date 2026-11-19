// Le duel d'une dénonciation (SPEC §18.94). Le lien que le dénonciateur envoie porte
// `?r={sa fiche}` ; quand `r` est bien `cards.denounced_by` de la fiche ouverte et que
// la fiche du dénonciateur est visible, l'aperçu du lien devient le face-à-face :
// og:image `/og/{fiche}-vs-{dénonciateur}.png`, og:title « @moi te dénonce : 78 contre 71 ».
// Tout autre `r`, ou un cas douteux (fiche masquée, dénonciateur scellé, adresse d'une
// pièce), garde l'aperçu habituel. La règle de comparaison est celle de la page
// partagée (shared/versus.ts) : les étoiles d'abord, les points à étoiles égales.
//
// Le cache disque : `{ogDir}/vs/{fiche}-vs-{dénonciateur}-{clé}.png`, où la clé est
// l'empreinte des deux vues publiques. Une revendication, une photo, un dossier qui
// remplace une fiche changent la clé : jamais une image d'un ancien état. Les fichiers
// d'un couple partent avec l'une des deux fiches (removeImages, app.ts), au masquage
// et à la revendication (auth.ts).
import { createHash } from "node:crypto";
import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileOf } from "../../shared/caseFile";
import { IMAGE_QUERY } from "../../shared/images";
import { publicView } from "../../shared/publicView";
import type { CardData, ComparisonData, Lang } from "../../shared/types";
import { verdict } from "../../shared/versus";
import type { CardRow, Store } from "./db";
import type { PageMeta } from "./html";
import { ID_RE } from "./pipeline";
import { withWeekSpecial } from "./top";

/** `/og/{fiche}-vs-{dénonciateur}.png` */
export const DUEL_FILE_RE = /^([A-Za-z0-9]{6,32})-vs-([A-Za-z0-9]{6,32})\.png$/;
/** Le sous-dossier du cache disque des duels. */
export const DUEL_DIR = "vs";

export interface Duel {
  /** La fiche dénoncée, en vue publique (scellée si le dossier est vide et fait par un tiers). */
  target: CardData;
  /** La fiche du dénonciateur, en vue publique, jamais scellée. */
  by: CardData;
  /** Le dénonciateur signe (connecté comme propriétaire de sa fiche, §18.23) : l'aperçu le nomme. */
  named: boolean;
  /** Empreinte des deux vues publiques : la clé du cache disque. */
  key: string;
}

const cardOf = (data: CardData | ComparisonData): CardData => ("cv" in data && "github" in data ? fileOf(data) : (data as CardData));

/**
 * Le duel de la fiche `row` (celle qui se montre à son adresse) avec la fiche `r`, ou null.
 * `thirdParty` : la règle d'app.ts (née d'une dénonciation, login pas revendiqué).
 */
export function duelOf(store: Store, row: CardRow, r: string | null | undefined, thirdParty: (row: CardRow) => boolean): Duel | null {
  if (!r || !ID_RE.test(r) || row.denouncedBy !== r || r === row.id) return null;
  if (store.isHidden(store.loginOf(row))) return null;
  // La fiche du dénonciateur telle qu'elle se montre à son adresse (le dossier qui l'a remplacée).
  const byRow = store.fileRow(r);
  if (!byRow || byRow.id === row.id || store.isHidden(store.loginOf(byRow))) return null;
  const target = cardOf(publicView(withWeekSpecial(store.db, row.data).data, { thirdParty: thirdParty(row) }));
  const by = cardOf(publicView(withWeekSpecial(store.db, byRow.data).data, { thirdParty: thirdParty(byRow) }));
  // Le dénonciateur sans note (dossier vide fait par un tiers) : rien à comparer.
  if (by.sealed) return null;
  const named = !!row.denouncerLogin && !!store.getOwner(row.denouncerLogin) && store.loginOf(byRow)?.toLowerCase() === row.denouncerLogin;
  const key = createHash("sha1").update(JSON.stringify([target, by])).digest("hex").slice(0, 12);
  return { target, by, named, key };
}

const whoOf = (card: CardData) => (card.login ? `@${card.login}` : card.name);

const WORDS: Record<Lang, { starsAhead: (n: number) => string; pointsAhead: (n: number) => string; tie: string; beat: (who: string) => string }> = {
  fr: {
    starsAhead: (n) => (n === 1 ? "une étoile d'avance" : `${n} étoiles d'avance`),
    pointsAhead: (n) => (n === 1 ? "1 point d'avance" : `${n} points d'avance`),
    tie: "Égalité : complices",
    beat: (who) => `Fais mieux que ${who} ?`,
  },
  en: {
    starsAhead: (n) => (n === 1 ? "one star ahead" : `${n} stars ahead`),
    pointsAhead: (n) => (n === 1 ? "1 point ahead" : `${n} points ahead`),
    tie: "Tie: partners in crime",
    beat: (who) => `Beat ${who}?`,
  },
};

/**
 * Le verdict en une ligne : « @moi a une étoile d'avance », « @x a 3 points d'avance »,
 * « Égalité : complices ». Face à un dossier scellé, l'invitation : « Fais mieux que @moi ? ».
 */
export function duelVerdict(d: Pick<Duel, "by" | "target">, lang: Lang): string {
  const w = WORDS[lang];
  if (d.target.sealed) return w.beat(whoOf(d.by));
  const v = verdict(d.by.overall, d.target.overall);
  if (v.by === "tie") return w.tie;
  const leader = whoOf(v.ahead ? d.by : d.target);
  const gap = v.by === "stars" ? w.starsAhead(v.n) : w.pointsAhead(v.n);
  return lang === "fr" ? `${leader} a ${gap}` : `${leader} is ${gap}`;
}

/** Les balises du lien envoyé : le duel en image, le titre et la description courts. */
export function duelMeta(d: Duel, base: PageMeta, baseUrl: string): PageMeta {
  const lang = base.lang;
  const fr = lang === "fr";
  const byWho = whoOf(d.by);
  const lead = d.named ? (fr ? `${byWho} te dénonce` : `${byWho} turned you in`) : fr ? "On te dénonce" : "You've been turned in";
  const sealed = !!d.target.sealed;
  const title = sealed
    ? fr
      ? `${lead}. À toi de jouer.`
      : `${lead}. Your move.`
    : fr
      ? `${lead} : ${d.by.overall} contre ${d.target.overall}. À toi de jouer.`
      : `${lead}: ${d.by.overall} vs ${d.target.overall}. Your move.`;
  const line = duelVerdict(d, lang);
  const description = sealed
    ? fr
      ? `${line} Reprends ta fiche.`
      : `${line} Take your sheet back.`
    : fr
      ? `${line}. Reprends ta fiche et fais mieux.`
      : `${line}. Take your sheet back and beat it.`;
  return {
    ...base,
    title,
    description,
    image: `${baseUrl}/og/${d.target.id}-vs-${d.by.id}.png?${IMAGE_QUERY}&k=${d.key}`,
    imageAlt: fr ? `Face-à-face : ${d.by.name} contre ${d.target.name}` : `Face-off: ${d.by.name} vs ${d.target.name}`,
  };
}

/** Le fichier du cache disque d'un duel. */
export const duelPath = (ogDir: string, targetId: string, byId: string, key: string) => join(ogDir, DUEL_DIR, `${targetId}-vs-${byId}-${key}.png`);

/** Efface les images de duel où paraît l'une de ces fiches, d'un côté ou de l'autre. */
export async function removeDuels(ogDir: string, ids: string[]): Promise<void> {
  if (!ids.length) return;
  const dir = join(ogDir, DUEL_DIR);
  const names = await readdir(dir).catch(() => [] as string[]);
  const set = new Set(ids);
  await Promise.all(
    names
      .filter((n) => {
        const m = /^([A-Za-z0-9]+)-vs-([A-Za-z0-9]+)-/.exec(n);
        return !!m && (set.has(m[1]!) || set.has(m[2]!));
      })
      .map((n) => rm(join(dir, n), { force: true })),
  );
}
