// La fiche de dev (SPEC §18.18) : un seul composant SVG React pur, rendu à
// l'identique dans le navigateur et côté serveur (renderToStaticMarkup → resvg).
// Calquée sur la maquette validée web/gta-card.js : style mat, six étoiles,
// UN seul dégradé par fiche (fond, note ou ciel), aplats partout ailleurs,
// aucune lueur sauf le contour éclairé par l'arrière de ★★★★★★.
// Uniquement ce que resvg sait rendre : aplats, un dégradé linéaire, texte,
// clipPath, image, feColorMatrix/feComponentTransfer (photo), feTurbulence
// (grain) et un flou (le contour de ★★★★★★).
import { useId, type ReactNode } from "react";
import type { CardData, Lang, Stat, StatusInstance, StatusTone } from "../types";
import { LEVEL_LABELS, starsFor } from "../types";
import { AzeritGem } from "./AzeritGem";
import { fontAttrs, type FontKey } from "./fonts";
import { CARD_H, CARD_R, CARD_W } from "./geometry";
import { t } from "./i18n";
import { langIcon } from "./languages";
import { fit, fitLines, measure, upper, type FittedLines } from "./text";
import { PALETTE, themeOf, type CardTheme } from "./themes";

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
/* Cotes (unités du viewBox 360 × 520), celles de la maquette           */
/* ------------------------------------------------------------------ */

const LEFT = 20;
const RIGHT = CARD_W - 18;
const FW = RIGHT - LEFT;
/** Photo d'identité : raccourcie quand un profil criminel se loge dessous. */
const MUG = { x: 178, y: 44, w: 164, h: 192, r: 6 };
/** Sans profil (fiches d'avant le barème 0.2.0), la photo descend jusqu'au filet
 *  et le niveau prend la place du nom de profil, en grand, à gauche de la photo. */
const MUG_NO_PROFILE_H = 266;
/** Niveau en grand des fiches sans profil : dernière ligne de base, taille. */
const BIG_LEVEL = { bottom: 306, size: 32, minSize: 20 };
const PLACARD = { w: 136, h: 44, bottom: 10 };
/** Horizon des fiches au ciel peint (★★★★★, ★★★★★★). */
const HY = 242;
const STAR_SIZE = 17;
const STAR_GAP = 3;

/**
 * Hiérarchie de lecture (de la plus forte à la plus faible) : la note, le nom
 * du profil, sa phrase (la blague qu'on capture), les chefs d'accusation, puis
 * le reste. Lignes de base, de haut en bas, sous la photo.
 */
/** Coin bas droit gardé libre pour le bouton rond qui retourne la fiche (web). */
export const FLIP_CORNER = 36;

export const LAYOUT = {
  profileName: { y: 270, size: 30, minSize: 20 },
  /** La phrase du profil : une ou deux lignes, jamais coupée (tests). */
  tagline: { y: 292, size: 18, minSize: 15, lineH: 21 },
  divider: 323,
  facts: { labelY: 334, valueY: 348, labelSize: 7.5 },
  stats: { y: 355, rowH: 20 },
  charges: { labelY: 427, y: 445, size: 14, minSize: 12, lineH: 19, labelSize: 7.5 },
  footer: { y: 510, size: 8, minSize: 7 },
} as const;

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
].join("");

/** Immeubles bas de l'horizon peint : [x, largeur, hauteur], une trouée au milieu pour le soleil. */
const BLOCKS: [number, number, number][] = [[0, 12, 14], [12, 9, 24], [21, 14, 15], [35, 8, 31], [43, 12, 19], [124, 10, 22], [134, 9, 36], [143, 14, 18], [157, 8, 27], [165, 15, 14]];
/** Trois palmiers de l'horizon : [x, échelle]. */
const SKY_PALMS: [number, number][] = [[50, 0.42], [92, 0.28], [104, 0.35]];
/** Horizon ton sur ton des niveaux bas : immeubles serrés à gauche de la photo
 *  (et un peu à droite), hauteur à l'échelle 1 ; [x, largeur, hauteur]. */
