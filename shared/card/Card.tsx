// La fiche de dev (SPEC §17.3) : un seul composant SVG React pur, rendu à
// l'identique dans le navigateur et côté serveur (renderToStaticMarkup → resvg).
// Uniquement des fonctionnalités SVG que resvg sait rendre : dégradés, clipPath,
// filtres (turbulence, matrice de couleur, flou, transfert de composantes,
// convolution), texte, image. Mise en page calquée sur la maquette web/gta.html.
import { useId, type ReactNode } from "react";
import type { CardData, Lang, Stat, StatusInstance } from "../types";
import { LEVEL_LABELS, starsFor } from "../types";
import { AzeritGem, AzeritGemDefs } from "./AzeritGem";
import { fontAttrs, type FontKey } from "./fonts";
import { CARD_H, CARD_W, cardPath } from "./geometry";
import { t } from "./i18n";
import { langIcon } from "./languages";
import { fit, measure, truncate, upper } from "./text";
import { PALETTE, themeOf, type CardTheme, type Stop } from "./themes";

export interface CardProps {
  card: CardData;
  lang?: Lang;
  /** Remplace card.avatarUrl (le serveur passe un data URI ; "" force les initiales). */
  avatarHref?: string;
  /** Préfixe des ids de defs, pour afficher plusieurs cartes sur une page. */
  idPrefix?: string;
  className?: string;
}

export interface CardGraphicProps extends CardProps {
  /** Placement quand la carte est imbriquée dans une composition SVG. */
  x?: number;
  y?: number;
  width?: number | string;
  height?: number | string;
}

/* ------------------------------------------------------------------ */
/* Mise en page (unités du viewBox 360 × 520, marges 20 / 18)          */
/* ------------------------------------------------------------------ */

const L = {
  left: 20,
  right: CARD_W - 18,
  stars: { x: 20, y: 18, size: 16, gap: 3 },
  overall: { x: 18, y: 130, size: 118 },
  levelY: 156,
  metaLabelY: 176,
  metaValueY: 192,
  mug: { x: 178, y: 44, w: 164, h: 206, r: 6 },
  photo: { w: 140, h: 168 },
  placard: { w: 136, h: 44, bottom: 10 },
  formTop: 262,
  formLabelY: 277,
  formValueY: 293,
  statsTop: 306,
  statRow: 25,
  chargesTitleY: 411,
  chargesFirstY: 432,
  chargeRow: 20,
  footerY: 506,
};

type Layout = typeof L & { profileY?: number; taglineY?: number };

/** Avec un profil criminel (§18.2) : la photo raccourcit de 14, le profil se
 *  loge dessous sur toute la largeur, et les blocs du bas se resserrent. */
const LP: Layout = {
  ...L,
  mug: { ...L.mug, h: 192 },
  profileY: 266,
  taglineY: 282,
  formTop: 294,
  formLabelY: 309,
  formValueY: 325,
  statsTop: 338,
  statRow: 23,
  chargesTitleY: 421,
  chargesFirstY: 440,
  chargeRow: 19,
};

const STAR = "M12 2.6l2.9 6.1 6.7.8-4.9 4.6 1.3 6.6L12 17.4l-6 3.3 1.3-6.6L2.4 9.5l6.7-.8z";
const PALM = [
  "M46 140c2-34 5-62 12-86l4 1c-8 24-11 52-12 85z",
  "M60 54C40 38 20 38 4 50c18-4 36 0 56 7z",
  "M60 54C36 56 18 68 10 88c14-14 30-22 50-30z",
  "M60 54c18-22 40-28 60-20-20 0-40 8-60 24z",
  "M60 54c26-2 44 10 54 30-14-14-32-22-54-26z",
  "M60 54c-6-22-2-40 8-52-2 16 0 32-4 50z",
  "M60 54c10-20 26-32 44-34-16 8-30 20-42 36z",
  "M60 54c-14-14-18-30-14-48 4 16 10 30 16 46z",
];

/* ------------------------------------------------------------------ */

function stops(s: Stop[]) {
  return s.map(([o, c, a], i) => <stop key={i} offset={o} stopColor={c} stopOpacity={a ?? 1} />);
}

function sanitize(id: string) {
  return id.replace(/[^a-zA-Z0-9_-]/g, "");
}

/** Numéro de dossier : l'id court de la carte, en majuscules, 4 à 6 signes. */
function caseNumber(id: string): string {
  const clean = id.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return (clean || "0000").slice(0, 6);
}

function caseDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${String(d.getUTCFullYear()).slice(2)}`;
}

interface TxtProps {
  x: number;
  y: number;
  font: FontKey;
  size: number;
  fill: string;
  ls?: number;
  anchor?: "start" | "middle" | "end";
  opacity?: number;
  children: ReactNode;
}

function Txt({ x, y, font, size, fill, ls = 0, anchor = "start", opacity, children }: TxtProps) {
  return (
    <text x={x} y={y} {...fontAttrs(font)} fontSize={size} letterSpacing={ls || undefined} textAnchor={anchor} fill={fill} opacity={opacity}>
      {children}
    </text>
  );
}

/* ------------------------------------------------------------------ */
/* Blocs                                                                */
/* ------------------------------------------------------------------ */

function Stars({ n, th, id }: { n: number; th: CardTheme; id: string }) {
  const { x, y, size, gap } = L.stars;
  const k = size / 24;
  return (
    <g>
      {[1, 2, 3, 4, 5, 6].map((i) => {
        const tx = x + (i - 1) * (size + gap);
        const on = i > 6 - n;
        return (
          <g key={i} transform={`translate(${tx} ${y}) scale(${k})`}>
            {on && <path d={STAR} fill={th.accent} opacity={0.9} filter={`url(#${id}-starglow)`} />}
            {on ? (
              <path d={STAR} fill={PALETTE.star} />
            ) : (
              <path d={STAR} fill="none" stroke="#fff" strokeOpacity={0.22} strokeWidth={1.4 / k} />
            )}
          </g>
        );
      })}
    </g>
  );
}

function StatRow({ stat, x, y, th, idp }: { stat: Stat; x: number; y: number; th: CardTheme; idp: string }) {
  const isBuzz = stat.code === "BUZZ";
  const weak = !stat.sufficient;
  const col = 153;
  const barX = x + 34 + 8;
  const barW = col - 34 - 26 - 16;
  const barY = y + 5;
  const fill = isBuzz ? th.buzz : th.accent;
  const v = Math.max(0, Math.min(99, stat.value));
  const w = (barW * v) / 100;
  return (
    <g>
      <Txt x={x} y={y + 13} font="mono-700" size={10.5} ls={0.4} fill={th.inkSoft}>
        {stat.code}
      </Txt>
      <rect x={barX} y={barY} width={barW} height={8} rx={2} fill="#fff" fillOpacity={0.08} />
      {w > 0 && (
        <g opacity={weak ? 0.45 : 1}>
          <rect x={barX} y={barY} width={w} height={8} rx={2} fill={fill} opacity={0.55} filter={`url(#${idp}-barglow)`} />
          <rect x={barX} y={barY} width={w} height={8} rx={2} fill={fill} />
        </g>
      )}
      {/* dix segments : neuf séparateurs à la couleur de la nuit */}
      {Array.from({ length: 9 }, (_, i) => (
        <rect key={i} x={barX + ((i + 1) * barW) / 10 - 1} y={barY - 0.5} width={2} height={9} fill={PALETTE.night} />
      ))}
      <Txt x={x + col} y={y + 15} font="display-700" size={18} anchor="end" fill={isBuzz ? th.buzz : th.ink} opacity={weak ? 0.55 : 1}>
        {stat.value}
      </Txt>
      {weak && (
        <text x={x + col - 28} y={y + 14} {...fontAttrs("mono-700")} fontSize={9} textAnchor="end" fill={th.inkMuted}>
          ?
        </text>
      )}
    </g>
  );
}

