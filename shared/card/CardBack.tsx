// Le dos de la fiche (SPEC §18.27, §18.48) : « La fiche se retourne ». Même
// silhouette 360 × 520, même style mat, mêmes polices et même mesure de texte
// que la face, pour pouvoir un jour le rendre en PNG (renderToStaticMarkup → resvg).
// Le dos dit d'où vient la note : les huit critères de la grille de recrutement,
// une ligne courte chacun et sa note sur 10 (§18.37), dans l'ordre du recruteur ;
// puis la note et sa formule (« (Code 7 × 2 + Stack 6 × 1,5 + …) ÷ 7,5 × 10 »).
// Il se lit sur un téléphone : aucun texte sous 13 unités, soit 12 px quand la
// fiche fait 334 px de large. Le détail complet vit dans la page, sous la fiche.
// Les six traits du recto n'y reviennent pas. Le dos se montre à tout le monde :
// la grille y passe toujours dans sa version publique (shared/publicView.ts), sans
// nom d'école ni d'employeur, et la note d'une école n'y paraît jamais.
// Une fiche d'avant la grille (ou scellée) garde le dos d'avant : ses six traits,
// leur fait le plus fort, et la formule des cinq axes si elle donne bien la note.
import { useId } from "react";
import { pieceLabel } from "../caseFile";
import { dec, excludedWhy, gridMath, usableGrid } from "../gridText";
import { publicGrid } from "../publicView";
import { RECRUITER_ORDER } from "../recruiterLine";
import type { CardData, GridCriterion, GridSource, Lang, Stat, StatCode } from "../types";
import { STAT_CODES, declaredOf, starsFor } from "../types";
import { AzeritGem } from "./AzeritGem";
import { Stars, Txt, sanitize, type CardGraphicProps } from "./Card";
import { CARD_H, CARD_R, CARD_W } from "./geometry";
import { t } from "./i18n";
import { caseLabel } from "./mug";
import { measure, truncate, upper, wrap } from "./text";
import { PALETTE, themeOf } from "./themes";

const LEFT = 20;
const RIGHT = CARD_W - 18;
const FW = RIGHT - LEFT;

/** Le plus petit corps du dos, en unités du viewBox : 13, soit 12 px quand la fiche fait 334 px de large. */
export const BACK_MIN_TEXT = 13;

/** Poids de la note globale : ceux de data/scoring.json (un test vérifie qu'ils n'ont pas dérivé). */
export const OVERALL_WEIGHTS: Record<Exclude<StatCode, "BUZZ">, number> = { TEC: 0.3, SHIP: 0.2, ARCH: 0.2, DOC: 0.15, XP: 0.15 };

/** Cotes du dos, unités du viewBox. */
export const BACK_LAYOUT = {
  head: { y: 31, size: BACK_MIN_TEXT },
  title: { y: 66, size: 26 },
  /** Les étoiles, à droite du titre : la taille des listes (§18.48). */
  stars: { size: 14, gap: 2 },
  /** Les huit critères : de `top` au filet de la formule, une rangée chacun (nom et note, puis une ligne). */
  criteria: { top: 78, name: 17, score: 22, size: BACK_MIN_TEXT, nameY: 16, lineY: 33, gap: 6, maxLines: 1 },
  /** Fiche d'avant la grille : les six traits, du haut au filet de la formule. */
  rows: { y: 80 },
  fact: { size: BACK_MIN_TEXT, lines: 1 },
  /**
   * La note et sa formule, calées sur le bas : le filet, puis « LA NOTE » et « = 79/100 »
   * sur une ligne, puis la formule sur toute la largeur, trois lignes au plus.
   */
  formula: { bottom: 505, labelDy: 25, firstDy: 44, size: BACK_MIN_TEXT, lineH: 16, maxLines: 3, result: 30, scale: BACK_MIN_TEXT },
} as const;

/** Le haut du filet de la formule, selon son nombre de lignes. */
export function formulaRule(lines: number): number {
  const F = BACK_LAYOUT.formula;
  return F.bottom - (F.firstDy + Math.max(0, lines - 1) * F.lineH);
}

/** Le fait le plus fort d'un axe, dans la langue de la fiche. */
export function strongestFact(stat: Stat | undefined, lang: Lang): string | null {
  const f = stat?.facts?.[0];
  if (!f) return null;
  return (f[lang] ?? f.fr)?.trim() || null;
}

