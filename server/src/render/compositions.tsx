// Compositions des images partagées : carte seule, aperçu de lien 1200 × 630,
// portrait 1080 × 1350, et leurs variantes « comparaison ». Tout est en SVG,
// la carte y est imbriquée telle quelle (même composant qu'à l'écran).
import type { CardData, ComparisonData, Lang, StatCode } from "../../../shared/types";
import { STAT_CODES } from "../../../shared/types";
import { CardGraphic } from "../../../shared/card/Card";
import { AzeritGem } from "../../../shared/card/AzeritGem";
import { fontAttrs } from "../../../shared/card/fonts";
import { CARD_H, CARD_PATH, CARD_W } from "../../../shared/card/geometry";
import { t } from "../../../shared/card/i18n";
import { fit, measure, upper, wrap } from "../../../shared/card/text";
import { themeOf } from "../../../shared/card/themes";

const BG = "#0a0f16";
const TEXT = "#e6ecf2";
const MUTED = "#8494a5";
const TEAL = "#52d0bd";
const BLUE = "#6cb6ff";
const RED = "#ff8b7b";
const AMBER = "#ffc861";

export interface Avatars {
  [cardId: string]: string | undefined;
}

/** Data URI de l'avatar, ou "" pour forcer les initiales (jamais d'URL distante dans resvg). */
const av = (avatars: Avatars, id: string) => avatars[id] ?? "";