const LOW_BLOCKS: [number, number, number][] = [
  [0, 14, 22], [14, 10, 34], [24, 16, 18], [40, 9, 44], [49, 14, 26], [63, 11, 52], [74, 18, 30], [92, 8, 40],
  [100, 16, 20], [116, 12, 36], [128, 9, 58], [137, 15, 28], [152, 10, 42], [162, 18, 24], [340, 10, 30], [350, 10, 46],
];
/** Palmiers de l'horizon bas, dans l'ordre où ils apparaissent avec le niveau : [x, échelle]. */
const LOW_PALMS: [number, number][] = [[104, 0.34], [30, 0.3], [150, 0.26]];

const STAT_ORDER = ["TEC", "SHIP", "ARCH", "DOC", "XP", "BUZZ"] as const;

/* ------------------------------------------------------------------ */

export function sanitize(id: string) {
  return id.replace(/[^a-zA-Z0-9_-]/g, "");
}

/** Numéro de dossier : l'id court de la carte, en majuscules, 4 à 6 signes. */
export function caseNumber(id: string): string {
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

export function Txt({ x, y, font, size, fill, ls = 0, anchor = "start", opacity, children }: TxtProps) {
  return (
    <text x={x} y={y} {...fontAttrs(font)} fontSize={size} letterSpacing={ls ? +ls.toFixed(2) : undefined} textAnchor={anchor} fill={fill} fillOpacity={opacity}>
      {children}
    </text>
  );
}

/* ------------------------------------------------------------------ */
/* Blocs                                                                */
/* ------------------------------------------------------------------ */

/** Étoiles du HUD : six emplacements, les allumées blanches et mates calées à
 *  droite ; les éteintes pleines et sombres (blanc à 13 % sur l'encre). */
export function Stars({ n, onSky }: { n: number; onSky: boolean }) {
  const k = STAR_SIZE / 24;
  const x0 = RIGHT - 6 * STAR_SIZE - 5 * STAR_GAP;
  // Une étoile allumée garde son emplacement éteint dessous : à l'arrivée (option
  // starsIntro de CardView), le calque allumé apparaît par-dessus, dans l'ordre
  // data-star : 0 = la première allumée, la plus à droite, puis vers la gauche.
  return (
    <g>
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const on = i >= 6 - n;
        return (
          <g key={i} transform={`translate(${x0 + i * (STAR_SIZE + STAR_GAP)} 15) scale(${k})`}>
            {onSky ? <path d={STAR} fill="#14141e" fillOpacity={0.55} /> : <path d={STAR} fill="#fff" fillOpacity={0.13} />}
            {on && (
              <g className="tys-star-on" data-star={5 - i}>
                <path d={STAR} transform={`translate(0 ${+(1 / k).toFixed(3)})`} fill="#000" fillOpacity={0.28} />
                <path d={STAR} fill={PALETTE.star} />
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
}

/** Pastille d'un chef d'accusation : un pictogramme par ton. */
function Pastille({ tone, cx, cy, th }: { tone: StatusTone; cx: number; cy: number; th: CardTheme }) {
  const ink = tone === "negative" ? "#fff" : PALETTE.ink0;
  return (
    <g transform={`translate(${cx} ${cy}) scale(1.1)`}>
      <circle r={5.6} fill={th.tones[tone]} />
      {tone === "negative" && (
        <>
          <rect x={-0.85} y={-3.4} width={1.7} height={4.1} rx={0.8} fill={ink} />
          <circle cx={0} cy={2.5} r={0.95} fill={ink} />
        </>
      )}
      {tone === "positive" && <path d="M-2.5 0.1 L-0.7 1.9 L2.6 -1.9" fill="none" stroke={ink} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />}
      {tone === "special" && <path d="M0 -3.2 L0.9 -0.9 L3.2 0 L0.9 0.9 L0 3.2 L-0.9 0.9 L-3.2 0 L-0.9 -0.9 Z" fill={ink} />}
      {tone === "gap" && <path d="M-2.6 -1.1h5.2M-2.6 1.1h5.2M1.4 -3 L-1.4 3" stroke={ink} strokeWidth={1.3} strokeLinecap="round" />}
    </g>
  );
}

/** Une stat : code, barre de dix segments séparés en aplats, valeur. */
function StatRow({ stat, x, y, th }: { stat: Stat; x: number; y: number; th: CardTheme }) {
  const weak = !stat.sufficient;
  const col = stat.code === "BUZZ" ? th.buzz : th.bar;
  const v = Math.max(0, Math.min(99, stat.value));
  const bx = x + 40;
  const bw = 153 - 40 - 28;
  const seg = (bw - 9 * 2) / 10;
  return (
    <g>
      <Txt x={x} y={y + 13} font="sans-600" size={10} ls={0.6} fill={th.inkSoft} opacity={0.75}>
        {stat.code}
      </Txt>
      {Array.from({ length: 10 }, (_, j) => {
        const sx = +(bx + j * (seg + 2)).toFixed(2);
        const fw = Math.max(0, Math.min(seg, ((v - j * 10) / 10) * seg));
        return (
          <g key={j}>
            <rect x={sx} y={y + 5} width={+seg.toFixed(2)} height={8} rx={1} fill="#fff" fillOpacity={0.09} />
            {fw > 0 && <rect x={sx} y={y + 5} width={+fw.toFixed(2)} height={8} rx={1} fill={col} fillOpacity={weak ? 0.45 : undefined} />}
          </g>
        );
      })}
      <Txt x={x + 153} y={y + 15} font="display-700" size={18} anchor="end" fill={th.ink} opacity={weak ? 0.55 : undefined}>
        {stat.value}
      </Txt>
      {weak && (
        <Txt x={x + 153 - 25} y={y + 14} font="mono-700" size={9} anchor="end" fill={th.inkSoft} opacity={0.6}>
          ?
        </Txt>
      )}
    </g>
  );
}

function Charges({ statuses, th, lang }: { statuses: StatusInstance[]; th: CardTheme; lang: Lang }) {
  const s = t(lang);
  const C = LAYOUT.charges;
  return (
    <g>
      <Txt x={LEFT} y={C.labelY} font="sans-600" size={C.labelSize} ls={1.1} fill={th.inkSoft} opacity={0.62}>
        {upper(s.charges, lang)}
      </Txt>
      {statuses.slice(0, 3).map((st, i) => {
        const y = C.y + i * C.lineH;
        const tag = st.byAI ? ` · ${s.ai}` : "";
        const tagW = st.byAI ? measure(tag, "mono-400", 9) : 0;
        // La troisième ligne laisse le coin bas droit au bouton « Retourner la fiche » (web).
        const label = fit(st.label[lang] ?? st.label.fr, { font: "sans-500", size: C.size, minSize: C.minSize, maxWidth: FW - 18 - tagW - (i === 2 ? FLIP_CORNER : 0) });
        return (
          <g key={st.id + i}>
            <Pastille tone={st.tone} cx={LEFT + 6.2} cy={y - 4.9} th={th} />
            <Txt x={LEFT + 18} y={y} font="sans-500" size={label.size} fill={th.ink}>
              {label.text}
            </Txt>
            {st.byAI && (
              <Txt x={LEFT + 18 + label.width + 2} y={y} font="mono-400" size={9} fill={th.inkSoft} opacity={0.55}>
                {tag}
              </Txt>
            )}
          </g>
        );
      })}
    </g>
  );
}

/** Horizon peint : immeubles bas et palmiers en aplat de la teinte du sol,
 *  fenêtres allumées pour l'heure bleue. */
function Skyline({ ground, lights }: { ground: string; lights?: boolean }) {
  return (
    <g>
      {BLOCKS.map(([x, w, h]) => (
        <g key={x}>
          <rect x={x} y={HY - h} width={w + 0.5} height={h + 1} fill={ground} />
          {lights &&
            Array.from({ length: Math.floor(h / 8) }, (_, k) => (
              <rect key={k} x={x + 2.5 + (k % 2) * 3.5} y={HY - h + 4 + k * 7} width={1.6} height={1.6} fill="#ffc46b" fillOpacity={0.8} />
            ))}
        </g>
      ))}
      {SKY_PALMS.map(([x, k]) => (
        <g key={x} transform={`translate(${x} ${+(HY - 140 * k).toFixed(2)}) scale(${k})`} fill={ground}>
          <path d={PALM} />
        </g>
      ))}
    </g>
  );
}

/** Horizon ton sur ton (★ à ★★★★ et spéciales) : silhouettes en aplat posées sur
 *  la ligne d'horizon, sans sol ni soleil ni fenêtres, plus basses que le ciel peint. */
function LowHorizon({ color, scale, palms }: NonNullable<CardTheme["horizon"]>) {
  return (
    <g fill={color}>
      {LOW_BLOCKS.map(([x, w, h]) => {
        const hh = +(h * scale).toFixed(2);
        return <rect key={x} x={x} y={+(HY - hh).toFixed(2)} width={w + 0.5} height={hh} />;
      })}
      {LOW_PALMS.slice(0, palms).map(([x, k]) => (
        <g key={x} transform={`translate(${x} ${+(HY - 140 * k).toFixed(2)}) scale(${k})`}>
          <path d={PALM} />
        </g>
      ))}
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
  const n = starsFor(card.overall);
  const levelLabel = LEVEL_LABELS[n][lang];
  const avatar = avatarHref !== undefined ? avatarHref || undefined : card.avatarUrl;
  const u = (k: string) => `url(#${idp}-${k})`;
  const sky = th.grad === "sky" && th.sky ? th.sky : null;
  const M = { ...MUG, h: card.profile ? MUG.h : MUG_NO_PROFILE_H };

  // Haut gauche : la note, le niveau, la pilule des spéciales
  const overallSize = card.overall >= 100 ? 92 : 118;
  const level = fit(upper(levelLabel, lang), { font: "sans-600", size: 11, minSize: 9, maxWidth: M.x - LEFT - 8, letterSpacing: 1.65, minLetterSpacing: 0.5 });
  const bigLevel = card.profile ? null : fitLines(upper(levelLabel, lang), { font: "display-700", size: BIG_LEVEL.size, minSize: BIG_LEVEL.minSize, maxWidth: M.x - LEFT - 10, letterSpacing: 0.4 });
  const badgeY = card.profile ? 172 : 148;
  const badge = th.badge ? fit(upper(th.label[lang], lang), { font: "sans-600", size: 8.5, minSize: 7.5, maxWidth: M.x - LEFT - 8 - 18, letterSpacing: 1.2, minLetterSpacing: 0.4 }) : null;

  // Écriteau
  const plX = M.x + (M.w - PLACARD.w) / 2;
  const plY = M.y + M.h - PLACARD.bottom - PLACARD.h;
  const placardName = fit(upper(card.login ?? card.name, lang), { font: "display-700", size: 20, minSize: 12, maxWidth: PLACARD.w - 16, letterSpacing: 1.6, minLetterSpacing: 0.3 });
  const caseFit = fit(`${s.caseNo} ${caseNumber(card.id)} · ${caseDate(card.createdAt)}`, { font: "mono-400", size: 8.5, minSize: 7, maxWidth: PLACARD.w - 12, letterSpacing: 0.85, minLetterSpacing: 0.2 });

  // Profil criminel (§18.2) : le nom comme une page personnage, l'accroche seulement si elle tient entière
  const profileName = card.profile
    ? fit(upper(card.profile.label[lang] ?? card.profile.label.fr, lang), { font: "display-700", size: LAYOUT.profileName.size, minSize: LAYOUT.profileName.minSize, maxWidth: FW, letterSpacing: 0.4, minLetterSpacing: 0 })
    : null;
  const tagline = card.profile ? profileTagline(card.profile.tagline[lang] ?? card.profile.tagline.fr) : null;

  // Spécialité / arme / affiliation
  const unit = (FW - 20) / 3.3;
  const icon = langIcon(card.mainLanguage);
  const cols = [
    { x: LEFT, w: unit, label: s.specialty, value: s.positions[card.position] ?? card.position },
    { x: LEFT + unit + 10, w: unit, label: s.weapon, value: card.mainLanguage ? prettyLanguage(card.mainLanguage, icon?.title) : "—" },
    { x: LEFT + 2 * unit + 20, w: unit * 1.3, label: s.affiliation, value: card.club ?? s.loneWolf },
  ];

  // Pied, en procès-verbal
  const footerFit = fit(`${s.questioned(card.judgedInSeconds)} · ${s.evidence} ${s.percent(card.reliability)}`, { font: "mono-400", size: LAYOUT.footer.size, minSize: LAYOUT.footer.minSize, maxWidth: FW - 30, letterSpacing: 0, minLetterSpacing: 0 });

  const stats = STAT_ORDER.map((code) => card.stats.find((st) => st.code === code)).filter((st): st is Stat => !!st);
  const ariaLabel = `${s.card} ${levelLabel} ${card.overall}, ${s.stars(n)} — ${card.name}`;

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
      data-stars={n}
      style={width === undefined ? { display: "block", width: "100%", height: "auto" } : undefined}
    >
      <defs>
        <clipPath id={`${idp}-card`}>
          <rect width={CARD_W} height={CARD_H} rx={CARD_R} />
        </clipPath>
        <clipPath id={`${idp}-mug`}>
          <rect x={M.x} y={M.y} width={M.w} height={M.h} rx={M.r} />
        </clipPath>
        {/* Le seul dégradé de la fiche */}
        {th.grad === "bg" && (
          <linearGradient id={`${idp}-g`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={th.bg[0]} />
            <stop offset="1" stopColor={th.bg[1]} />
          </linearGradient>
        )}
        {th.grad === "num" && (
          <linearGradient id={`${idp}-g`} x1="0" y1="0" x2="0" y2="1">
            {th.num.map(([o, c]) => (
              <stop key={o} offset={o} stopColor={c} />
            ))}
          </linearGradient>
        )}
        {sky && (
          <linearGradient id={`${idp}-g`} x1="0" y1="0" x2="0" y2={HY} gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor={sky.stops[0]} />
            <stop offset="0.5" stopColor={sky.stops[1]} />
            <stop offset="0.84" stopColor={sky.stops[2]} />
            <stop offset="1" stopColor={sky.stops[3]} />
          </linearGradient>
        )}
        {/* Photo « peinte » : ombres poussées vers le violet, sans posterisation dure */}
        <filter id={`${idp}-photo`} colorInterpolationFilters="sRGB">
          {th.gray ? (
            <>
              <feColorMatrix type="saturate" values="0" />
              <feComponentTransfer>
                <feFuncR type="table" tableValues="0.16 0.62 0.93" />
                <feFuncG type="table" tableValues="0.17 0.64 0.95" />
                <feFuncB type="table" tableValues="0.21 0.68 0.98" />
              </feComponentTransfer>
            </>
          ) : (
            <>
              <feColorMatrix type="saturate" values="1.08" />
              <feComponentTransfer>
                <feFuncR type="table" tableValues="0.19 0.56 1" />
                <feFuncG type="table" tableValues="0.12 0.48 0.98" />
                <feFuncB type="table" tableValues="0.31 0.6 0.98" />
              </feComponentTransfer>
            </>
          )}
        </filter>
        <filter id={`${idp}-grain`} x="0" y="0" width={CARD_W} height={CARD_H} filterUnits="userSpaceOnUse">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={5} stitchTiles="stitch" />
          <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.5 0" />
        </filter>
        {th.rim && (
          <filter id={`${idp}-rim`} x="-5%" y="-5%" width="110%" height="110%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
        )}
      </defs>

      <g clipPath={u("card")}>
        {/* Fond */}
        {th.grad === "bg" && <rect width={CARD_W} height={CARD_H} fill={u("g")} />}
        {th.grad === "num" && <rect width={CARD_W} height={CARD_H} fill={th.bg[0]} />}
        {sky && (
          <>
            <rect width={CARD_W} height={HY} fill={u("g")} />
            {sky.sun && <circle cx={96} cy={HY - 2} r={20} fill={sky.sun} fillOpacity={0.85} />}
            <rect y={HY} width={CARD_W} height={CARD_H - HY} fill={sky.ground} />
            <Skyline ground={sky.ground} lights={sky.lights} />
          </>
        )}
        {!sky && th.horizon && <LowHorizon {...th.horizon} />}
        {th.palm && (
          <g transform="translate(236 318) scale(1.45)" fill={th.palm}>
            <path d={PALM} />
          </g>
        )}
        <rect width={CARD_W} height={CARD_H} filter={u("grain")} opacity={0.05} />

        {/* Haut : la marque à gauche, les étoiles du HUD à droite */}
        <AzeritGem x={LEFT} y={18} h={13} />
        <Txt x={LEFT + 17} y={29.5} font="sans-600" size={10} ls={2.2} fill={th.inkSoft} opacity={0.85}>
          AZERIT
        </Txt>
        <Stars n={n} onSky={!!sky} />

        {/* La note : crème plat, ou le seul dégradé de la fiche */}
        <text x={16} y={134} {...fontAttrs("display-800")} fontSize={overallSize} letterSpacing={-2.4} fill={th.grad === "num" ? u("g") : th.ink}>
          {card.overall}
        </text>
        {bigLevel ? (
          bigLevel.lines.map((line, i, all) => (
            <Txt key={i} x={LEFT - 1} y={+(BIG_LEVEL.bottom - (all.length - 1 - i) * bigLevel.size * 0.98).toFixed(2)} font="display-700" size={bigLevel.size} ls={0.4} fill={th.ink}>
              {line}
            </Txt>
          ))
        ) : (
          <Txt x={LEFT} y={157} font="sans-600" size={level.size} ls={level.letterSpacing} fill={th.inkSoft}>
            {level.text}
          </Txt>
        )}
        {badge && th.badge && (
          <g>
            <rect x={LEFT} y={badgeY} width={+(badge.width + 18).toFixed(2)} height={20} rx={10} fill={th.badge.bg} />
            <Txt x={LEFT + 9} y={badgeY + 13.2} font="sans-600" size={badge.size} ls={badge.letterSpacing} fill={th.badge.ink}>
              {badge.text}
            </Txt>
          </g>
        )}

        {/* Photo d'identité judiciaire */}
        <g clipPath={u("mug")}>
          <rect x={M.x} y={M.y} width={M.w} height={M.h} fill={th.gray ? "#a9b0b6" : "#b4bfcb"} />
          {Array.from({ length: Math.floor((M.h - 25) / 26.5) + 1 }, (_, i) => (
            <rect key={i} x={M.x} y={M.y + 25 + i * 26.5} width={M.w} height={1.5} fill="#141c28" fillOpacity={0.32} />
          ))}
          {["190", "180", "170", "160"].map((tck, i) => (
            <Txt key={tck} x={M.x + 6} y={M.y + 21 + i * 53} font="mono-700" size={8} fill="#141c28" opacity={0.6}>
              {tck}
            </Txt>
          ))}
          {avatar ? (
            <image href={avatar} x={M.x + 12} y={M.y + M.h - 168} width={140} height={168} preserveAspectRatio="xMidYMin slice" filter={u("photo")} />
          ) : (
            <Initials initials={card.initials} M={M} />
          )}
          {card.source === "cv" && (
            <g transform={`translate(${M.x + M.w / 2} ${M.y + 40}) rotate(-9)`} opacity={0.88}>
              <rect x={-64} y={-16} width={128} height={32} rx={3} fill="none" stroke="#a3261b" strokeWidth={2.2} />
              <rect x={-60} y={-12} width={120} height={24} rx={1.5} fill="none" stroke="#a3261b" strokeWidth={0.8} />
              <Txt x={0} y={5.4} font="display-800" size={15.5} ls={1.4} anchor="middle" fill="#a3261b">
                {fit(card.declaredSource === "linkedin" ? s.linkedinStamp : s.cvStamp, { font: "display-800", size: 15.5, minSize: 11, maxWidth: 108, letterSpacing: 1.4, minLetterSpacing: 0.4 }).text}
              </Txt>
            </g>
          )}
          <g transform={`rotate(-1.2 ${plX + PLACARD.w / 2} ${plY + PLACARD.h / 2})`}>
            <rect x={plX} y={plY} width={PLACARD.w} height={PLACARD.h} rx={3} fill="#111111" />
            <Txt x={plX + PLACARD.w / 2 + placardName.letterSpacing / 2} y={plY + 22} font="display-700" size={placardName.size} ls={placardName.letterSpacing} anchor="middle" fill="#f4f1ea">
              {placardName.text}
            </Txt>
            <Txt x={plX + PLACARD.w / 2} y={plY + 35} font="mono-400" size={caseFit.size} ls={caseFit.letterSpacing} anchor="middle" fill="#bdb8ad">
              {caseFit.text}
            </Txt>
          </g>
        </g>
        <rect x={M.x + 0.5} y={M.y + 0.5} width={M.w - 1} height={M.h - 1} rx={M.r} fill="none" stroke="#fff" strokeOpacity={0.14} />

        {/* Profil criminel : le nom d'une page personnage, puis l'accroche rose */}
        {profileName && (
          <Txt x={LEFT - 1} y={LAYOUT.profileName.y} font="display-700" size={profileName.size} ls={profileName.letterSpacing} fill={th.ink}>
            {profileName.text}
          </Txt>
        )}
        {tagline &&
          tagline.lines.map((line, i) => (
            <Txt key={i} x={LEFT} y={LAYOUT.tagline.y + i * LAYOUT.tagline.lineH} font="sans-600" size={tagline.size} fill={PALETTE.blush}>
              {line}
            </Txt>
          ))}

        {/* Spécialité, arme, affiliation */}
        <rect x={LEFT} y={LAYOUT.divider} width={FW} height={1} fill="#fff" fillOpacity={0.12} />
        {cols.map((c) => {
          const v = fit(c.value, { font: "sans-600", size: 12.5, minSize: 10, maxWidth: c.w });
          return (
            <g key={c.label}>
              <Txt x={c.x} y={LAYOUT.facts.labelY} font="sans-600" size={LAYOUT.facts.labelSize} ls={1} fill={th.inkSoft} opacity={0.62}>
                {upper(c.label, lang)}
              </Txt>
              <Txt x={c.x} y={LAYOUT.facts.valueY} font="sans-600" size={v.size} fill={th.ink}>
                {v.text}
              </Txt>
            </g>
          );
        })}

        {/* Six stats en barres de dix segments */}
        {stats.map((st, i) => (
          <StatRow key={st.code} stat={st} x={LEFT + (i < 3 ? 0 : 169)} y={LAYOUT.stats.y + (i % 3) * LAYOUT.stats.rowH} th={th} />
        ))}

        <Charges statuses={card.statuses} th={th} lang={lang} />

        <Txt x={LEFT} y={LAYOUT.footer.y} font="mono-400" size={footerFit.size} ls={footerFit.letterSpacing} fill={th.inkSoft} opacity={0.5}>
          {footerFit.text}
        </Txt>

        {/* Liseré ; pour ★★★★★★, le contour éclairé par l'arrière, la seule lumière */}
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

function Initials({ initials, M }: { initials: string; M: typeof MUG }) {
  const f = fit(initials.slice(0, 3).toUpperCase(), { font: "display-800", size: 72, minSize: 40, maxWidth: M.w - 30 });
  return (
    <Txt x={M.x + M.w / 2} y={M.y + 108 + (M.h - MUG.h) / 2} font="display-800" size={f.size} anchor="middle" fill="#2b3442" opacity={0.85}>
      {f.text}
    </Txt>
  );
}

/** La phrase du profil posée comme sur la fiche : une ou deux lignes, sans coupe. */
export function profileTagline(text: string): FittedLines {
  const T = LAYOUT.tagline;
  return fitLines(text, { font: "sans-600", size: T.size, minSize: T.minSize, maxWidth: FW });
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
