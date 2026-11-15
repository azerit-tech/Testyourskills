// Le dos de la fiche (SPEC §18.27, §18.48) : « La fiche se retourne ». Même
// silhouette 360 × 520, même style mat, mêmes polices et même mesure de texte
// que la face, pour pouvoir un jour le rendre en PNG (renderToStaticMarkup → resvg).
// Le dos dit d'où vient la note : les huit critères de la grille de recrutement,
// chacun avec sa note sur 10 et sa pièce (§18.37), dans l'ordre du recruteur ;
// puis la formule (« Code 7 × 2 + Stack 6 × 1,5 + … ÷ 7,5 = 79/100 »). Les six
// traits du recto n'y reviennent pas. Le dos se montre à tout le monde : la
// grille y passe toujours dans sa version publique (shared/publicView.ts), sans
// nom d'école ni d'employeur.
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

/** Poids de la note globale : ceux de data/scoring.json (un test vérifie qu'ils n'ont pas dérivé). */
export const OVERALL_WEIGHTS: Record<Exclude<StatCode, "BUZZ">, number> = { TEC: 0.3, SHIP: 0.2, ARCH: 0.2, DOC: 0.15, XP: 0.15 };

/** Cotes du dos, unités du viewBox. */
export const BACK_LAYOUT = {
  title: { y: 66, size: 26 },
  /** Les étoiles, à droite du titre : la taille des listes (§18.48). */
  stars: { size: 14, gap: 2 },
  /** Les huit critères : de `top` à `bottom`, hauteur partagée selon les lignes de pièce. */
  criteria: { top: 80, bottom: 436, head: 19, lineH: 12.5, size: 10.5, pad: 7, maxLines: 2 },
  /** Fiche d'avant la grille : les six traits, à hauteur fixe. */
  rows: { y: 84, h: 58 },
  fact: { size: 12, lineH: 14.5, lines: 2 },
  formula: { rule: 440, labelY: 454, y: 469, size: 10.5, lineH: 13.5, maxLines: 3, result: 36, resultLine: 1, scale: 11 },
} as const;

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
 * La formule du barème de recrutement, avec les notes de la fiche : chaque
 * critère compté, sa note sur 10 et son coefficient (« Code 7 × 2 »), puis la
 * division par la somme des coefficients (« ÷ 8,5 »). Le libellé dit « moyenne
 * pondérée × 10 ». Dossier vide : une phrase, pas de terme. Sans grille : null.
 */
export function gridFormula(card: Pick<CardData, "grid">, lang: Lang): { terms: string[]; tail?: string } | null {
  if (!usableGrid(card.grid)) return null;
  const s = t(lang).back;
  const m = gridMath(card.grid);
  if (m.rule === "empty_file" || !m.terms.length) return { terms: [s.empty] };
  const terms = m.terms.map((x) => s.term(s.criteria[x.code], x.score, dec(x.weight, lang)));
  const tail = `${s.divide(dec(m.den, lang))}${m.capHit ? `, ${s.capped}` : ""}`;
  return { terms, tail };
}

/** Range les termes de la formule en lignes (jamais un terme coupé), trois au plus ;
 *  le corps descend d'un quart de point tant qu'il en faudrait plus. `tail` suit le
 *  dernier terme sans « + » (la division de la moyenne). */
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
    if (lines.length <= BACK_LAYOUT.formula.maxLines || sz <= 8) return { lines, size: sz };
  }
}

