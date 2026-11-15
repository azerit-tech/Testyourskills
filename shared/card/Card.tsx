// La fiche de dev (SPEC §18.18) : un seul composant SVG React pur, rendu à
// l'identique dans le navigateur et côté serveur (renderToStaticMarkup → resvg).
// Calquée sur la maquette validée du 9 novembre 2026 : style mat, six étoiles,
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
import { MUG_PHOTO, Plate, Silhouette, Toise, caseLabel, caseNumber, plateInitials, plateName, plateSub, toiseCover } from "./mug";
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
/** Horizon des fiches au ciel peint (★★★★★, ★★★★★★). */
const HY = 242;
/** La note : sa ligne de base. Son haut s'aligne sur le haut de la photo. */
const NOTE_Y = 128;
/** Les étoiles, signe majeur de la fiche (§18.48) : une rangée de six sous la note,
 *  de la largeur de la colonne à gauche de la photo ; le nom du niveau dessous. */
export const STARS = { y: 139, size: 22, gap: 3 } as const;
const LEVEL = { y: 178, size: 15, minSize: 12 };

/**
 * Le plus petit corps de la fiche, en unités du viewBox : 12, soit 11 px quand
 * la fiche fait 334 px de large (390 × 664, la hauteur utile d'un téléphone).
 * Aucun texte du recto ne descend en dessous, étiquettes en capitales comprises.
 */
export const MIN_TEXT = 12;

/**
 * Hiérarchie de lecture (de la plus forte à la plus faible) : la note, le nom
 * du profil, sa phrase (la blague qu'on capture), les chefs d'accusation, puis
 * le reste. Lignes de base, de haut en bas, sous la photo.
 */
export const LAYOUT = {
  profileName: { y: 270, size: 30, minSize: 20 },
  /** La phrase du profil : une ou deux lignes, jamais coupée (tests). */
  tagline: { y: 292, size: 18, minSize: 15, lineH: 21 },
  divider: 322,
  facts: { labelY: 337, valueY: 354, labelSize: MIN_TEXT },
  /** Les six traits : leur étiquette dit que la note ne vient pas d'eux. */
  traits: { labelY: 372, labelSize: MIN_TEXT },
  stats: { y: 376, rowH: 17 },
  /** Trois chefs d'accusation en 14 ; un ou deux, en 16, le bloc centré entre les traits et le pied. */
  charges: { labelY: 442, y: 459, size: 14, minSize: MIN_TEXT, lineH: 17.5, labelSize: MIN_TEXT, roomy: { size: 16, lineH: 22 }, zone: { top: 432, bottom: 501 } },
  /** La signature, en 12 comme les étiquettes (revue §18.48). */
  footer: { y: 511, size: MIN_TEXT, minSize: MIN_TEXT },
} as const;

/** Le tampon « D'après LinkedIn » : sur le haut de la photo ; sans photo, plus haut, et la silhouette descend d'autant. */
const STAMP = { y: 40, yBare: 30, drop: 12 } as const;

export const STAR = "M12 2.6l2.9 6.1 6.7.8-4.9 4.6 1.3 6.6L12 17.4l-6 3.3 1.3-6.6L2.4 9.5l6.7-.8z";
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

export { caseNumber };

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

/**
 * Les étoiles (§18.48) : six emplacements, remplis de gauche à droite. Allumée :
 * crème pleine. Éteinte : la même étoile en contour de 1,5, blanc à 35 %, sans
 * remplissage. `x`, `y` : le coin haut gauche de la rangée.
 */