/** Les termes de la formule, avec les valeurs de la fiche : « TEC 80 × 30 % ». */
export function formulaTerms(card: Pick<CardData, "stats">, lang: Lang): string[] {
  const s = t(lang);
  return (Object.keys(OVERALL_WEIGHTS) as (keyof typeof OVERALL_WEIGHTS)[]).map((code) => {
    const v = card.stats.find((st) => st.code === code)?.value ?? 0;
    return `${code} ${v} × ${s.back.weight(OVERALL_WEIGHTS[code])}`;
  });
}

/** La note que donnent les cinq axes pondérés : celle d'une fiche d'avant la grille. */
function axesOverall(card: Pick<CardData, "stats">): number {
  return Math.round((Object.keys(OVERALL_WEIGHTS) as (keyof typeof OVERALL_WEIGHTS)[]).reduce((sum, code) => sum + (card.stats.find((st) => st.code === code)?.value ?? 0) * OVERALL_WEIGHTS[code], 0));
}

/**
 * La formule du barème de recrutement, avec les notes de la fiche, juste à la
 * lecture : chaque critère compté, sa note sur 10 et son coefficient, entre
 * parenthèses (« (Code 7 × 2 + … ») puis la division par la somme des
 * coefficients et le passage sur 100 (« ÷ 8,5 × 10 »). Fiche vide : une phrase,
 * pas de terme. Quand l'école compte, la moyenne seule (`sentence`), sans le
 * détail : avec les autres notes et le résultat, on en tirerait la sienne.
 * Sans grille : null.
 */
export function gridFormula(card: Pick<CardData, "grid">, lang: Lang): { terms: string[]; tail?: string; sentence?: boolean } | null {
  if (!usableGrid(card.grid)) return null;
  const s = t(lang).back;
  const m = gridMath(card.grid);
  if (m.rule === "empty_file" || !m.terms.length) return { terms: [s.empty], sentence: true };
  const capped = m.capHit ? `, ${s.capped}` : "";
  if (m.terms.some((x) => x.code === "EDU")) return { terms: [`${s.meanOnly(m.terms.length)}${capped}`], sentence: true };
  const terms = m.terms.map((x) => s.term(s.criteria[x.code], x.score, dec(x.weight, lang)));
  terms[0] = `(${terms[0]}`;
  terms[terms.length - 1] = `${terms[terms.length - 1]})`;
  return { terms, tail: `${s.divide(dec(m.den, lang))}${capped}` };
}

/** Range les termes de la formule en lignes (jamais un terme coupé), trois au plus ;
 *  le corps descend d'un quart de point tant qu'il en faudrait plus, jamais sous 13.
 *  `tail` suit le dernier terme sans « + » (la division de la moyenne). */
export function packTerms(terms: string[], size: number, maxWidth: number, tail?: string): { lines: string[]; size: number } {
  const pieces = tail ? [...terms, tail] : terms;
  for (let sz = size; ; sz -= 0.25) {
    const lines: string[] = [];
    let cur = "";
    for (const [i, term] of pieces.entries()) {
      const piece = i < terms.length - 1 ? `${term} +` : term;
      const next = cur ? `${cur} ${piece}` : piece;
      if (cur && measure(next, "sans-500", sz) > maxWidth) {
        lines.push(cur);
        cur = piece;
      } else cur = next;
    }
    if (cur) lines.push(cur);
    if (lines.length <= BACK_LAYOUT.formula.maxLines || sz <= BACK_MIN_TEXT) return { lines, size: sz };
  }
}

/** La place que prend « = 79/100 » à droite de « LA NOTE ». */
export function resultWidth(overall: number): number {
  const F = BACK_LAYOUT.formula;
  return measure(`= ${overall}`, "display-800", F.result, -1) + measure("/100", "sans-600", F.scale) + 4;
}

/* ------------------------------------------------------------------ */
/* Les huit critères                                                    */
/* ------------------------------------------------------------------ */

/** Un critère, tel que le dos le montre. */
export interface BackCriterion {
  code: GridCriterion["code"];
  name: string;
  /** La note sur 10 ; null : pas de note à montrer. */
  score: number | null;
  /** L'école comptée dans la note : ni note ni tiret, la ligne dit qu'elle est au dossier. */
  hidden?: boolean;
  /** false : la note n'entre pas dans la moyenne. */
  counted: boolean;
  /** D'où vient la pièce, et son état : « GitHub », « GitHub · non prouvé », « hors moyenne »… */
  tag: string;
  /** L'état seul, écrit à côté du nom : « non prouvé », « pas au dossier », « hors moyenne » ; vide sinon. */
  state: string;
  /** La pièce : un fait précis, sinon le niveau atteint, sinon la source. */
  proof: string;
}