/** La place que prend « = 79/100 » à droite de la formule. */
export function resultWidth(overall: number): number {
  const F = BACK_LAYOUT.formula;
  return measure(`= ${overall}`, "display-800", F.result, -1) + measure("/100", "sans-600", F.scale) + 14;
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
  /** false : la note n'entre pas dans la moyenne. */
  counted: boolean;
  /** D'où vient la pièce, ou pourquoi il n'y en a pas : « GitHub », « non prouvé », « hors moyenne »… */
  tag: string;
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
 * entières qui tiennent plutôt qu'une phrase coupée ; à défaut, la dernière
 * ligne finit par « … ».
 */
export function clipProof(text: string, maxWidth: number, maxLines: number): string[] {
  const C = BACK_LAYOUT.criteria;
  const lay = (t: string): string[] => (maxLines === 1 ? [truncate(t, "sans-500", C.size, maxWidth)] : wrap(t, "sans-500", C.size, maxWidth, maxLines));
  const whole = lay(text);
  if (!whole[whole.length - 1]?.endsWith("…")) return whole;
  const sentences = text.split(/(?<=[.!?»])\s+(?=[\p{Lu}«"])/u);
  for (let n = sentences.length - 1; n >= 1; n--) {
    const lines = lay(sentences.slice(0, n).join(" "));
    if (!lines[lines.length - 1]?.endsWith("…")) return lines;
  }
  return whole;
}

/**
 * Les critères du dos, dans l'ordre du recruteur (l'expérience d'abord, le code
 * en preuve), lus dans la grille publique : jamais un nom d'école ou d'employeur,
 * jamais le rang d'une école.
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
      const score = c.private ? null : c.score;
      const evSource = c.evidence?.source ?? c.source;
      const src = sourceLabel(card, evSource);
      const state = c.private || why === "below" ? s.outOfMean : why === "missing" ? s.missing : why === "unproven" ? s.unproven : "";
      const tag = score === null ? state : state ? `${src} · ${state}` : src;
      const pick = (f: { fr: string; en: string } | undefined) => (f ? (f[lang] ?? f.fr).trim() : "");
      // Les accents graves du moteur (du code cité) ne se lisent pas sur une fiche.
      const proof = (pick(c.evidence?.text) || pick(c.reached) || s.readOn(src)).replace(/`/g, "");
      return { code: c.code, name: s.criteria[c.code], score, counted: !empty && c.counted && score !== null, tag, proof };
    });
}

interface PlacedCriterion extends BackCriterion {
  y: number;
  h: number;
  lines: string[];
}

/**
 * La mise en page des critères : chaque pièce sur une ou deux lignes. Si tout
 * ne tient pas, les pièces qui pèsent le moins (hors moyenne d'abord, puis les
 * plus petits coefficients, en fin d'ordre) repassent à une ligne, coupée d'un
 * « … ». Le reste de la hauteur se partage entre les rangs.
 */
export function placeCriteria(rows: BackCriterion[]): PlacedCriterion[] {
  const C = BACK_LAYOUT.criteria;
  if (!rows.length) return [];
  const budget = C.bottom - C.top;
  const wanted = rows.map((r) => clipProof(r.proof, FW, C.maxLines));
  const count = wanted.map((w) => w.length);
  const total = () => count.reduce((sum, n) => sum + C.head + n * C.lineH + C.pad, 0);
  const order = rows.map((_, i) => i).sort((a, b) => Number(rows[a].counted) - Number(rows[b].counted) || b - a);
  for (const i of order) {
    if (total() <= budget) break;
    if (count[i] > 1) count[i] = 1;
  }
  const spare = Math.max(0, Math.min(10, (budget - total()) / rows.length));
  let y: number = C.top;
  return rows.map((r, i) => {
    const lines = count[i] === wanted[i].length ? wanted[i] : clipProof(r.proof, FW, count[i]);
    const h = C.head + count[i] * C.lineH + C.pad + spare;
    const placed = { ...r, y, h, lines };
    y += h;
    return placed;
  });
}

function CriterionRow({ row, lang, ink, inkSoft, last }: { row: PlacedCriterion; lang: Lang; ink: string; inkSoft: string; last: boolean }) {
  const C = BACK_LAYOUT.criteria;
  const name = upper(row.name, lang);
  const nameW = measure(name, "display-700", 17, 0.4);
  const scoreW = row.score === null ? 14 : measure(String(row.score), "display-700", 22) + measure("/10", "sans-600", 9) + 3;
  const tag = row.tag ? truncate(upper(row.tag, lang), "sans-600", 7.5, FW - nameW - scoreW - 18, 0.9) : "";
  const top = row.y + (row.h - (C.head + row.lines.length * C.lineH + C.pad)) / 2;
  const dim = row.counted ? undefined : 0.6;
  return (
    <g data-criterion={row.code}>
      <Txt x={LEFT} y={+(top + 15).toFixed(2)} font="display-700" size={17} ls={0.4} fill={ink} opacity={row.score === null ? 0.75 : undefined}>
        {name}
      </Txt>
      {tag && (
        <Txt x={+(LEFT + nameW + 9).toFixed(2)} y={+(top + 13.5).toFixed(2)} font="sans-600" size={7.5} ls={0.9} fill={inkSoft} opacity={0.7}>
          {tag}
        </Txt>
      )}
      {row.score === null ? (
        <Txt x={RIGHT} y={+(top + 16).toFixed(2)} font="display-700" size={22} anchor="end" fill={inkSoft} opacity={0.45}>
          –
        </Txt>
      ) : (
        <>
          <Txt x={+(RIGHT - measure("/10", "sans-600", 9) - 2).toFixed(2)} y={+(top + 16).toFixed(2)} font="display-700" size={22} anchor="end" fill={ink} opacity={dim}>
            {row.score}
          </Txt>
          <Txt x={RIGHT} y={+(top + 16).toFixed(2)} font="sans-600" size={9} anchor="end" fill={inkSoft} opacity={0.7}>
            /10
          </Txt>
        </>
      )}
      {row.lines.map((line, i) => (
        <Txt key={i} x={LEFT} y={+(top + C.head + 10 + i * C.lineH).toFixed(2)} font="sans-500" size={C.size} fill={inkSoft} opacity={0.92}>
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

function AxisRow({ stat, code, y, lang, ink, inkSoft, last }: { stat?: Stat; code: StatCode; y: number; lang: Lang; ink: string; inkSoft: string; last: boolean }) {
  const s = t(lang);
  const R = BACK_LAYOUT.fact;
  const weak = stat ? !stat.sufficient : true;
  const value = stat ? String(stat.value) : "—";
  const name = upper(s.back.axes[code], lang) + (code === "BUZZ" ? ` · ${upper(s.buzzNote, lang)}` : weak ? ` · ${upper(s.insufficient, lang)}` : "");
  const valueW = measure(value, "display-700", 24);
  const nameMax = FW - 46 - valueW - 8;
  const fact = strongestFact(stat, lang) ?? s.back.noFact;
  const lines = wrap(fact, "sans-500", R.size, FW, R.lines);
  return (
    <g>
      <Txt x={LEFT} y={y + 17} font="display-700" size={19} ls={0.3} fill={ink}>
        {code}
      </Txt>
      <Txt x={LEFT + 46} y={y + 15.5} font="sans-600" size={8} ls={0.9} fill={inkSoft} opacity={0.7}>
        {wrap(name, "sans-600", 8, nameMax, 1, 0.9)[0]}
      </Txt>
      <Txt x={RIGHT} y={y + 18} font="display-700" size={24} anchor="end" fill={code === "BUZZ" ? PALETTE.blush : ink} opacity={weak && code !== "BUZZ" ? 0.6 : undefined}>
        {value}
      </Txt>
      {lines.map((line, i) => (
        <Txt key={i} x={LEFT} y={y + 34 + i * R.lineH} font="sans-500" size={R.size} fill={inkSoft}>
          {line}
        </Txt>
      ))}
      {!last && <rect x={LEFT} y={y + BACK_LAYOUT.rows.h - 3} width={FW} height={1} fill="#fff" fillOpacity={0.1} />}
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

  // Dossier scellé (shared/publicView.ts) : ni étoiles, ni formule, ni note ; deux mots mats à la place.
  const sealed = !!card.sealed;
  const resultW = resultWidth(card.overall);
  const grid = sealed ? null : gridFormula(card, lang);
  const criteria = grid ? placeCriteria(backCriteria(card, lang)) : [];
  // Fiche d'avant la grille : la formule des cinq axes, seulement si elle donne bien la note affichée.
  const legacy = !grid && axesOverall(card) === card.overall;
  // Une phrase seule (dossier vide) se coupe au mot ; des termes se rangent sans jamais en couper un.
  const formula = grid && !grid.tail ? { lines: wrap(grid.terms.join(" "), "sans-500", F.size, FW - resultW, F.maxLines), size: F.size } : grid ? packTerms(grid.terms, F.size, FW - resultW, grid.tail) : legacy ? packTerms(formulaTerms(card, lang), F.size, FW - resultW) : { lines: wrap(s.back.fromGrid, "sans-500", F.size, FW - resultW, F.maxLines), size: F.size };
  const handle = card.login ? `@${upper(card.login, lang)}` : upper(card.name, lang);
  const caseNo = caseLabel(card.id, lang);
  const head = `${truncate(handle, "mono-500", 9, 230 - measure(` · ${caseNo}`, "mono-500", 9, 0.7), 0.7)} · ${caseNo}`;
  const scaleW = measure("/100", "sans-600", F.scale);
  const resultY = F.y + F.resultLine * F.lineH + 2;

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

        {/* Haut : la marque à gauche ; à droite, à qui est le dossier et son numéro, comme au recto */}
        <AzeritGem x={LEFT} y={18} h={13} />
        <Txt x={LEFT + 17} y={29.5} font="sans-600" size={10} ls={2.2} fill={th.inkSoft} opacity={0.85}>
          AZERIT
        </Txt>
        <Txt x={RIGHT} y={29.5} font="mono-500" size={9} ls={0.7} anchor="end" fill={th.inkSoft} opacity={0.75}>
          {head}
        </Txt>

        <Txt x={LEFT - 1} y={BACK_LAYOUT.title.y} font="display-700" size={BACK_LAYOUT.title.size} ls={0.4} fill={th.ink}>
          {upper(s.back.title, lang)}
        </Txt>
        {!sealed && <Stars n={n} x={RIGHT - 6 * B.size - 5 * B.gap} y={BACK_LAYOUT.title.y - B.size - 3} size={B.size} gap={B.gap} />}

        {grid ? (
          // Les huit critères de la grille, chacun avec sa note et sa pièce : c'est d'eux que vient la note
          criteria.map((row, i) => <CriterionRow key={row.code} row={row} lang={lang} ink={th.ink} inkSoft={th.inkSoft} last={i === criteria.length - 1} />)
        ) : (
          STAT_CODES.map((code, i) => (
            <AxisRow
              key={code}
              code={code}
              stat={card.stats.find((st) => st.code === code)}
              y={BACK_LAYOUT.rows.y + i * BACK_LAYOUT.rows.h}
              lang={lang}
              ink={th.ink}
              inkSoft={th.inkSoft}
              last={i === STAT_CODES.length - 1}
            />
          ))
        )}

        {/* La formule : les critères notés du barème et leurs coefficients (avant 0.4.0 : les cinq axes et leurs poids), et la note */}
        <rect x={LEFT} y={F.rule} width={FW} height={1} fill="#fff" fillOpacity={0.22} />
        {sealed ? (
          <g data-sealed-mark="">
            <Txt x={LEFT} y={F.labelY} font="sans-600" size={7.5} ls={1.1} fill={th.inkSoft} opacity={0.62}>
              {upper(s.sealed, lang)}
            </Txt>
            <Txt x={LEFT} y={F.y} font="sans-500" size={F.size} fill={th.inkSoft}>
              {s.sealedSub}
            </Txt>
          </g>
        ) : (
          <>
            <Txt x={LEFT} y={F.labelY} font="sans-600" size={7.5} ls={1.1} fill={th.inkSoft} opacity={0.62}>
              {upper(grid ? s.back.gridRating : s.back.rating, lang)}
            </Txt>
            {formula.lines.map((line, i) => (
              <Txt key={i} x={LEFT} y={F.y + i * F.lineH} font="sans-500" size={formula.size} fill={th.inkSoft}>
                {line}
              </Txt>
            ))}
            <Txt x={+(RIGHT - scaleW - 2).toFixed(2)} y={resultY} font="display-800" size={F.result} anchor="end" ls={-1} fill={th.ink}>
              {`= ${card.overall}`}
            </Txt>
            <Txt x={RIGHT} y={resultY} font="sans-600" size={F.scale} anchor="end" fill={th.inkSoft} opacity={0.8}>
              /100
            </Txt>
          </>
        )}

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