/** Hôte affiché dans la ligne d'appel (BASE_URL sans protocole). */
export function ctaHost(): string {
  const raw = process.env.BASE_URL;
  if (!raw) return "skills.azerit.tech";
  try {
    return new URL(raw).host;
  } catch {
    return raw.replace(/^https?:\/\//, "").replace(/\/$/, "");
  }
}

/** Couleur claire représentative du néon d'une fiche (lumière du fond). */
function lightOf(card: CardData): string {
  return themeOf(card).accent;
}

/* ------------------------------------------------------------------ */

function Backdrop({ w, h, glows, id }: { w: number; h: number; glows: { x: number; y: number; r: number; color: string; o: number }[]; id: string }) {
  return (
    <>
      <defs>
        {glows.map((g, i) => (
          <radialGradient key={i} id={`${id}-g${i}`} cx={g.x} cy={g.y} r={g.r} gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor={g.color} stopOpacity={g.o} />
            <stop offset="0.5" stopColor={g.color} stopOpacity={g.o * 0.3} />
            <stop offset="1" stopColor={g.color} stopOpacity={0} />
          </radialGradient>
        ))}
        <radialGradient id={`${id}-teal`} cx={0} cy={0} r={w * 0.7} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={TEAL} stopOpacity={0.16} />
          <stop offset="1" stopColor={TEAL} stopOpacity={0} />
        </radialGradient>
        <radialGradient id={`${id}-blue`} cx={w} cy={h} r={w * 0.7} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={BLUE} stopOpacity={0.12} />
          <stop offset="1" stopColor={BLUE} stopOpacity={0} />
        </radialGradient>
        <pattern id={`${id}-dots`} width="22" height="22" patternUnits="userSpaceOnUse">
          <circle cx="11" cy="11" r="1" fill="#ffffff" />
        </pattern>
        <radialGradient id={`${id}-dotfade`} cx={w / 2} cy={h / 2} r={Math.max(w, h) * 0.62} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" stopOpacity={0.7} />
          <stop offset="1" stopColor="#fff" stopOpacity={0} />
        </radialGradient>
        <mask id={`${id}-dotmask`} maskUnits="userSpaceOnUse" x="0" y="0" width={w} height={h}>
          <rect width={w} height={h} fill={`url(#${id}-dotfade)`} />
        </mask>
        <filter id={`${id}-noise`} x="0" y="0" width={w} height={h} filterUnits="userSpaceOnUse">
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves={2} seed={8} result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  2.2 0 0 0 -1.05" />
        </filter>
        <linearGradient id={`${id}-vig`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity={0.35} />
          <stop offset="0.25" stopColor="#000" stopOpacity={0} />
          <stop offset="0.75" stopColor="#000" stopOpacity={0} />
          <stop offset="1" stopColor="#000" stopOpacity={0.45} />
        </linearGradient>
      </defs>
      <rect width={w} height={h} fill={BG} />
      <rect width={w} height={h} fill={`url(#${id}-teal)`} />
      <rect width={w} height={h} fill={`url(#${id}-blue)`} />
      <rect width={w} height={h} fill={`url(#${id}-dots)`} opacity={0.07} mask={`url(#${id}-dotmask)`} />
      {glows.map((_, i) => (
        <rect key={i} width={w} height={h} fill={`url(#${id}-g${i})`} />
      ))}
      <rect width={w} height={h} filter={`url(#${id}-noise)`} opacity={0.035} />
      <rect width={w} height={h} fill={`url(#${id}-vig)`} />
    </>
  );
}

/** Ombre portée de la silhouette, sous une carte placée en (x, y) de largeur w. */
function CardShadow({ x, y, w, id }: { x: number; y: number; w: number; id: string }) {
  const s = w / CARD_W;
  return (
    <>
      <defs>
        <filter id={`${id}-sh`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation={10 / s > 0 ? 14 : 14} />
        </filter>
      </defs>
      <g transform={`translate(${x} ${y + w * 0.05}) scale(${s})`}>
        <path d={CARD_PATH} fill="#000" opacity={0.7} filter={`url(#${id}-sh)`} transform="translate(0 6)" />
      </g>
    </>
  );
}

/** Lueur au sol sous la pointe de la carte. */
function FloorGlow({ x, y, rx, color, id }: { x: number; y: number; rx: number; color: string; id: string }) {
  return (
    <>
      <defs>
        <radialGradient id={`${id}-floor`} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform={`translate(${x} ${y}) scale(${rx} ${rx * 0.09})`}>
          <stop offset="0" stopColor={color} stopOpacity={0.45} />
          <stop offset="0.4" stopColor={color} stopOpacity={0.14} />
          <stop offset="1" stopColor={color} stopOpacity={0} />
        </radialGradient>
      </defs>
      <ellipse cx={x} cy={y} rx={rx} ry={rx * 0.09} fill={`url(#${id}-floor)`} />
    </>
  );
}

function Brand({ x, y, anchor = "start", size = 1 }: { x: number; y: number; id: string; anchor?: "start" | "middle"; size?: number }) {
  const label = "TESTYOURSKILLS";
  const fs = 15 * size;
  const ls = 4 * size;
  const tw = measure(label, "mono-700", fs, ls);
  const gemH = 26 * size;
  const gemW = gemH * (104 / 120);
  const total = gemW + 12 * size + tw;
  const x0 = anchor === "middle" ? x - total / 2 : x;
  return (
    <g>
      <AzeritGem x={x0} y={y - gemH * 0.78} h={gemH} />
      <text x={x0 + gemW + 12 * size} y={y} {...fontAttrs("mono-700")} fontSize={fs} letterSpacing={ls} fill={TEXT} fillOpacity={0.82}>
        {label}
      </text>
    </g>
  );
}

/** « Fais la tienne → skills.azerit.tech » ; la flèche est dessinée (absente des TTF). */
function Cta({ x, y, lang, anchor = "start", size = 1 }: { x: number; y: number; lang: Lang; anchor?: "start" | "middle"; size?: number }) {
  const s = t(lang);
  const fs = 20 * size;
  const ls = 0.4 * size;
  const host = ctaHost();
  const w1 = measure(s.cta, "mono-500", fs, ls);
  const arrow = 26 * size;
  const w2 = measure(host, "mono-500", fs, ls);
  const total = w1 + arrow + w2;
  const x0 = anchor === "middle" ? x - total / 2 : x;
  const ay = y - fs * 0.34;
  return (
    <g>
      <text x={x0} y={y} {...fontAttrs("mono-500")} fontSize={fs} letterSpacing={ls} fill={MUTED}>
        {s.cta}
      </text>
      <path
        d={`M${x0 + w1 + 6 * size} ${ay} H${x0 + w1 + arrow - 7 * size} M${x0 + w1 + arrow - 12 * size} ${ay - 5 * size} L${x0 + w1 + arrow - 7 * size} ${ay} L${x0 + w1 + arrow - 12 * size} ${ay + 5 * size}`}
        fill="none"
        stroke={TEAL}
        strokeWidth={2 * size}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <text x={x0 + w1 + arrow} y={y} {...fontAttrs("mono-500")} fontSize={fs} letterSpacing={ls} fill={TEXT}>
        {host}
      </text>
    </g>
  );
}

function tierKicker(card: CardData, lang: Lang): string {
  const th = themeOf(card);
  return upper(`${th.label[lang]} · ${card.overall}`, lang);
}

function mainStatus(card: CardData, lang: Lang): string | null {
  const st = card.statuses.find((x) => x.tone !== "positive") ?? card.statuses[0];
  return st ? st.label[lang] ?? st.label.fr : null;
}

/* ------------------------------------------------------------------ */
/* Carte seule                                                          */
/* ------------------------------------------------------------------ */

export function CardOnly({ card, lang, avatars }: { card: CardData; lang: Lang; avatars: Avatars }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={CARD_W} height={CARD_H} viewBox={`0 0 ${CARD_W} ${CARD_H}`}>
      <CardGraphic card={card} lang={lang} avatarHref={av(avatars, card.id)} idPrefix="c" x={0} y={0} width={CARD_W} height={CARD_H} />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Aperçu de lien 1200 × 630                                            */
/* ------------------------------------------------------------------ */

export function OgImage({ card, lang, avatars }: { card: CardData; lang: Lang; avatars: Avatars }) {
  const W = 1200;
  const H = 630;
  const ch = 566;
  const cw = (ch * CARD_W) / CARD_H;
  const cx = 104;
  const cy = 32;
  const s = t(lang);
  const th = themeOf(card);
  const light = lightOf(card);
  const tx = 600;
  const maxW = 540;
  const name = fit(upper(card.name, lang), { font: "display-700", size: 84, minSize: 50, maxWidth: maxW, letterSpacing: 0.5 });
  const quote = mainStatus(card, lang);
  const quoted = quote ? (lang === "fr" ? `«\u00a0${quote}\u00a0»` : `“${quote}”`) : "";
  const qLines = quote ? wrap(quoted, "sans-600", 34, maxW, 2) : [];
  const kicker = tierKicker(card, lang);
  const kickColor = th.ink;
  const footer = `${s.judged(card.judgedInSeconds)} · ${s.reliability} ${s.percent(card.reliability)}`;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <Backdrop w={W} h={H} id="og" glows={[{ x: cx + cw / 2, y: cy + ch * 0.42, r: 420, color: light, o: 0.32 }]} />
      <CardShadow x={cx} y={cy} w={cw} id="og" />
      <CardGraphic card={card} lang={lang} avatarHref={av(avatars, card.id)} idPrefix="ogc" x={cx} y={cy} width={cw} height={ch} />

      <Brand x={tx} y={96} id="og" />
      <text x={tx} y={172} {...fontAttrs("mono-700")} fontSize={18} letterSpacing={4} fill={kickColor}>
        {kicker}
      </text>
      <text x={tx} y={272} {...fontAttrs("display-700")} fontSize={name.size} letterSpacing={name.letterSpacing} fill={TEXT}>
        {name.text}
      </text>
      <rect x={tx} y={296} width={64} height={3} rx={1.5} fill={TEAL} />
      {qLines.map((l, i) => (
        <text key={i} x={tx} y={362 + i * 44} {...fontAttrs("sans-600")} fontSize={34} fill={TEXT} fillOpacity={0.92}>
          {l}
        </text>
      ))}
      <text x={tx} y={362 + Math.max(1, qLines.length) * 44 + 12} {...fontAttrs("mono-400")} fontSize={17} fill={MUTED}>
        {footer}
      </text>
      <Cta x={tx} y={574} lang={lang} />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Portrait 1080 × 1350                                                 */
/* ------------------------------------------------------------------ */

export function PortraitImage({ card, lang, avatars }: { card: CardData; lang: Lang; avatars: Avatars }) {
  const W = 1080;
  const H = 1350;
  const cw = 736;
  const ch = (cw * CARD_H) / CARD_W;
  const cx = (W - cw) / 2;
  const cy = 176;
  const light = lightOf(card);
  const th = themeOf(card);
  const kicker = tierKicker(card, lang);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <Backdrop w={W} h={H} id="pt" glows={[{ x: W / 2, y: cy + ch * 0.4, r: 640, color: light, o: 0.34 }]} />
      <Brand x={W / 2} y={82} id="pt" anchor="middle" size={1.1} />
      <text x={W / 2} y={136} {...fontAttrs("mono-700")} fontSize={21} letterSpacing={5} textAnchor="middle" fill={th.ink}>
        {kicker}
      </text>
      <FloorGlow x={W / 2} y={cy + ch + 6} rx={cw * 0.55} color={light} id="pt" />
      <CardShadow x={cx} y={cy} w={cw} id="pt" />
      <CardGraphic card={card} lang={lang} avatarHref={av(avatars, card.id)} idPrefix="ptc" x={cx} y={cy} width={cw} height={ch} />
      <Cta x={W / 2} y={1306} lang={lang} anchor="middle" size={1.2} />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Comparaison                                                          */
/* ------------------------------------------------------------------ */

function deltaColor(code: StatCode, d: number): string {
  if (code === "BUZZ") return AMBER;
  if (d > 0) return TEAL;
  if (d < 0) return RED;
  return MUTED;
}

function signed(d: number): string {
  return d > 0 ? `+${d}` : d < 0 ? `−${-d}` : "0";
}

/** Colonne verticale des écarts par stat. */
function DeltaColumn({ cmp, x, y, rowH, w }: { cmp: ComparisonData; x: number; y: number; rowH: number; w: number }) {
  return (
    <g>
      {STAT_CODES.map((code, i) => {
        const d = cmp.deltas[code];
        const c = deltaColor(code, d);
        const cy = y + i * rowH;
        return (
          <g key={code}>
            <rect x={x - w / 2} y={cy - 17} width={w} height={34} rx={17} fill={c} fillOpacity={0.1} stroke={c} strokeOpacity={0.45} strokeWidth={1} />
            <text x={x - w / 2 + 18} y={cy + 6} {...fontAttrs("mono-500")} fontSize={15} letterSpacing={1} fill={MUTED}>
              {code}
            </text>
            <text x={x + w / 2 - 18} y={cy + 8} {...fontAttrs("display-800")} fontSize={24} textAnchor="end" fill={c}>
              {signed(d)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function SideLabel({ x, y, text, color, size = 14 }: { x: number; y: number; text: string; color: string; size?: number }) {
  return (
    <text x={x} y={y} {...fontAttrs("mono-700")} fontSize={size} letterSpacing={size * 0.22} textAnchor="middle" fill={color}>
      {text}
    </text>
  );
}

export function ComparisonOg({ cmp, lang, avatars }: { cmp: ComparisonData; lang: Lang; avatars: Avatars }) {
  const W = 1200;
  const H = 630;
  const ch = 432;
  const cw = (ch * CARD_W) / CARD_H;
  const cy = 136;
  const lx = 150;
  const rx = W - 150 - cw;
  const s = t(lang);
  const head = fit(upper(cmp.headline[lang], lang), { font: "display-700", size: 46, minSize: 30, maxWidth: 1080, letterSpacing: 0.4 });
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <Backdrop
        w={W}
        h={H}
        id="cog"
        glows={[
          { x: lx + cw / 2, y: cy + ch * 0.45, r: 300, color: lightOf(cmp.cv), o: 0.24 },
          { x: rx + cw / 2, y: cy + ch * 0.45, r: 300, color: lightOf(cmp.github), o: 0.24 },
        ]}
      />
      <text x={W / 2} y={70} {...fontAttrs("display-700")} fontSize={head.size} letterSpacing={head.letterSpacing} textAnchor="middle" fill={TEXT}>
        {head.text}
      </text>
      <SideLabel x={lx + cw / 2} y={120} text={upper(s.cvSide, lang)} color={MUTED} size={12} />
      <SideLabel x={rx + cw / 2} y={120} text={upper(s.githubSide, lang)} color={TEAL} size={12} />
      <CardShadow x={lx} y={cy} w={cw} id="cog-l" />
      <CardShadow x={rx} y={cy} w={cw} id="cog-r" />
      <CardGraphic card={cmp.cv} lang={lang} avatarHref={av(avatars, cmp.cv.id)} idPrefix="cogcv" x={lx} y={cy} width={cw} height={ch} />
      <CardGraphic card={cmp.github} lang={lang} avatarHref={av(avatars, cmp.github.id)} idPrefix="coggh" x={rx} y={cy} width={cw} height={ch} />
      <DeltaColumn cmp={cmp} x={W / 2} y={cy + 52} rowH={64} w={150} />
      <Cta x={W / 2} y={606} lang={lang} anchor="middle" size={0.8} />
    </svg>
  );
}

export function ComparisonPortrait({ cmp, lang, avatars }: { cmp: ComparisonData; lang: Lang; avatars: Avatars }) {
  const W = 1080;
  const H = 1350;
  const cw = 478;
  const ch = (cw * CARD_H) / CARD_W;
  const gap = 44;
  const lx = (W - 2 * cw - gap) / 2;
  const rx = lx + cw + gap;
  const cy = 352;
  const s = t(lang);
  // le titre doit tenir en deux lignes : on réduit avant de tronquer
  const head = upper(cmp.headline[lang], lang);
  let hs = 70;
  let lines = wrap(head, "display-700", hs, 960, 2, 0.4);
  while (hs > 48 && lines[lines.length - 1].endsWith("…")) {
    hs -= 4;
    lines = wrap(head, "display-700", hs, 960, 2, 0.4);
  }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <Backdrop
        w={W}
        h={H}
        id="cpt"
        glows={[
          { x: lx + cw / 2, y: cy + ch * 0.45, r: 420, color: lightOf(cmp.cv), o: 0.24 },
          { x: rx + cw / 2, y: cy + ch * 0.45, r: 420, color: lightOf(cmp.github), o: 0.24 },
        ]}
      />
      <Brand x={W / 2} y={92} id="cpt" anchor="middle" />
      {lines.map((l, i) => (
        <text key={i} x={W / 2} y={(lines.length === 1 ? 225 : 190) + i * hs * 1.03} {...fontAttrs("display-700")} fontSize={hs} letterSpacing={0.4} textAnchor="middle" fill={TEXT}>
          {l}
        </text>
      ))}
      <SideLabel x={lx + cw / 2} y={cy - 22} text={upper(s.cvSide, lang)} color={MUTED} size={15} />
      <SideLabel x={rx + cw / 2} y={cy - 22} text={upper(s.githubSide, lang)} color={TEAL} size={15} />
      <CardShadow x={lx} y={cy} w={cw} id="cpt-l" />
      <CardShadow x={rx} y={cy} w={cw} id="cpt-r" />
      <CardGraphic card={cmp.cv} lang={lang} avatarHref={av(avatars, cmp.cv.id)} idPrefix="cptcv" x={lx} y={cy} width={cw} height={ch} />
      <CardGraphic card={cmp.github} lang={lang} avatarHref={av(avatars, cmp.github.id)} idPrefix="cptgh" x={rx} y={cy} width={cw} height={ch} />
      <DeltaRow cmp={cmp} y={cy + ch + 70} W={W} />
      <Cta x={W / 2} y={1296} lang={lang} anchor="middle" size={1.15} />
    </svg>
  );
}

function DeltaRow({ cmp, y, W }: { cmp: ComparisonData; y: number; W: number }) {
  const w = 148;
  const gap = 14;
  const total = STAT_CODES.length * w + (STAT_CODES.length - 1) * gap;
  const x0 = (W - total) / 2;
  return (
    <g>
      {STAT_CODES.map((code, i) => {
        const d = cmp.deltas[code];
        const c = deltaColor(code, d);
        const x = x0 + i * (w + gap);
        return (
          <g key={code}>
            <rect x={x} y={y - 30} width={w} height={60} rx={14} fill={c} fillOpacity={0.1} stroke={c} strokeOpacity={0.45} strokeWidth={1.2} />
            <text x={x + 18} y={y + 7} {...fontAttrs("mono-500")} fontSize={17} letterSpacing={1} fill={MUTED}>
              {code}
            </text>
            <text x={x + w - 18} y={y + 12} {...fontAttrs("display-800")} fontSize={34} textAnchor="end" fill={c}>
              {signed(d)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/** Les deux cartes côte à côte et les écarts, fond transparent. */
export function ComparisonCard({ cmp, lang, avatars }: { cmp: ComparisonData; lang: Lang; avatars: Avatars }) {
  const W = CARD_W * 2 + 220;
  const H = CARD_H;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <CardGraphic card={cmp.cv} lang={lang} avatarHref={av(avatars, cmp.cv.id)} idPrefix="cccv" x={0} y={0} width={CARD_W} height={CARD_H} />
      <CardGraphic card={cmp.github} lang={lang} avatarHref={av(avatars, cmp.github.id)} idPrefix="ccgh" x={W - CARD_W} y={0} width={CARD_W} height={CARD_H} />
      <DeltaColumn cmp={cmp} x={W / 2} y={110} rowH={62} w={150} />
    </svg>
  );
}