export function Stars({ n, x = LEFT, y = STARS.y, size = STARS.size, gap = STARS.gap }: { n: number; x?: number; y?: number; size?: number; gap?: number }) {
  const k = size / 24;
  // Le contour est centré sur le tracé : l'étoile éteinte rentre de la moitié du trait pour garder l'empreinte de l'allumée.
  const off = (size - 1.5) / 24;
  // Une étoile allumée garde son emplacement éteint dessous : à l'arrivée (option
  // starsIntro de CardView), le calque allumé apparaît par-dessus, dans l'ordre
  // data-star : 0 = la première, la plus à gauche, puis vers la droite.
  return (
    <g data-star-row="">
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const on = i < n;
        const sx = +(x + i * (size + gap)).toFixed(2);
        return (
          <g key={i}>
            <path d={STAR} transform={`translate(${+(sx + 0.75).toFixed(2)} ${y + 0.75}) scale(${+off.toFixed(4)})`} fill="none" stroke="#fff" strokeOpacity={0.35} strokeWidth={+(1.5 / off).toFixed(3)} strokeLinejoin="round" />
            {on && (
              <g className="tys-star-on" data-star={i}>
                <path d={STAR} transform={`translate(${sx} ${y}) scale(${+k.toFixed(4)})`} fill={PALETTE.cream} />
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
}

/** Pastille d'un chef d'accusation : un pictogramme par ton. */
function Pastille({ tone, cx, cy, th, scale = 1.1 }: { tone: StatusTone; cx: number; cy: number; th: CardTheme; scale?: number }) {
  const ink = tone === "negative" ? "#fff" : PALETTE.ink0;
  return (
    <g transform={`translate(${cx} ${cy}) scale(${+scale.toFixed(3)})`}>
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
  const bx = x + 42;
  // La barre s'arrête avant le « ? » d'une valeur fragile, en mono 12 lui aussi.
  const bw = 153 - 42 - 37;
  const seg = (bw - 9 * 2) / 10;
  return (
    <g>
      <Txt x={x} y={y + 13} font="sans-600" size={MIN_TEXT} ls={0.4} fill={th.inkSoft} opacity={0.8}>
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
        <Txt x={x + 153 - 25} y={y + 14} font="mono-700" size={MIN_TEXT} anchor="end" fill={th.inkSoft} opacity={0.6}>
          ?
        </Txt>
      )}
    </g>
  );
}

/**
 * Où poser les chefs d'accusation : trois en 14, sous leur étiquette ; un ou deux
 * en 16, le bloc (étiquette comprise) centré entre les traits et le pied, pour
 * ne pas laisser de bande vide au-dessus de la signature.
 */
export function chargesPlan(count: number): { labelY: number; y: number; size: number; lineH: number } {
  const C = LAYOUT.charges;
  if (count >= 3) return { labelY: C.labelY, y: C.y, size: C.size, lineH: C.lineH };
  const { size, lineH } = C.roomy;
  const n = Math.max(count, 0);
  // Du haut des capitales de l'étiquette au bas des lettres de la dernière ligne.
  const cap = C.labelSize * 0.72;
  const gap = size + 5;
  const height = cap + (n ? gap + (n - 1) * lineH + size * 0.22 : 0);
  const top = C.zone.top + (C.zone.bottom - C.zone.top - height) / 2;
  const labelY = +(top + cap).toFixed(2);
  return { labelY, y: +(labelY + gap).toFixed(2), size, lineH };
}

function Charges({ statuses, th, lang }: { statuses: StatusInstance[]; th: CardTheme; lang: Lang }) {
  const s = t(lang);
  const C = LAYOUT.charges;
  const shown = statuses.slice(0, 3);
  const plan = chargesPlan(shown.length);
  const k = plan.size / C.size;
  return (
    <g>
      <Txt x={LEFT} y={plan.labelY} font="sans-600" size={C.labelSize} ls={0.8} fill={th.inkSoft} opacity={0.7}>
        {upper(s.charges, lang)}
      </Txt>
      {shown.map((st, i) => {
        const y = +(plan.y + i * plan.lineH).toFixed(2);
        const tag = st.byAI ? ` · ${s.ai}` : "";
        const tagW = st.byAI ? measure(tag, "mono-400", MIN_TEXT) : 0;
        const label = fit(st.label[lang] ?? st.label.fr, { font: "sans-500", size: plan.size, minSize: C.minSize, maxWidth: FW - 20 * k - tagW });
        return (
          <g key={st.id + i}>
            <Pastille tone={st.tone} cx={+(LEFT + 6.2 * k).toFixed(2)} cy={+(y - 4.9 * k).toFixed(2)} th={th} scale={1.1 * k} />
            <Txt x={+(LEFT + 18 * k).toFixed(2)} y={y} font="sans-500" size={label.size} fill={th.ink}>
              {label.text}
            </Txt>
            {st.byAI && (
              <Txt x={+(LEFT + 18 * k + label.width + 2).toFixed(2)} y={y} font="mono-400" size={MIN_TEXT} fill={th.inkSoft} opacity={0.6}>
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

/** Dossier scellé : « DOSSIER / SCELLÉ » en grand, « LE CODE RESTE À PROUVER » dessous, à la place de la note. */
export function sealedFace(lang: Lang, maxWidth: number): { title: FittedLines; sub: FittedLines } {
  const s = t(lang);
  return {
    title: fitLines(upper(s.sealed, lang), { font: "display-700", size: 36, minSize: 22, maxWidth, letterSpacing: 0.4 }),
    sub: fitLines(upper(s.sealedSub, lang), { font: "sans-600", size: MIN_TEXT, minSize: MIN_TEXT, maxWidth, letterSpacing: 0.8 }),
  };
}

/** Le bloc mat de la note scellée, sous la marque, à gauche de la photo. */
function SealedMark({ sealed, ink, inkSoft }: { sealed: { title: FittedLines; sub: FittedLines }; ink: string; inkSoft: string }) {
  const { title, sub } = sealed;
  // Deux lignes de titre au plus, calées pour que la dernière tombe à hauteur du bas de la note (134).
  const top = 134 - (title.lines.length - 1) * title.size * 0.98;
  return (
    <g data-sealed-mark="">
      {title.lines.map((line, i) => (
        <Txt key={i} x={LEFT - 1} y={+(top + i * title.size * 0.98).toFixed(2)} font="display-700" size={title.size} ls={0.4} fill={ink}>
          {line}
        </Txt>
      ))}
      {sub.lines.map((line, i) => (
        <Txt key={`s${i}`} x={LEFT} y={158 + i * 16} font="sans-600" size={sub.size} ls={0.8} fill={inkSoft}>
          {line}
        </Txt>
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
  const stamped = card.source === "cv";

  // Haut gauche : la note, le niveau, la pilule des spéciales
  const overallSize = card.overall >= 100 ? 92 : 118;
  const level = fit(upper(levelLabel, lang), { font: "display-700", size: LEVEL.size, minSize: LEVEL.minSize, maxWidth: M.x - LEFT - 8, letterSpacing: 0.9, minLetterSpacing: 0.3 });
  const bigLevel = card.profile ? null : fitLines(upper(levelLabel, lang), { font: "display-700", size: BIG_LEVEL.size, minSize: BIG_LEVEL.minSize, maxWidth: M.x - LEFT - 10, letterSpacing: 0.4 });
  // La pilule des spéciales : sous le nom du niveau, ou sous les étoiles quand le niveau est en grand plus bas.
  const badgeY = card.profile ? LEVEL.y + 8 : STARS.y + STARS.size + 9;
  const badge = th.badge ? fit(upper(th.label[lang], lang), { font: "sans-600", size: MIN_TEXT, minSize: MIN_TEXT, maxWidth: M.x - LEFT - 6 - 14, letterSpacing: 0.8, minLetterSpacing: 0 }) : null;

  // Le numéro de dossier, en haut à droite, à la place des étoiles d'avant
  const caseNo = caseLabel(card.id, lang);

  // Profil criminel (§18.2) : le nom comme une page personnage, l'accroche seulement si elle tient entière
  const profileName = card.profile
    ? fit(upper(card.profile.label[lang] ?? card.profile.label.fr, lang), { font: "display-700", size: LAYOUT.profileName.size, minSize: LAYOUT.profileName.minSize, maxWidth: FW, letterSpacing: 0.4, minLetterSpacing: 0 })
    : null;
  const tagline = card.profile ? profileTagline(card.profile.tagline[lang] ?? card.profile.tagline.fr) : null;
  // Accroche sur une ligne : le nom et l'accroche descendent d'une demi-ligne, centrés au-dessus du filet.
  const nameDrop = tagline && tagline.lines.length === 1 ? Math.round(LAYOUT.tagline.lineH / 2) : 0;

  // Spécialité / arme / affiliation
  const unit = (FW - 20) / 3.3;
  const icon = langIcon(card.mainLanguage);
  const cols = [
    { x: LEFT, w: unit, label: s.specialty, value: s.positions[card.position] ?? card.position },
    { x: LEFT + unit + 10, w: unit, label: s.weapon, value: card.mainLanguage ? prettyLanguage(card.mainLanguage, icon?.title) : "–" },
    { x: LEFT + 2 * unit + 20, w: unit * 1.3, label: s.affiliation, value: card.club ?? s.loneWolf },
  ];

  // Pied, en procès-verbal ; s'il ne tient pas en mono 12, « Fiche » tombe (« Lue par Azerit en 12 s · … »).
  const footerText = [s.questioned, s.questionedShort].map((q) => `${q(card.judgedInSeconds)} · ${s.proven(card.reliability)}`).find((x) => measure(x, "mono-400", LAYOUT.footer.size) <= FW) ?? `${s.questionedShort(card.judgedInSeconds)} · ${s.proven(card.reliability)}`;
  const footerFit = fit(footerText, { font: "mono-400", size: LAYOUT.footer.size, minSize: LAYOUT.footer.minSize, maxWidth: FW, letterSpacing: 0, minLetterSpacing: 0 });

  const stats = STAT_ORDER.map((code) => card.stats.find((st) => st.code === code)).filter((st): st is Stat => !!st);
  // Dossier scellé (shared/publicView.ts) : à la place de la note, du niveau et des étoiles, deux mots mats.
  const sealed = card.sealed ? sealedFace(lang, M.x - LEFT - 8) : null;
  const ariaLabel = sealed ? `${s.card}, ${s.sealed}, ${s.sealedSub}, ${card.name}` : `${s.card} ${levelLabel} ${card.overall}/100, ${s.stars(n)}, ${card.name}`;
  // Les six traits ne font pas la note d'une fiche jugée sur la grille : leur étiquette le dit.
  const traits = fit(upper(card.grid ? s.traitsNote : s.traits, lang), { font: "sans-600", size: LAYOUT.traits.labelSize, minSize: LAYOUT.traits.labelSize, maxWidth: FW, letterSpacing: 0.8, minLetterSpacing: 0 });

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
      data-stars={sealed ? undefined : n}
      data-sealed={sealed ? "" : undefined}
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

        {/* Haut : la marque à gauche, le numéro de dossier à droite */}
        <AzeritGem x={LEFT} y={17.5} h={14} />
        <Txt x={LEFT + 18} y={30.5} font="sans-600" size={MIN_TEXT} ls={1.8} fill={th.inkSoft} opacity={0.85}>
          AZERIT
        </Txt>
        <Txt x={RIGHT} y={30.5} font="mono-500" size={MIN_TEXT} ls={0.4} anchor="end" fill={th.inkSoft} opacity={0.8}>
          {caseNo}
        </Txt>

        {/* La note : crème plat sur toutes les fiches (le rose dit « ça se touche ») ; dessous, les six étoiles */}
        {sealed ? (
          <SealedMark sealed={sealed} ink={th.ink} inkSoft={th.inkSoft} />
        ) : (
          <>
            <text x={16} y={NOTE_Y} {...fontAttrs("display-800")} fontSize={overallSize} letterSpacing={-2.4} fill={th.ink}>
              {card.overall}
            </text>
            <Stars n={n} />
          </>
        )}
        {sealed ? null : bigLevel ? (
          bigLevel.lines.map((line, i, all) => (
            <Txt key={i} x={LEFT - 1} y={+(BIG_LEVEL.bottom - (all.length - 1 - i) * bigLevel.size * 0.98).toFixed(2)} font="display-700" size={bigLevel.size} ls={0.4} fill={th.ink}>
              {line}
            </Txt>
          ))
        ) : (
          <Txt x={LEFT} y={LEVEL.y} font="display-700" size={level.size} ls={level.letterSpacing} fill={th.ink}>
            {level.text}
          </Txt>
        )}
        {badge && th.badge && (
          <g>
            <rect x={LEFT} y={badgeY} width={+(badge.width + 14).toFixed(2)} height={22} rx={11} fill={th.badge.bg} />
            <Txt x={LEFT + 7} y={badgeY + 15.3} font="sans-600" size={badge.size} ls={badge.letterSpacing} fill={th.badge.ink}>
              {badge.text}
            </Txt>
          </g>
        )}

        {/* Photo d'identité judiciaire */}
        <g clipPath={u("mug")}>
          <Toise x={M.x} y={M.y} w={M.w} h={M.h} gray={th.gray} coverTop={toiseCover(M.h, !!avatar)} />
          {avatar ? (
            <image href={avatar} x={M.x + MUG_PHOTO.inset} y={M.y + M.h - MUG_PHOTO.h} width={MUG_PHOTO.w} height={MUG_PHOTO.h} preserveAspectRatio="xMidYMin slice" filter={u("photo")} />
          ) : (
            // Sous le tampon (fiche lue sur LinkedIn ou un CV), la silhouette descend : le tampon ne couvre pas les initiales.
            <Silhouette x={M.x} y={M.y + (stamped ? STAMP.drop : 0)} w={M.w} h={M.h} gray={th.gray} initials={plateInitials(card) || card.initials} />
          )}
          {stamped && (
            <g transform={`translate(${M.x + M.w / 2} ${M.y + (avatar ? STAMP.y : STAMP.yBare)}) rotate(-9)`} opacity={0.88}>
              <rect x={-64} y={-16} width={128} height={32} rx={3} fill="none" stroke="#a3261b" strokeWidth={2.2} />
              <rect x={-60} y={-12} width={120} height={24} rx={1.5} fill="none" stroke="#a3261b" strokeWidth={0.8} />
              <Txt x={0} y={5.4} font="display-800" size={15.5} ls={1.4} anchor="middle" fill="#a3261b">
                {fit(card.declaredSource === "linkedin" ? s.linkedinStamp : s.cvStamp, { font: "display-800", size: 15.5, minSize: MIN_TEXT, maxWidth: 108, letterSpacing: 1.4, minLetterSpacing: 0.4 }).text}
              </Txt>
            </g>
          )}
          <Plate x={M.x} y={M.y} w={M.w} h={M.h} name={plateName(card, lang)} sub={plateSub(card.id, card.createdAt, lang)} />
        </g>
        <rect x={M.x + 0.5} y={M.y + 0.5} width={M.w - 1} height={M.h - 1} rx={M.r} fill="none" stroke="#fff" strokeOpacity={0.14} />

        {/* Profil criminel : le nom d'une page personnage, puis l'accroche en lilas (le rose ne décore pas) */}
        {profileName && (
          <Txt x={LEFT - 1} y={LAYOUT.profileName.y + nameDrop} font="display-700" size={profileName.size} ls={profileName.letterSpacing} fill={th.ink}>
            {profileName.text}
          </Txt>
        )}
        {tagline &&
          tagline.lines.map((line, i) => (
            <Txt key={i} x={LEFT} y={LAYOUT.tagline.y + nameDrop + i * LAYOUT.tagline.lineH} font="sans-600" size={tagline.size} fill={th.inkSoft}>
              {line}
            </Txt>
          ))}

        {/* Spécialité, arme, affiliation */}
        <rect x={LEFT} y={LAYOUT.divider} width={FW} height={1} fill="#fff" fillOpacity={0.12} />
        {cols.map((c) => {
          const v = fit(c.value, { font: "sans-600", size: 13, minSize: MIN_TEXT, maxWidth: c.w });
          const label = fit(upper(c.label, lang), { font: "sans-600", size: LAYOUT.facts.labelSize, minSize: LAYOUT.facts.labelSize, maxWidth: c.w, letterSpacing: 0.8, minLetterSpacing: 0 });
          return (
            <g key={c.label}>
              <Txt x={c.x} y={LAYOUT.facts.labelY} font="sans-600" size={label.size} ls={label.letterSpacing} fill={th.inkSoft} opacity={0.7}>
                {label.text}
              </Txt>
              <Txt x={c.x} y={LAYOUT.facts.valueY} font="sans-600" size={v.size} fill={th.ink}>
                {v.text}
              </Txt>
            </g>
          );
        })}

        {/* Six traits en barres de dix segments */}
        <Txt x={LEFT} y={LAYOUT.traits.labelY} font="sans-600" size={traits.size} ls={traits.letterSpacing} fill={th.inkSoft} opacity={0.7}>
          {traits.text}
        </Txt>
        {stats.map((st, i) => (
          <StatRow key={st.code} stat={st} x={LEFT + (i < 3 ? 0 : 169)} y={LAYOUT.stats.y + (i % 3) * LAYOUT.stats.rowH} th={th} />
        ))}

        <Charges statuses={card.statuses} th={th} lang={lang} />

        <Txt x={LEFT} y={LAYOUT.footer.y} font="mono-400" size={footerFit.size} ls={footerFit.letterSpacing} fill={th.inkSoft} opacity={0.82}>
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