function Charges({ statuses, th, lang, idp, ly }: { statuses: StatusInstance[]; th: CardTheme; lang: Lang; idp: string; ly: Layout }) {
  const s = t(lang);
  const list = statuses.slice(0, 3);
  const textX = L.left + 14;
  const maxW = L.right - textX;
  return (
    <g>
      <Txt x={L.left} y={ly.chargesTitleY} font="mono-700" size={8.5} ls={1.5} fill={th.inkMuted}>
        {upper(s.charges, lang)}
      </Txt>
      {list.map((st, i) => {
        const y = ly.chargesFirstY + i * ly.chargeRow;
        const tone = th.tones[st.tone];
        const aiTag = st.byAI ? ` · ${s.ai}` : "";
        const aiW = st.byAI ? measure(aiTag, "mono-400", 9) : 0;
        const label = truncate(st.label[lang] ?? st.label.fr, "sans-500", 12.5, maxW - aiW);
        const lw = measure(label, "sans-500", 12.5);
        return (
          <g key={st.id + i}>
            <circle cx={L.left + 3} cy={y - 4.2} r={4.5} fill={tone} opacity={0.6} filter={`url(#${idp}-dotglow)`} />
            <circle cx={L.left + 3} cy={y - 4.2} r={3} fill={tone} />
            <Txt x={textX} y={y} font="sans-500" size={12.5} fill={th.ink}>
              {label}
            </Txt>
            {st.byAI && (
              <Txt x={textX + lw / 1.03 + 3} y={y} font="mono-400" size={9} fill={th.inkMuted}>
                {aiTag}
              </Txt>
            )}
          </g>
        );
      })}
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* Fiche                                                                */
/* ------------------------------------------------------------------ */

export function CardGraphic({ card, lang: langProp, avatarHref, idPrefix, className, x, y, width, height }: CardGraphicProps) {
  const rid = sanitize(useId());
  const idp = sanitize(idPrefix ?? `tys${rid}`);
  const lang: Lang = langProp ?? card.lang ?? "fr";
  const s = t(lang);
  const th = themeOf(card);
  const stars = starsFor(card.overall);
  const levelLabel = LEVEL_LABELS[stars][lang];
  const avatar = avatarHref !== undefined ? avatarHref || undefined : card.avatarUrl;
  const u = (k: string) => `url(#${idp}-${k})`;
  const ly: Layout = card.profile ? LP : L;
  const M = ly.mug;

  // Textes ajustés
  const level = fit(upper(levelLabel, lang), { font: "mono-700", size: 12, minSize: 9, maxWidth: M.x - L.left - 6, letterSpacing: 1.9, minLetterSpacing: 0.6 });
  const placardName = fit(upper(card.login ?? card.name, lang), { font: "display-700", size: 20, minSize: 12, maxWidth: L.placard.w - 16, letterSpacing: 1.6, minLetterSpacing: 0.3 });
  const caseLine = `${s.caseNo} ${caseNumber(card.id)} · ${caseDate(card.createdAt)}`;
  const caseFit = fit(caseLine, { font: "mono-400", size: 8.5, minSize: 7, maxWidth: L.placard.w - 12, letterSpacing: 0.85, minLetterSpacing: 0.2 });
  const overallSize = card.overall >= 100 ? 92 : L.overall.size;
  const icon = langIcon(card.mainLanguage);
  const langName = card.mainLanguage ? prettyLanguage(card.mainLanguage, icon?.title) : "—";

  // Ligne spécialité / arme / affiliation
  const formW = L.right - L.left;
  const unit = (formW - 20) / 3.3;
  const cols = [
    { x: L.left, w: unit, label: s.specialty, value: s.positions[card.position] ?? card.position },
    { x: L.left + unit + 10, w: unit, label: s.weapon, value: langName },
    { x: L.left + 2 * unit + 20, w: unit * 1.3, label: s.affiliation, value: card.club ?? s.loneWolf },
  ];

  // Profil criminel (§18.2) : le nom en grand, lisible à l'échelle 1 d'un
  // téléphone (15 unités au moins) ; l'accroche seulement si elle tient entière.
  const profileName = card.profile
    ? fit(upper(card.profile.label[lang] ?? card.profile.label.fr, lang), { font: "display-800", size: 26, minSize: 15, maxWidth: formW, letterSpacing: 0.8, minLetterSpacing: 0.2 })
    : null;
  const taglineText = card.profile ? (card.profile.tagline[lang] ?? card.profile.tagline.fr) : "";
  const taglineFit = taglineText ? fit(taglineText, { font: "sans-500", size: 10.5, minSize: 9, maxWidth: formW }) : null;
  const tagline = taglineFit && taglineFit.text === taglineText ? taglineFit : null;

  // Pied
  const questioned = s.questioned(card.judgedInSeconds);
  const footer = `${questioned} · ${s.evidence} ${s.percent(card.reliability)}`;
  const footerFit = fit(footer, { font: "mono-400", size: 9.5, minSize: 7.5, maxWidth: formW, letterSpacing: 0.3, minLetterSpacing: 0 });

  const badge = th.badge ? fit(upper(th.label[lang], lang), { font: "mono-700", size: 8.5, minSize: 7, maxWidth: 150, letterSpacing: 1.4, minLetterSpacing: 0.5 }) : null;
  const badgeW = badge ? badge.width + 16 : 0;

  const left = card.stats.slice(0, 3);
  const right = card.stats.slice(3, 6);

  const ariaLabel = `${s.card} ${levelLabel} ${card.overall} — ${card.name}`;
  const photoX = M.x + (M.w - L.photo.w) / 2;
  const photoY = M.y + M.h - L.photo.h;
  const plX = M.x + (M.w - L.placard.w) / 2;
  const plY = M.y + M.h - L.placard.bottom - L.placard.h;
  const grainOpacity = 0.07;

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
      aria-label={ariaLabel}
      style={width === undefined ? { display: "block", width: "100%", height: "auto" } : undefined}
    >
      <defs>
        <linearGradient id={`${idp}-body`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0d0d26" />
          <stop offset="0.55" stopColor={PALETTE.night} />
          <stop offset="1" stopColor="#08081a" />
        </linearGradient>
        <linearGradient id={`${idp}-num`} x1="0" y1="0" x2="1" y2="1">
          {stops(th.num)}
        </linearGradient>
        <radialGradient id={`${idp}-haze1`} cx={65} cy={42} r={240} gradientUnits="userSpaceOnUse" gradientTransform={`translate(65 42) scale(1 0.85) translate(-65 -42)`}>
          <stop offset="0" stopColor={th.accent} stopOpacity={0.55} />
          <stop offset="0.7" stopColor={th.accent} stopOpacity={0} />
        </radialGradient>
        <radialGradient id={`${idp}-haze2`} cx={317} cy={62} r={240} gradientUnits="userSpaceOnUse" gradientTransform={`translate(317 62) scale(1 0.77) translate(-317 -62)`}>
          <stop offset="0" stopColor={th.accent2} stopOpacity={0.4} />
          <stop offset="0.7" stopColor={th.accent2} stopOpacity={0} />
        </radialGradient>
        {th.holoBand && (
          <>
            <radialGradient id={`${idp}-haze3`} cx={180} cy={520} r={300} gradientUnits="userSpaceOnUse" gradientTransform="translate(180 520) scale(1 0.53) translate(-180 -520)">
              <stop offset="0" stopColor={PALETTE.orange} stopOpacity={0.25} />
              <stop offset="0.7" stopColor={PALETTE.orange} stopOpacity={0} />
            </radialGradient>
            <linearGradient id={`${idp}-holoband`} x1="0" y1="0" x2="1" y2="0.45">
              <stop offset="0.3" stopColor={PALETTE.yellow} stopOpacity={0} />
              <stop offset="0.42" stopColor={PALETTE.yellow} stopOpacity={0.14} />
              <stop offset="0.5" stopColor={PALETTE.pink} stopOpacity={0.18} />
              <stop offset="0.58" stopColor={PALETTE.cyan} stopOpacity={0.16} />
              <stop offset="0.7" stopColor={PALETTE.cyan} stopOpacity={0} />
            </linearGradient>
          </>
        )}
        <linearGradient id={`${idp}-wall`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c3ccd6" />
          <stop offset="0.7" stopColor="#a6b1be" />
          <stop offset="1" stopColor="#8f9aa8" />
        </linearGradient>
        <AzeritGemDefs id={idp} />

        <clipPath id={`${idp}-outer`}>
          <path d={cardPath(0)} />
        </clipPath>
        <clipPath id={`${idp}-mug`}>
          <rect x={M.x} y={M.y} width={M.w} height={M.h} rx={M.r} />
        </clipPath>

        {/* grain : bruit blanc très léger sur toute la fiche */}
        <filter id={`${idp}-grain`} x="0" y="0" width={CARD_W} height={CARD_H} filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={5} stitchTiles="stitch" result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.5 0" />
        </filter>
        <filter id={`${idp}-starglow`} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="2.6" />
        </filter>
        <filter id={`${idp}-levelglow`} x="-10%" y="-60%" width="120%" height="220%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
        <filter id={`${idp}-barglow`} x="-10%" y="-100%" width="120%" height="300%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
        <filter id={`${idp}-dotglow`} x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="2" />
        </filter>
        <filter id={`${idp}-numshadow`} x="-5%" y="-5%" width="110%" height="115%">
          <feOffset dy="2" />
        </filter>
        {/* Portrait « illustration » : aplats (posterisation), saturation, et un
            trait d'encre sur les contours (laplacien de la luminance). */}
        <filter id={`${idp}-ink`} x="0" y="0" width="1" height="1" colorInterpolationFilters="sRGB">
          <feColorMatrix in="SourceGraphic" type="saturate" values="1.3" result="sat" />
          <feComponentTransfer in="sat" result="post">
            <feFuncR type="discrete" tableValues="0 0.14 0.28 0.42 0.56 0.7 0.84 1" />
            <feFuncG type="discrete" tableValues="0 0.14 0.28 0.42 0.56 0.7 0.84 1" />
            <feFuncB type="discrete" tableValues="0 0.14 0.28 0.42 0.56 0.7 0.84 1" />
          </feComponentTransfer>
          <feColorMatrix in="SourceGraphic" type="matrix" values="0.3 0.59 0.11 0 0  0.3 0.59 0.11 0 0  0.3 0.59 0.11 0 0  0 0 0 1 0" result="gray" />
          <feGaussianBlur in="gray" stdDeviation="1" result="g" />
          <feConvolveMatrix in="g" order="3" kernelMatrix="-1 -1 -1 -1 8 -1 -1 -1 -1" divisor="1" bias="0" preserveAlpha="true" edgeMode="duplicate" result="edge" />
          <feColorMatrix in="edge" type="matrix" values="0 0 0 0 0.03  0 0 0 0 0.02  0 0 0 0 0.06  2.5 2.5 2.5 0 -0.3" result="inkA" />
          <feComposite in="inkA" in2="post" operator="over" />
        </filter>
        {card.source === "cv" && (
          <>
            <filter id={`${idp}-stampnoise`} x="0" y="0" width="1" height="1">
              <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves={2} seed={2} result="n" />
              <feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  7 0 0 0 -2.55" />
            </filter>
            <mask id={`${idp}-stampmask`} maskUnits="userSpaceOnUse" x="-90" y="-40" width="180" height="80">
              <rect x="-90" y="-40" width="180" height="80" fill="#fff" filter={u("stampnoise")} />
            </mask>
          </>
        )}
      </defs>

      {/* Corps de nuit, halos néon, palmier, grain */}
      <g clipPath={u("outer")}>
        <rect width={CARD_W} height={CARD_H} fill={u("body")} />
        <rect width={CARD_W} height={CARD_H} fill={u("haze1")} opacity={th.haze} />
        <rect width={CARD_W} height={CARD_H} fill={u("haze2")} opacity={th.haze} />
        {th.holoBand && <rect width={CARD_W} height={CARD_H} fill={u("haze3")} />}
        {th.palms > 0 && (
          <g transform="translate(232 316) scale(1.5)" fill="#05050f" opacity={th.palms}>
            {PALM.map((d, i) => (
              <path key={i} d={d} />
            ))}
          </g>
        )}
        <rect width={CARD_W} height={CARD_H} filter={u("grain")} opacity={grainOpacity} />
      </g>

      {/* Étoiles de recherche */}
      <Stars n={stars} th={th} id={idp} />

      {/* Marque Azerit, en haut à droite */}
      <g>
        <Txt x={L.right} y={L.stars.y + 11.5} font="sans-700" size={10.5} ls={2.3} anchor="end" fill={th.inkSoft}>
          AZERIT
        </Txt>
        <AzeritGem id={idp} x={L.right - measure("AZERIT", "sans-700", 10.5, 2.3) - 15} y={L.stars.y + 0.5} h={13} />
      </g>

      {/* La note, dans le dégradé du niveau */}
      <text x={L.overall.x} y={L.overall.y} {...fontAttrs("display-800")} fontSize={overallSize} letterSpacing={-2.4} fill="#000" fillOpacity={0.5} filter={u("numshadow")}>
        {card.overall}
      </text>
      <text x={L.overall.x} y={L.overall.y} {...fontAttrs("display-800")} fontSize={overallSize} letterSpacing={-2.4} fill={u("num")}>
        {card.overall}
      </text>

      {/* Niveau, en mono néon : une copie floue dessous, le texte net dessus */}
      <text x={L.left} y={L.levelY} {...fontAttrs("mono-700")} fontSize={level.size} letterSpacing={level.letterSpacing} fill={th.accent} filter={u("levelglow")} opacity={0.6}>
        {level.text}
      </text>
      <Txt x={L.left} y={L.levelY} font="mono-700" size={level.size} ls={level.letterSpacing} fill={th.accent}>
        {level.text}
      </Txt>

      {/* Dossier : GitHub ou CV */}
      <Txt x={L.left} y={L.metaLabelY} font="mono-400" size={10} ls={0.6} fill={th.inkMuted}>
        {s.file}
      </Txt>
      <Txt x={L.left} y={L.metaValueY} font="sans-500" size={12} fill={th.ink}>
        {card.source === "cv" ? s.sourceCv : s.sourceGithub}
      </Txt>

      {/* Photo d'identité judiciaire */}
      <g>
        <rect x={M.x} y={M.y + 10} width={M.w} height={M.h} rx={M.r} fill="#000" opacity={0.5} filter={u("levelglow")} />
        <g clipPath={u("mug")}>
          <rect x={M.x} y={M.y} width={M.w} height={M.h} fill={u("wall")} />
          {Array.from({ length: 8 }, (_, i) => (
            <rect key={i} x={M.x} y={M.y + 25 + i * 26.5} width={M.w} height={1.5} fill="#141c28" opacity={0.42} />
          ))}
          {["190", "180", "170", "160"].map((tck, i) => (
            <text key={tck} x={M.x + 6} y={M.y + 21 + i * 53} {...fontAttrs("mono-700")} fontSize={8} letterSpacing={0.4} fill="#141c28" fillOpacity={0.7}>
              {tck}
            </text>
          ))}
          {avatar ? (
            <image href={avatar} x={photoX} y={photoY} width={L.photo.w} height={L.photo.h} preserveAspectRatio="xMidYMin slice" filter={u("ink")} />
          ) : (
            <Initials initials={card.initials} M={M} />
          )}
          {card.source === "cv" && (
            <g transform={`translate(${M.x + M.w / 2} ${M.y + 40}) rotate(-9)`}>
              <g mask={u("stampmask")} opacity={0.88}>
                <rect x={-64} y={-16} width={128} height={32} rx={3} fill="none" stroke="#a3261b" strokeWidth={2.2} />
                <rect x={-60} y={-12} width={120} height={24} rx={1.5} fill="none" stroke="#a3261b" strokeWidth={0.8} />
                <text x={0} y={5.4} {...fontAttrs("display-800")} fontSize={15.5} letterSpacing={1.4} textAnchor="middle" fill="#a3261b">
                  {fit(s.cvStamp, { font: "display-800", size: 15.5, minSize: 11, maxWidth: 108, letterSpacing: 1.4, minLetterSpacing: 0.4 }).text}
                </text>
              </g>
            </g>
          )}
          {/* Écriteau */}
          <g transform={`rotate(-1.2 ${plX + L.placard.w / 2} ${plY + L.placard.h / 2})`}>
            <rect x={plX} y={plY + 4} width={L.placard.w} height={L.placard.h} rx={3} fill="#000" opacity={0.45} filter={u("dotglow")} />
            <rect x={plX} y={plY} width={L.placard.w} height={L.placard.h} rx={3} fill="#111111" />
            <rect x={plX + 0.5} y={plY + 0.5} width={L.placard.w - 1} height={L.placard.h - 1} rx={2.5} fill="none" stroke="#fff" strokeOpacity={0.08} />
            <text x={plX + L.placard.w / 2 + placardName.letterSpacing / 2} y={plY + 22} {...fontAttrs("display-700")} fontSize={placardName.size} letterSpacing={placardName.letterSpacing} textAnchor="middle" fill="#f4f1ea">
              {placardName.text}
            </text>
            <text x={plX + L.placard.w / 2 + caseFit.letterSpacing / 2} y={plY + 35} {...fontAttrs("mono-400")} fontSize={caseFit.size} letterSpacing={caseFit.letterSpacing} textAnchor="middle" fill="#bdb8ad">
              {caseFit.text}
            </text>
          </g>
        </g>
        <rect x={M.x + 0.5} y={M.y + 0.5} width={M.w - 1} height={M.h - 1} rx={M.r} fill="none" stroke="#fff" strokeOpacity={0.12} />
      </g>

      {/* Badge de spéciale, posé sur le haut de la photo */}
      {badge && th.badge && (
        <g transform={`translate(${L.right - badgeW} 36) rotate(-2 ${badgeW} 0)`}>
          <rect width={badgeW} height={16} rx={3} fill={th.badge.bg} />
          <rect width={badgeW} height={16} rx={3} fill={th.badge.bg} opacity={0.5} filter={u("starglow")} />
          <text x={badgeW / 2 + badge.letterSpacing / 2} y={11.2} {...fontAttrs("mono-700")} fontSize={badge.size} letterSpacing={badge.letterSpacing} textAnchor="middle" fill={th.badge.ink}>
            {badge.text}
          </text>
        </g>
      )}

      {/* Profil criminel, sous la photo et son écriteau */}
      {profileName && ly.profileY !== undefined && (
        <g>
          <text x={L.left} y={ly.profileY} {...fontAttrs("display-800")} fontSize={profileName.size} letterSpacing={profileName.letterSpacing} fill="#000" fillOpacity={0.5} filter={u("numshadow")}>
            {profileName.text}
          </text>
          <text x={L.left} y={ly.profileY} {...fontAttrs("display-800")} fontSize={profileName.size} letterSpacing={profileName.letterSpacing} fill={u("num")}>
            {profileName.text}
          </text>
          {tagline && ly.taglineY !== undefined && (
            <Txt x={L.left} y={ly.taglineY} font="sans-500" size={tagline.size} fill={th.inkSoft}>
              {tagline.text}
            </Txt>
          )}
        </g>
      )}

      {/* Spécialité / arme / affiliation */}
      <rect x={L.left} y={ly.formTop} width={formW} height={1} fill="#fff" fillOpacity={0.1} />
      {cols.map((c, i) => {
        const v = fit(c.value, { font: "sans-600", size: 12.5, minSize: 10, maxWidth: c.w, letterSpacing: 0, minLetterSpacing: 0 });
        return (
          <g key={i}>
            <Txt x={c.x} y={ly.formLabelY} font="mono-400" size={8.5} ls={1.2} fill={th.inkMuted}>
              {upper(c.label, lang)}
            </Txt>
            {i === 1 && icon && (
              <g transform={`translate(${c.x} ${ly.formValueY - 9.5}) scale(${11 / 24})`}>
                <path d={icon.path} fill={th.inkSoft} />
              </g>
            )}
            <Txt x={c.x + (i === 1 && icon ? 15 : 0)} y={ly.formValueY} font="sans-600" size={v.size} fill={th.ink}>
              {i === 1 && icon ? fit(c.value, { font: "sans-600", size: 12.5, minSize: 10, maxWidth: c.w - 15, letterSpacing: 0 }).text : v.text}
            </Txt>
          </g>
        );
      })}

      {/* Stats en barres segmentées */}
      {left.map((st, i) => (
        <StatRow key={st.code} stat={st} x={L.left} y={ly.statsTop + i * ly.statRow} th={th} idp={idp} />
      ))}
      {right.map((st, i) => (
        <StatRow key={st.code} stat={st} x={L.left + 153 + 16} y={ly.statsTop + i * ly.statRow} th={th} idp={idp} />
      ))}

      {/* Chefs d'accusation */}
      <Charges statuses={card.statuses} th={th} lang={lang} idp={idp} ly={ly} />

      {/* Pied */}
      <Txt x={L.left} y={L.footerY} font="mono-400" size={footerFit.size} ls={footerFit.letterSpacing} fill={th.inkMuted}>
        {footerFit.text}
      </Txt>

      {/* Reflet statique de l'ennemi public, et liseré */}
      {th.holoBand && <path d={cardPath(0)} fill={u("holoband")} />}
      <path d={cardPath(0.5)} fill="none" stroke="#fff" strokeOpacity={0.07} strokeWidth={1} />
    </svg>
  );
}

function Initials({ initials, M }: { initials: string; M: Layout["mug"] }) {
  const txt = initials.slice(0, 3).toUpperCase();
  const f = fit(txt, { font: "display-800", size: 72, minSize: 40, maxWidth: M.w - 20, letterSpacing: -1 });
  return (
    <text x={M.x + M.w / 2} y={M.y + 54 + f.size * 0.78} {...fontAttrs("display-800")} fontSize={f.size} letterSpacing={f.letterSpacing} textAnchor="middle" fill="#2b3442" fillOpacity={0.9}>
      {f.text}
    </text>
  );
}

/** Nom d'affichage du langage : le titre de l'icône, sinon la clé linguist capitalisée. */
function prettyLanguage(key: string, title?: string): string {
  if (title) return title;
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/** La fiche seule, responsive (width 100 %). */
export function Card(props: CardProps) {
  return <CardGraphic {...props} />;
}

export default Card;
