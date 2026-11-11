// Le dos de la fiche (SPEC §18.27) : « La fiche se retourne ». Même silhouette
// 360 × 520, même style mat, mêmes polices et même mesure de texte que la face,
// pour pouvoir un jour le rendre en PNG (renderToStaticMarkup → resvg).
// De haut en bas : la marque et les étoiles, le titre, chaque axe (TEC, SHIP,
// ARCH, DOC, XP, BUZZ) avec sa valeur et son fait le plus fort (le premier de
// `stat.facts`, celui que le barème pose en tête), puis la formule de la note :
// celle du barème de recrutement quand la fiche a sa grille (§18.37, « Code 7 × 2
// + Stack 6 × 1,5 + … »), celle des six barres pour les fiches d'avant.
import { useId } from "react";
import { dec, gridMath, usableGrid } from "../gridText";
import type { CardData, Lang, Stat, StatCode } from "../types";
import { STAT_CODES, starsFor } from "../types";
import { AzeritGem } from "./AzeritGem";
import { Stars, Txt, caseNumber, sanitize, type CardGraphicProps } from "./Card";
import { CARD_H, CARD_R, CARD_W } from "./geometry";
import { t } from "./i18n";
import { measure, upper, wrap } from "./text";
import { PALETTE, themeOf } from "./themes";

const LEFT = 20;
const RIGHT = CARD_W - 18;
const FW = RIGHT - LEFT;

/** Poids de la note globale : ceux de data/scoring.json (un test vérifie qu'ils n'ont pas dérivé). */
export const OVERALL_WEIGHTS: Record<Exclude<StatCode, "BUZZ">, number> = { TEC: 0.3, SHIP: 0.2, ARCH: 0.2, DOC: 0.15, XP: 0.15 };

/** Cotes du dos, unités du viewBox. */
export const BACK_LAYOUT = {
  title: { y: 72, size: 26 },
  rows: { y: 85, h: 56 },
  fact: { size: 12, lineH: 14.5, lines: 2 },
  /** La note (« = 76 ») se pose à hauteur de la 2e ligne : le coin bas droit reste au bouton qui retourne. */
  formula: { labelY: 442, y: 458, size: 10.5, lineH: 13.5, maxLines: 3, result: 36, resultLine: 1 },
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

  // Dossier scellé (shared/publicView.ts) : ni étoiles, ni formule, ni note ; deux mots mats à la place.
  const sealed = !!card.sealed;
  const resultW = measure(`= ${card.overall}`, "display-800", F.result, -1) + 12;
  const grid = gridFormula(card, lang);
  const formula = grid ? packTerms(grid.terms, F.size, FW - resultW, grid.tail) : packTerms(formulaTerms(card, lang), F.size, FW - resultW);
  const handle = card.login ? `@${upper(card.login, lang)}` : upper(card.name, lang);
  const sub = wrap(`${handle} · ${s.caseNo} ${caseNumber(card.id)}`, "mono-400", 8, FW, 1, 0.6)[0];

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
      aria-label={`${s.back.title} — ${card.name}`}
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

        <AzeritGem x={LEFT} y={18} h={13} />
        <Txt x={LEFT + 17} y={29.5} font="sans-600" size={10} ls={2.2} fill={th.inkSoft} opacity={0.85}>
          AZERIT
        </Txt>
        {!sealed && <Stars n={n} onSky={false} />}

        <Txt x={LEFT} y={BACK_LAYOUT.title.y - 27} font="mono-400" size={8} ls={0.6} fill={th.inkSoft} opacity={0.6}>
          {sub}
        </Txt>
        <Txt x={LEFT - 1} y={BACK_LAYOUT.title.y + 8} font="display-700" size={BACK_LAYOUT.title.size} ls={0.4} fill={th.ink}>
          {upper(s.back.title, lang)}
        </Txt>

        {STAT_CODES.map((code, i) => (
          <AxisRow
            key={code}
            code={code}
            stat={card.stats.find((st) => st.code === code)}
            y={BACK_LAYOUT.rows.y + 2 + i * BACK_LAYOUT.rows.h}
            lang={lang}
            ink={th.ink}
            inkSoft={th.inkSoft}
            last={i === STAT_CODES.length - 1}
          />
        ))}

        {/* La formule : les critères notés du barème et leurs coefficients (avant 0.4.0 : les cinq axes et leurs poids), et la note */}
        <rect x={LEFT} y={F.labelY - 16} width={FW} height={1} fill="#fff" fillOpacity={0.22} />
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
            <Txt x={RIGHT} y={F.y + F.resultLine * F.lineH + 2} font="display-800" size={F.result} anchor="end" ls={-1} fill={th.ink}>
              {`= ${card.overall}`}
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