/** D'où vient une pièce. La fiche d'un dossier dit ses pièces (`pieces`) ; une fiche seule, sa source déclarée. */
const sourceLabel = (card: Pick<CardData, "declaredSource" | "pieces">, source: GridSource): string => {
  const declared = pieceLabel(card.pieces?.find((p) => p !== "github") ?? declaredOf(card));
  return source === "github" ? "GitHub" : source === "both" ? `${declared} + GitHub` : declared;
};

/**
 * Une pièce sur `maxLines` lignes. Si elle ne tient pas, on garde les phrases
 * entières qui tiennent plutôt qu'une phrase coupée ; puis le début de la
 * première phrase jusqu'à son premier « : » ou sa première virgule, s'il dit
 * quelque chose seul (trois mots au moins : « 6 années actives. ») ; à défaut,
 * la dernière ligne finit par « … ».
 */
export function clipProof(text: string, maxWidth: number, maxLines: number): string[] {
  const C = BACK_LAYOUT.criteria;
  const lay = (t: string): string[] => (maxLines === 1 ? [truncate(t, "sans-500", C.size, maxWidth)] : wrap(t, "sans-500", C.size, maxWidth, maxLines));
  const fits = (lines: string[]) => !lines[lines.length - 1]?.endsWith("…");
  const whole = lay(text);
  if (fits(whole)) return whole;
  const sentences = text.split(/(?<=[.!?»])\s+(?=[\p{Lu}\p{N}«"])/u);
  for (let n = sentences.length - 1; n >= 1; n--) {
    const lines = lay(sentences.slice(0, n).join(" "));
    if (fits(lines)) return lines;
  }
  const clause = /^(.+?)(?:\s?:\s|,\s|\s;\s)/u.exec(sentences[0])?.[1]?.trim();
  if (clause && clause.split(/\s+/).length >= 3) {
    const lines = lay(`${clause.replace(/[.…]+$/, "")}.`);
    if (fits(lines)) return lines;
  }
  // Dernier recours : couper sur un mot entier, jamais au milieu (« ne donne ri… »).
  const last = whole[whole.length - 1].slice(0, -1);
  const space = last.lastIndexOf(" ");
  if (space > last.length * 0.6) whole[whole.length - 1] = `${last.slice(0, space).replace(/[\s,;:·(\-–«]+$/u, "")}…`;
  return whole;
}

/**
 * Les critères du dos, dans l'ordre du recruteur (l'expérience d'abord, le code
 * en preuve), lus dans la grille publique : jamais un nom d'école ou d'employeur,
 * jamais le rang d'une école, jamais sa note.
 */
export function backCriteria(card: Pick<CardData, "grid" | "declaredSource" | "pieces">, lang: Lang): BackCriterion[] {
  if (!usableGrid(card.grid)) return [];
  const s = t(lang).back;
  const grid = publicGrid(card.grid);
  const empty = grid.rule === "empty_file";
  const byCode = new Map(grid.criteria.map((c) => [c.code, c]));
  return RECRUITER_ORDER.map((code) => byCode.get(code))
    .filter((c): c is GridCriterion => !!c)
    .map((c) => {
      const why = excludedWhy(c);
      const evSource = c.evidence?.source ?? c.source;
      const src = sourceLabel(card, evSource);
      const pick = (f: { fr: string; en: string } | undefined) => (f ? (f[lang] ?? f.fr).trim() : "");
      // L'école comptée : la ligne dit qu'elle est au dossier, sa note ne se montre pas.
      if (c.code === "EDU" && !c.private && c.score !== null && why === null) {
        return { code: c.code, name: s.criteria.EDU, score: null, hidden: true, counted: !empty, tag: src, state: "", proof: s.schoolCounted };
      }
      const score = c.private ? null : c.score;
      const state = c.private || why === "below" ? s.outOfMean : why === "missing" ? s.missing : why === "unproven" ? s.unproven : "";
      const tag = score === null ? state : state ? `${src} · ${state}` : src;
      // Les accents graves du moteur (du code cité) ne se lisent pas sur une fiche.
      const proof = (pick(c.evidence?.text) || pick(c.reached) || s.readOn(src)).replace(/`/g, "");
      return { code: c.code, name: s.criteria[c.code], score, counted: !empty && c.counted && score !== null, tag, state, proof };
    });
}

interface PlacedCriterion extends BackCriterion {
  y: number;
  h: number;
  lines: string[];
}

/**
 * La mise en page des critères : une rangée chacun, à parts égales entre `top`
 * et `bottom` ; une ligne de pièce, des phrases entières quand elles tiennent,
 * sinon coupée d'un « … ».
 */
export function placeCriteria(rows: BackCriterion[], bottom: number = formulaRule(3) - BACK_LAYOUT.criteria.gap): PlacedCriterion[] {
  const C = BACK_LAYOUT.criteria;
  if (!rows.length) return [];
  const h = (bottom - C.top) / rows.length;
  return rows.map((r, i) => ({ ...r, y: +(C.top + i * h).toFixed(2), h: +h.toFixed(2), lines: clipProof(r.proof, FW, C.maxLines) }));
}

function CriterionRow({ row, lang, ink, inkSoft, last }: { row: PlacedCriterion; lang: Lang; ink: string; inkSoft: string; last: boolean }) {
  const C = BACK_LAYOUT.criteria;
  const name = upper(row.name, lang);
  const nameW = measure(name, "display-700", C.name, 0.4);
  const scaleW = measure("/10", "sans-600", BACK_MIN_TEXT);
  const scoreW = row.hidden ? 0 : row.score === null ? 14 : measure(String(row.score), "display-700", C.score) + scaleW + 3;
  const state = row.state ? truncate(upper(row.state, lang), "sans-600", BACK_MIN_TEXT, FW - nameW - scoreW - 18, 0.5) : "";
  // Le bloc (nom, puis la ligne) centré dans sa rangée.
  const top = +(row.y + (row.h - (C.lineY + 4)) / 2).toFixed(2);
  const dim = row.counted ? undefined : 0.6;
  return (
    <g data-criterion={row.code}>
      <Txt x={LEFT} y={+(top + C.nameY).toFixed(2)} font="display-700" size={C.name} ls={0.4} fill={ink} opacity={row.score === null && !row.hidden ? 0.75 : undefined}>
        {name}
      </Txt>
      {state && (
        <Txt x={+(LEFT + nameW + 8).toFixed(2)} y={+(top + C.nameY - 0.5).toFixed(2)} font="sans-600" size={BACK_MIN_TEXT} ls={0.5} fill={inkSoft} opacity={0.75}>
          {state}
        </Txt>
      )}
      {row.hidden ? null : row.score === null ? (
        <Txt x={RIGHT} y={+(top + C.nameY + 1).toFixed(2)} font="display-700" size={C.score} anchor="end" fill={inkSoft} opacity={0.45}>
          –
        </Txt>
      ) : (
        <>
          <Txt x={+(RIGHT - scaleW - 2).toFixed(2)} y={+(top + C.nameY + 1).toFixed(2)} font="display-700" size={C.score} anchor="end" fill={ink} opacity={dim}>
            {row.score}
          </Txt>
          <Txt x={RIGHT} y={+(top + C.nameY + 1).toFixed(2)} font="sans-600" size={BACK_MIN_TEXT} anchor="end" fill={inkSoft} opacity={0.75}>
            /10
          </Txt>
        </>
      )}
      {row.lines.map((line, i) => (
        <Txt key={i} x={LEFT} y={+(top + C.lineY).toFixed(2)} font="sans-500" size={C.size} fill={inkSoft} opacity={0.92}>
          {line}
        </Txt>
      ))}
      {!last && <rect x={LEFT} y={+(row.y + row.h - 0.5).toFixed(2)} width={FW} height={1} fill="#fff" fillOpacity={0.1} />}
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* Fiche d'avant la grille : les six traits                             */
/* ------------------------------------------------------------------ */

function AxisRow({ stat, code, y, h, lang, ink, inkSoft, last }: { stat?: Stat; code: StatCode; y: number; h: number; lang: Lang; ink: string; inkSoft: string; last: boolean }) {
  const s = t(lang);
  const R = BACK_LAYOUT.fact;
  const weak = stat ? !stat.sufficient : true;
  const value = stat ? String(stat.value) : "–";
  const name = upper(s.back.axes[code], lang) + (code === "BUZZ" ? ` · ${upper(s.buzzNote, lang)}` : weak ? ` · ${upper(s.insufficient, lang)}` : "");
  const valueW = measure(value, "display-700", 24);
  const nameMax = FW - 46 - valueW - 8;
  const fact = strongestFact(stat, lang) ?? s.back.noFact;
  const lines = clipProof(fact, FW, R.lines);
  const top = +(y + (h - 40) / 2).toFixed(2);
  return (
    <g>
      <Txt x={LEFT} y={top + 17} font="display-700" size={19} ls={0.3} fill={ink}>
        {code}
      </Txt>
      <Txt x={LEFT + 46} y={top + 16} font="sans-600" size={BACK_MIN_TEXT} ls={0.5} fill={inkSoft} opacity={0.75}>
        {truncate(name, "sans-600", BACK_MIN_TEXT, nameMax, 0.5)}
      </Txt>
      <Txt x={RIGHT} y={top + 18} font="display-700" size={24} anchor="end" fill={ink} opacity={weak && code !== "BUZZ" ? 0.6 : undefined}>
        {value}
      </Txt>
      {lines.map((line, i) => (
        <Txt key={i} x={LEFT} y={top + 36} font="sans-500" size={R.size} fill={inkSoft}>
          {line}
        </Txt>
      ))}
      {!last && <rect x={LEFT} y={+(y + h - 0.5).toFixed(2)} width={FW} height={1} fill="#fff" fillOpacity={0.1} />}
    </g>
  );
}

export function CardBackGraphic({ card, lang: langProp, idPrefix, className, x, y, width, height }: Omit<CardGraphicProps, "avatarHref">) {
  const rid = sanitize(useId());
  const idp = sanitize(idPrefix ?? `tysb${rid}`);
  const lang: Lang = langProp ?? card.lang ?? "fr";
  const s = t(lang);
  const th = themeOf(card);
  const n = starsFor(card.overall);
  const u = (k: string) => `url(#${idp}-${k})`;
  const sky = th.grad === "sky" && th.sky ? th.sky : null;
  // Un seul dégradé au plus : le fond qui descend dans son ton ; aplat sinon.
  const flat = sky ? sky.ground : th.bg[0];
  const F = BACK_LAYOUT.formula;
  const B = BACK_LAYOUT.stars;

  // Fiche scellée (shared/publicView.ts) : ni étoiles, ni formule, ni note ; deux mots mats à la place.
  const sealed = !!card.sealed;
  const grid = sealed ? null : gridFormula(card, lang);
  // Fiche d'avant la grille : la formule des cinq axes, seulement si elle donne bien la note affichée.
  const legacy = !grid && axesOverall(card) === card.overall;
  // Une phrase (fiche vide, moyenne seule, d'où vient la note) se coupe au mot ; des termes se rangent sans jamais en couper un.
  const sentence = (text: string) => ({ lines: wrap(text, "sans-500", F.size, FW, F.maxLines), size: F.size as number });
  const formula = sealed
    ? sentence(s.sealedSub)
    : grid?.sentence
      ? sentence(grid.terms.join(" "))
      : grid
        ? packTerms(grid.terms, F.size, FW, grid.tail)
        : legacy
          ? packTerms(formulaTerms(card, lang), F.size, FW)
          : sentence(s.back.fromGrid);
  const rule = formulaRule(formula.lines.length);
  const criteria = grid ? placeCriteria(backCriteria(card, lang), rule - BACK_LAYOUT.criteria.gap) : [];
  const rowH = (rule - 4 - BACK_LAYOUT.rows.y) / STAT_CODES.length;
  const handle = card.login ? `@${upper(card.login, lang)}` : upper(card.name, lang);
  const caseNo = caseLabel(card.id, lang);
  const H = BACK_LAYOUT.head;
  const head = `${truncate(handle, "mono-500", H.size, 236 - measure(` · ${caseNo}`, "mono-500", H.size, 0.4), 0.4)} · ${caseNo}`;
  const scaleW = measure("/100", "sans-600", F.scale);
  const labelY = rule + F.labelDy;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${CARD_W} ${CARD_H}`}
      x={x}
      y={y}
      width={width ?? "100%"}
      height={height}
      className={className}
      role="img"
      aria-label={`${s.back.title}, ${card.name}`}
      data-side="back"
      style={width === undefined ? { display: "block", width: "100%", height: "auto" } : undefined}
    >
      <defs>
        <clipPath id={`${idp}-card`}>
          <rect width={CARD_W} height={CARD_H} rx={CARD_R} />
        </clipPath>
        {th.grad === "bg" && (
          <linearGradient id={`${idp}-g`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={th.bg[0]} />
            <stop offset="1" stopColor={th.bg[1]} />
          </linearGradient>
        )}
        <filter id={`${idp}-grain`} x="0" y="0" width={CARD_W} height={CARD_H} filterUnits="userSpaceOnUse">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={7} stitchTiles="stitch" />
          <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.5 0" />
        </filter>
        {th.rim && (
          <filter id={`${idp}-rim`} x="-5%" y="-5%" width="110%" height="110%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
        )}
      </defs>

      <g clipPath={u("card")}>
        <rect width={CARD_W} height={CARD_H} fill={th.grad === "bg" ? u("g") : flat} />
        <rect width={CARD_W} height={CARD_H} filter={u("grain")} opacity={0.05} />

        {/* Haut : la marque à gauche ; à droite, à qui est la fiche et son numéro, comme au recto */}
        <AzeritGem x={LEFT} y={17} h={15} />
        <Txt x={LEFT + 19} y={H.y} font="sans-600" size={H.size} ls={1.8} fill={th.inkSoft} opacity={0.85}>
          AZERIT
        </Txt>
        <Txt x={RIGHT} y={H.y} font="mono-500" size={H.size} ls={0.4} anchor="end" fill={th.inkSoft} opacity={0.8}>
          {head}
        </Txt>

        <Txt x={LEFT - 1} y={BACK_LAYOUT.title.y} font="display-700" size={BACK_LAYOUT.title.size} ls={0.4} fill={th.ink}>
          {upper(s.back.title, lang)}
        </Txt>
        {!sealed && <Stars n={n} x={RIGHT - 6 * B.size - 5 * B.gap} y={BACK_LAYOUT.title.y - B.size - 3} size={B.size} gap={B.gap} />}

        {grid ? (
          // Les huit critères de la grille, chacun avec sa note et une ligne : c'est d'eux que vient la note
          criteria.map((row, i) => <CriterionRow key={row.code} row={row} lang={lang} ink={th.ink} inkSoft={th.inkSoft} last={i === criteria.length - 1} />)
        ) : (
          STAT_CODES.map((code, i) => (
            <AxisRow
              key={code}
              code={code}
              stat={card.stats.find((st) => st.code === code)}
              y={+(BACK_LAYOUT.rows.y + i * rowH).toFixed(2)}
              h={rowH}
              lang={lang}
              ink={th.ink}
              inkSoft={th.inkSoft}
              last={i === STAT_CODES.length - 1}
            />
          ))
        )}

        {/* La note, puis sa formule : les critères notés du barème et leurs coefficients (avant 0.4.0 : les cinq axes et leurs poids) */}
        <rect x={LEFT} y={rule} width={FW} height={1} fill="#fff" fillOpacity={0.22} />
        <Txt x={LEFT} y={labelY} font="sans-600" size={BACK_MIN_TEXT} ls={0.8} fill={th.inkSoft} opacity={0.75}>
          {upper(sealed ? s.sealed : grid ? s.back.gridRating : s.back.rating, lang)}
        </Txt>
        {!sealed && (
          <g data-result="">
            <Txt x={+(RIGHT - scaleW - 2).toFixed(2)} y={labelY} font="display-800" size={F.result} anchor="end" ls={-1} fill={th.ink}>
              {`= ${card.overall}`}
            </Txt>
            <Txt x={RIGHT} y={labelY} font="sans-600" size={F.scale} anchor="end" fill={th.inkSoft} opacity={0.8}>
              /100
            </Txt>
          </g>
        )}
        <g data-sealed-mark={sealed ? "" : undefined}>
          {formula.lines.map((line, i) => (
            <Txt key={i} x={LEFT} y={rule + F.firstDy + i * F.lineH} font="sans-500" size={formula.size} fill={th.inkSoft}>
              {line}
            </Txt>
          ))}
        </g>

        {th.rim ? (
          <>
            <rect width={CARD_W} height={CARD_H} rx={CARD_R} fill="none" stroke={PALETTE.rimGlow} strokeWidth={12} strokeOpacity={0.75} filter={u("rim")} />
            <rect x={0.75} y={0.75} width={CARD_W - 1.5} height={CARD_H - 1.5} rx={CARD_R - 0.75} fill="none" stroke={PALETTE.rimCore} strokeWidth={1.5} />
          </>
        ) : (
          <rect x={0.5} y={0.5} width={CARD_W - 1} height={CARD_H - 1} rx={CARD_R - 0.5} fill="none" stroke="#fff" strokeOpacity={0.08} />
        )}
      </g>
    </svg>
  );
}

/** Le dos seul, responsive (width 100 %). */
export function CardBack(props: Omit<CardGraphicProps, "avatarHref" | "x" | "y" | "width" | "height">) {
  return <CardBackGraphic {...props} />;
}

export default CardBack;
