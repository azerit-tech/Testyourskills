// Compositions des images partagées : carte seule, aperçu de lien 1200 × 630,
// portrait 1080 × 1350, story 1080 × 1920, et l'aperçu de lien de l'accueil
// (la promesse et la fiche de la vitrine). Un dossier à deux pièces prend celles
// d'une fiche (§18.36). Tout est en SVG, la carte y est imbriquée telle quelle (même composant qu'à l'écran).
// Style mat (SPEC §18.18) dans la langue de la couverture de l'accueil (§18.31) :
// une page d'encre, le lieu du crime du profil (§18.28) en panneau ou en ciel
// de bord à bord, et AUCUN dégradé en plus de celui de la fiche. Le texte posé
// sur un ciel suit son heure (shared/scenes.ts). Sans fichier de décor, le front
// de mer dessiné ci-dessous le remplace. Seule lumière : le halo de ★★★★★★, un
// rectangle flou derrière la fiche (le drop-shadow CSS de l'écran ne passe pas dans le PNG).
// Chaque image se juge réduite à 360 px de large, sa taille dans un fil sur
// téléphone (§18.48) : les étoiles, le niveau, « Avis de recherche » et l'appel
// s'y lisent. Les étoiles suivent la règle du site (StarRow), le rose poudré ne
// sert qu'à l'appel (CtaPill), la citation est pêche.
import { LEVEL_LABELS, starsFor, type CardData, type Lang } from "../../../shared/types";
import { AzeritGem } from "../../../shared/card/AzeritGem";
import { CardGraphic } from "../../../shared/card/Card";
import { fontAttrs } from "../../../shared/card/fonts";
import { CARD_H, CARD_R, CARD_W } from "../../../shared/card/geometry";
import { t } from "../../../shared/card/i18n";
import { fit, fitLines, measure, upper, wrap } from "../../../shared/card/text";
import { PALETTE, themeOf } from "../../../shared/card/themes";
import { HOME_PROMISE } from "../../../shared/promise";
import { SUNSET as SCENE, skyline } from "../../../shared/sunset";
import type { SceneImage } from "./scenes";

const PALM = "M46 140c2-34 5-62 12-86l4 1c-8 24-11 52-12 85zM60 54C40 38 20 38 4 50c18-4 36 0 56 7zM60 54C36 56 18 68 10 88c14-14 30-22 50-30zM60 54c18-22 40-28 60-20-20 0-40 8-60 24zM60 54c26-2 44 10 54 30-14-14-32-22-54-26zM60 54c-6-22-2-40 8-52-2 16 0 32-4 50zM60 54c10-20 26-32 44-34-16 8-30 20-42 36zM60 54c-14-14-18-30-14-48 4 16 10 30 16 46z";

export interface Avatars {
  [cardId: string]: string | undefined;
}

/** Data URI de l'avatar, ou "" pour forcer les initiales (jamais d'URL distante dans resvg). */
const av = (avatars: Avatars, id: string) => avatars[id] ?? "";

/** Hôte affiché dans l'appel (BASE_URL sans protocole). Jamais vide : un BASE_URL réduit à « / » (les tests) rend l'adresse du site. */
export function ctaHost(): string {
  const site = "skills.azerit.tech";
  const raw = process.env.BASE_URL;
  if (!raw) return site;
  try {
    return new URL(raw).host || site;
  } catch {
    return raw.replace(/^https?:\/\//, "").replace(/\/$/, "") || site;
  }
}

/* ------------------------------------------------------------------ */
/* Décor                                                                */
/* ------------------------------------------------------------------ */

function Palm({ x, y, k, flip }: { x: number; y: number; k: number; flip?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -k : k} ${k})`} fill={SCENE.palm}>
      <path d={PALM} />
    </g>
  );
}

/** Le front de mer au crépuscule, en aplats : ciel, soleil, deux rangées d'immeubles, palmiers, sol. */
function Scene({ w, h, horizon, sun, maxH, palms }: { w: number; h: number; horizon: number; sun: { x: number; y: number; r: number }; maxH: number; palms: { x: number; y: number; k: number; flip?: boolean }[] }) {
  return (
    <g>
      <rect width={w} height={h} fill={SCENE.sky} />
      <circle cx={sun.x} cy={sun.y} r={sun.r} fill={SCENE.sun} />
      {skyline(w, horizon, SCENE.far, 7, maxH, false)}
      {palms.map((p, i) => (
        <Palm key={i} {...p} />
      ))}
      {skyline(w, horizon, SCENE.near, 31, maxH * 0.8, true)}
      <rect y={horizon} width={w} height={h - horizon} fill={SCENE.ground} />
    </g>
  );
}

/** Fond d'encre plat. */
export function Ink({ w, h }: { w: number; h: number }) {
  return <rect width={w} height={h} fill={PALETTE.ink0} />;
}

/** Halo extérieur de ★★★★★★ : un rectangle flou derrière la fiche, rien pour les autres niveaux. */
function CardHalo({ card, x, y, w, id }: { card: CardData; x: number; y: number; w: number; id: string }) {
  if (!themeOf(card).rim) return null;
  const s = w / CARD_W;
  const h = CARD_H * s;
  const blur = 10 * s;
  return (
    <>
      <defs>
        <filter id={`${id}-halo`} x={x - blur * 4} y={y - blur * 4} width={w + blur * 8} height={h + blur * 8} filterUnits="userSpaceOnUse">
          <feGaussianBlur stdDeviation={blur} />
        </filter>
      </defs>
      <rect x={x - 2 * s} y={y - 2 * s} width={w + 4 * s} height={h + 4 * s} rx={(CARD_R + 2) * s} fill={PALETTE.rimGlow} fillOpacity={0.55} filter={`url(#${id}-halo)`} />
      <rect x={x - 0.6 * s} y={y - 0.6 * s} width={w + 1.2 * s} height={h + 1.2 * s} rx={(CARD_R + 0.6) * s} fill="none" stroke={PALETTE.rimCore} strokeWidth={1.2 * s} />
    </>
  );
}

/** La fiche posée dans une composition, avec son halo si elle est ★★★★★★. */
export function Placed({ card, lang, avatars, id, x, y, w }: { card: CardData; lang: Lang; avatars: Avatars; id: string; x: number; y: number; w: number }) {
  return (
    <>
      <CardHalo card={card} x={x} y={y} w={w} id={id} />
      <CardGraphic card={card} lang={lang} avatarHref={av(avatars, card.id)} idPrefix={`${id}c`} x={x} y={y} width={w} height={(w * CARD_H) / CARD_W} />
    </>
  );
}

/** L'étoile du site, dans une boîte de 24 : le tracé de la fiche et des classements. */
export const STAR_PATH = "M12 2.6l2.9 6.1 6.7.8-4.9 4.6 1.3 6.6L12 17.4l-6 3.3 1.3-6.6L2.4 9.5l6.7-.8z";
/** Le tracé laisse 2,4 unités de marge à gauche de sa boîte de 24. */
const STAR_INSET = 2.4 / 24;
/** Contour d'une étoile éteinte : 1,5 px pour une étoile de 22 (§18.48), à l'échelle. */
const STAR_STROKE = (1.5 / 22) * 24;

/**
 * Six étoiles, la règle unique du site (§18.48) : remplies de gauche à droite,
 * allumée en crème pleine, éteinte en contour blanc à 35 %, sans remplissage.
 * `x` est le bord visible de la première étoile (calé sur un texte), `y` le haut de la rangée.
 */
export function StarRow({ n, x, y, size, gap = Math.round(size * 0.12) }: { n: number; x: number; y: number; size: number; gap?: number }) {
  const k = size / 24;
  // Le contour est à cheval sur le tracé : l'étoile éteinte est rentrée d'autant, pour garder la taille de l'allumée.
  const inner = (24 - STAR_STROKE) / 24;
  return (
    <g data-star-row={n}>
      {Array.from({ length: 6 }, (_, i) => (
        <g key={i} transform={`translate(${+(x - STAR_INSET * size + i * (size + gap)).toFixed(2)} ${y}) scale(${+k.toFixed(4)})`}>
          {i < n ? (
            <path d={STAR_PATH} fill={PALETTE.cream} />
          ) : (
            <path d={STAR_PATH} transform={`translate(12 12) scale(${+inner.toFixed(4)}) translate(-12 -12)`} fill="none" stroke="#ffffff" strokeOpacity={0.35} strokeWidth={+STAR_STROKE.toFixed(3)} strokeLinejoin="round" />
          )}
        </g>
      ))}
    </g>
  );
}

/** Largeur visible d'une rangée de six étoiles. */
export const starRowWidth = (size: number, gap = Math.round(size * 0.12)) => 6 * size + 5 * gap - 2 * STAR_INSET * size;

/**
 * Les textes propres aux images. L'appel d'une fiche (« Fais la tienne ») et
 * « Avis de recherche » restent ceux de la fiche (shared/card/i18n.ts).
 */
export const IMAGE_WORDS: Record<Lang, { what: string; home: string; band: string; prime: string; primeClosed: string }> = {
  fr: {
    what: "Une fiche de dev, de une à six étoiles, en une minute.",
    home: "Fais ta fiche",
    band: "Rejoins la bande",
    prime: "Entre dans la course",
    primeClosed: "Voir le classement",
  },
  en: {
    what: "A dev rap sheet, one to six stars, in one minute.",
    home: "Get your rap sheet",
    band: "Join the crew",
    prime: "Enter the race",
    primeClosed: "See the ranking",
  },
};

/** Surtitre « AVIS DE RECHERCHE » : crème atténué sur l'encre, plein dans la couleur du ciel quand il s'y pose. */
function Poster({ x, y, size, lang, anchor = "middle", fill = PALETTE.cream, opacity = 0.6 }: { x: number; y: number; size: number; lang: Lang; anchor?: "start" | "middle"; fill?: string; opacity?: number }) {
  const ls = size * 0.34;
  return (
    <text x={anchor === "middle" ? x + ls / 2 : x} y={y} {...fontAttrs("sans-600")} fontSize={size} letterSpacing={ls} textAnchor={anchor} fill={fill} fillOpacity={opacity}>
      {upper(t(lang).poster, lang)}
    </text>
  );
}

/** « AVIS DE RECHERCHE » en titre d'affiche, pour les aperçus de lien : capitales
 *  condensées, crème pleine, calé à gauche. À 360 px de large il se lit encore. */
function PosterTitle({ x, y, size, lang }: { x: number; y: number; size: number; lang: Lang }) {
  return (
    <text x={x} y={y} {...fontAttrs("display-700")} fontSize={size} letterSpacing={+(size * 0.12).toFixed(2)} fill={PALETTE.cream}>
      {upper(t(lang).poster, lang)}
    </text>
  );
}

/**
 * Le surtitre d'une image de bande ou de prime, signé : la gemme et « AZERIT »
 * (le dessin de la barre du site, 28 de haut), puis « · BANDE D'ÉCOLE ». Sur
 * l'image d'une fiche, la marque est déjà dans la fiche.
 */
export function BrandKicker({ x, y, size, text }: { x: number; y: number; size: number; text: string }) {
  const ls = size * 0.26;
  const gemH = 28;
  const brand = "AZERIT";
  const tx = x + Math.round(gemH * 0.87) + 10;
  const brandW = measure(brand, "sans-600", size, ls);
  return (
    <g data-brand="">
      <AzeritGem x={x} y={+(y - size * 0.35 - gemH / 2).toFixed(1)} h={gemH} />
      <text x={tx} y={y} {...fontAttrs("sans-600")} fontSize={size} letterSpacing={+ls.toFixed(2)} fill={PALETTE.cream}>
        {brand}
      </text>
      <text x={+(tx + brandW + ls + size * 0.3).toFixed(1)} y={y} {...fontAttrs("sans-600")} fontSize={size} letterSpacing={+ls.toFixed(2)} fill={PALETTE.cream} fillOpacity={0.7}>
        {`· ${text}`}
      </text>
    </g>
  );
}

/** Le format des décors (1152 × 768, 576 × 384). */
const SCENE_RATIO = 3 / 2;

/** Le cadre des aperçus d'une bande et d'une prime sur le décor par défaut : la ligne d'immeubles et son reflet. */
export const SKYLINE_FOCUS = { zoom: 2, x: 0.6, y: 0.51 };

/**
 * Le lieu du crime dans un cadre : l'image recadrée pour le remplir (`slice`), centrée
 * (`xMidYMid`, le sujet est au centre de l'illustration) ou calée en haut (`xMidYMin`,
 * le ciel reste). Sans fichier, le front de mer dessiné. `r` : coins du panneau.
 * `focus` resserre le cadre sur une partie du décor (les décors sont en 3:2) :
 * `zoom` au-delà du remplissage, puis le point de l'image (`x`, `y`, de 0 à 1)
 * amené au centre du panneau. Il sert à laisser hors champ le ciel vide du haut
 * et le sol plat et sombre du bas.
 */
export function SceneFrame({ scene, id, x, y, w, h, align, r = 0, focus }: { scene: SceneImage | null | undefined; id: string; x: number; y: number; w: number; h: number; align: "xMidYMid" | "xMidYMin"; r?: number; focus?: { zoom: number; x: number; y: number } }) {
  const clip = `${id}-frame`;
  // Le rectangle de l'image entière, quand le cadre est resserré : jamais de vide dans le panneau.
  let image = { x, y, w, h };
  if (focus) {
    const iw = Math.max(w, h * SCENE_RATIO) * focus.zoom;
    const ih = iw / SCENE_RATIO;
    const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
    image = { x: Math.round(clamp(x + w / 2 - focus.x * iw, x + w - iw, x)), y: Math.round(clamp(y + h / 2 - focus.y * ih, y + h - ih, y)), w: Math.round(iw), h: Math.round(ih) };
  }
  const horizon = Math.round(h * 0.84);
  const k = h / 300;
  return (
    <>
      <defs>
        <clipPath id={clip}>
          <rect x={x} y={y} width={w} height={h} rx={r} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        {scene ? (
          <image href={scene.href} x={image.x} y={image.y} width={image.w} height={image.h} preserveAspectRatio={`${align} slice`} />
        ) : (
          <svg x={x} y={y} width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
            <Scene
              w={w}
              h={h}
              horizon={horizon}
              sun={{ x: w / 2, y: horizon - h * 0.12, r: h * 0.34 }}
              maxH={h * 0.22}
              palms={[
                { x: w * 0.04, y: horizon - 140 * k, k },
                { x: w * 0.96, y: horizon - 130 * k, k: k * 0.93, flip: true },
              ]}
            />
          </svg>
        )}
      </g>
    </>
  );
}

function mainStatus(card: CardData, lang: Lang): string | null {
  const order = ["gap", "negative", "special", "positive"];
  const st = [...card.statuses].sort((a, b) => order.indexOf(a.tone) - order.indexOf(b.tone))[0];
  return st ? st.label[lang] ?? st.label.fr : null;
}

/**
 * La phrase citée à côté de la fiche. À partir de trois étoiles, le chef
 * d'accusation le plus drôle. En dessous (et pour un dossier scellé), la phrase
 * d'accroche du profil, celle qui sauve la face : personne ne publie « A fini le
 * tutoriel » sous son nom. Sans profil, un chef d'accusation flatteur s'il y en a un, sinon rien.
 */
export function imageQuote(card: CardData, lang: Lang): string | null {
  if (!card.sealed && starsFor(card.overall) >= 3) return mainStatus(card, lang);
  const tagline = card.profile?.tagline;
  if (tagline) return tagline[lang] ?? tagline.fr;
  const kind = card.statuses.find((st) => st.tone === "positive" || st.tone === "special");
  return kind ? kind.label[lang] ?? kind.label.fr : null;
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

/** La fiche à gauche ; à droite, sur l'encre, ce qu'un fil doit dire en une
 *  demi-seconde, de haut en bas : « AVIS DE RECHERCHE » en titre d'affiche, calé
 *  sur le haut de la fiche ; le lieu du crime en bandeau (il donne la couleur du
 *  profil, pas d'information : il ne garde qu'un quart de la colonne) ; le nom en
 *  grand ; la rangée d'étoiles et le niveau (LE résultat, illisibles sur la fiche
 *  en vignette) ; la phrase citée (imageQuote) ; l'appel, calé sur le bas de la
 *  fiche. Le titre ne se pose pas sur le bandeau : sur deux ciels clairs
 *  (repeat_offender, old_school), le coin haut n'atteint pas 3:1. */
export function OgImage({ card, lang, avatars, scene }: { card: CardData; lang: Lang; avatars: Avatars; scene?: SceneImage | null }) {
  const W = 1200;
  const H = 630;
  const ch = 566;
  const cw = (ch * CARD_W) / CARD_H;
  const cx = 88;
  const cy = 32;
  const tx = 560;
  const maxW = W - tx - 64;
  const panelY = cy + 54;
  // Le nom sur une ligne jusqu'en 56 ; plus long, sur deux lignes, et la citation sur une.
  const upperName = upper(card.name, lang);
  const one = fit(upperName, { font: "display-700", size: 84, minSize: 56, maxWidth: maxW, letterSpacing: 0.5 });
  const name = one.text === upperName ? { lines: [one.text], size: one.size } : fitLines(upperName, { font: "display-700", size: 64, minSize: 44, maxWidth: maxW, letterSpacing: 0.5 });
  // Le bandeau du décor, assez bas pour laisser sa ligne à la note sur 100.
  const panelH = 132;
  const nameY = panelY + panelH + 22 + Math.round(name.size * 0.72);
  const lastNameY = nameY + (name.lines.length - 1) * Math.round(name.size * 0.98);
  // Les étoiles et la note sur 100 sur une ligne, le niveau dessous ; une fiche scellée n'a ni note ni étoiles : ses deux mots à la place.
  const stars = starsFor(card.overall);
  const starSize = 44;
  const starsY = lastNameY + 22;
  const starsW = card.sealed ? 0 : starRowWidth(starSize) + 22;
  const score = card.sealed ? null : `${card.overall}/100`;
  const level = fit(upper(card.sealed ? t(lang).sealed : LEVEL_LABELS[stars][lang], lang), { font: "display-700", size: 42, minSize: 26, maxWidth: maxW, letterSpacing: 1 });
  const levelY = card.sealed ? starsY + starSize / 2 + Math.round(level.size * 0.35) : starsY + starSize + 12 + Math.round(level.size * 0.7);
  const quoteY = card.sealed ? starsY + starSize + 48 : levelY + 48;
  const quote = imageQuote(card, lang);
  const quoted = quote ? (lang === "fr" ? `« ${quote} »` : `“${quote}”`) : "";
  const qLines = quote ? wrap(quoted, "sans-600", 34, maxW, name.lines.length > 1 ? 1 : 2) : [];
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <Ink w={W} h={H} />
      <PosterTitle x={tx} y={cy + 35} size={50} lang={lang} />
      <SceneFrame scene={scene} id="og" x={tx} y={panelY} w={maxW} h={panelH} align="xMidYMid" r={8} />
      <Placed card={card} lang={lang} avatars={avatars} id="og" x={cx} y={cy} w={cw} />
      {name.lines.map((l, i) => (
        <text key={i} x={tx - 2} y={nameY + i * Math.round(name.size * 0.98)} {...fontAttrs("display-700")} fontSize={name.size} letterSpacing={0.5} fill={PALETTE.cream}>
          {l}
        </text>
      ))}
      {!card.sealed && <StarRow n={stars} x={tx} y={starsY} size={starSize} />}
      {score && (
        <text x={tx + starsW} y={starsY + starSize / 2 + Math.round(42 * 0.35)} {...fontAttrs("display-700")} fontSize={42} letterSpacing={1} fill={PALETTE.cream}>
          {score}
        </text>
      )}
      <text x={tx} y={levelY} {...fontAttrs("display-700")} fontSize={level.size} letterSpacing={level.letterSpacing} fill={PALETTE.cream}>
        {level.text}
      </text>
      {qLines.map((l, i) => (
        <text key={i} x={tx} y={quoteY + i * 42} {...fontAttrs("sans-600")} fontSize={34} fill={PALETTE.peach}>
          {l}
        </text>
      ))}
      <CtaPill x={tx} bottom={cy + ch} label={t(lang).cta} lang={lang} size={28} maxW={maxW} />
    </svg>
  );
}

/**
 * L'appel des images, « Fais la tienne : skills.azerit.tech », en pilule rose
 * poudré au texte d'encre : le bouton principal du site, et la seule chose rose
 * d'une image (§18.48). `bottom` est le bas de la pilule ; le corps descend si
 * l'appel dépasse `maxW`. `anchor` : calée à gauche sur `x`, ou centrée dessus.
 */
export function CtaPill({ x, bottom, label, lang, size, maxW, anchor = "start" }: { x: number; bottom: number; label: string; lang: Lang; size: number; maxW: number; anchor?: "start" | "middle" }) {
  const call = lang === "fr" ? `${label}\u00a0:` : `${label}:`;
  const host = ctaHost();
  // L'adresse suit l'appel d'une seule espace : la mesure de l'appel, sans sa marge de
  // sécurité de 3 % (shared/card/text.ts), sinon l'écart se lit comme une double espace.
  const widthAt = (s: number) => {
    const callW = measure(call, "sans-600", s) / 1.03;
    return { callW, total: s * 0.85 * 2 + callW + s * 0.25 + measure(host, "sans-700", s) };
  };
  let s = size;
  while (widthAt(s).total > maxW && s > 16) s -= 0.5;
  const { callW, total } = widthAt(s);
  const h = Math.round(s * 1.95);
  const x0 = anchor === "middle" ? x - total / 2 : x;
  const y = bottom - h;
  const base = y + h / 2 + s * 0.35;
  return (
    <g data-cta="">
      <rect x={+x0.toFixed(1)} y={y} width={+total.toFixed(1)} height={h} rx={h / 2} fill={PALETTE.blush} />
      <text x={+(x0 + s * 0.85).toFixed(1)} y={+base.toFixed(1)} {...fontAttrs("sans-600")} fontSize={s} fill={PALETTE.ink0}>
        {call}
      </text>
      <text x={+(x0 + s * 0.85 + callW + s * 0.25).toFixed(1)} y={+base.toFixed(1)} {...fontAttrs("sans-700")} fontSize={s} fill={PALETTE.ink0}>
        {host}
      </text>
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* Aperçu de lien de l'accueil 1200 × 630                               */
/* ------------------------------------------------------------------ */

/** La promesse, le titre de l'accueil (shared/promise.ts, sa seule source) : deux
 *  phrases de deux lignes, la première en lilas, la seconde en crème : les couleurs du titre de l'accueil. */
const PROMISE = (lang: Lang): [string[], string[]] => [HOME_PROMISE[lang].claim, HOME_PROMISE[lang].proof];

/** Même mise en page que l'aperçu d'une fiche : la fiche de la vitrine à gauche,
 *  et à droite le titre d'affiche, la promesse en grand à la place du nom, puis
 *  l'appel. Le front de mer dessiné reste un liseré au pied de l'image, sous
 *  l'appel : ni le titre ni l'appel ne se posent sur un immeuble ou une fenêtre,
 *  et le soleil reste derrière la fiche. */
export function HomeOg({ card, lang, avatars }: { card: CardData; lang: Lang; avatars: Avatars }) {
  const W = 1200;
  const H = 630;
  const ch = 566;
  const cw = (ch * CARD_W) / CARD_H;
  const cx = 88;
  const cy = 32;
  const tx = 560;
  const maxW = W - tx - 64;
  const horizon = 590;
  const skyline = 56;
  const [claim, proof] = PROMISE(lang);
  const lines = [...claim, ...proof].map((l) => upper(l, lang));
  // Une seule taille pour les quatre lignes : celle que la plus longue permet.
  const size = Math.min(...lines.map((l) => fit(l, { font: "display-700", size: 96, minSize: 56, maxWidth: maxW, letterSpacing: 0.5 }).size));
  const titleTop = 102;
  // L'appel au-dessus des toits, quelle que soit la taille du titre.
  const ctaBottom = horizon - skyline - 12;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <Scene w={W} h={H} horizon={horizon} sun={{ x: cx + cw / 2, y: 470, r: 258 }} maxH={skyline} palms={[]} />
      <Placed card={card} lang={lang} avatars={avatars} id="home" x={cx} y={cy} w={cw} />
      <PosterTitle x={tx} y={cy + 35} size={50} lang={lang} />
      {lines.map((l, i) => (
        <text key={i} x={tx - 2} y={Math.round(titleTop + size * 0.72 + i * size * 0.94)} {...fontAttrs("display-700")} fontSize={size} letterSpacing={0.5} fill={i >= claim.length ? PALETTE.cream : PALETTE.lilac}>
          {l}
        </text>
      ))}
      <CtaPill x={tx} bottom={ctaBottom} label={IMAGE_WORDS[lang].home} lang={lang} size={28} maxW={maxW} />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Portrait 1080 × 1350                                                 */
/* ------------------------------------------------------------------ */

/** La page d'une fiche (§18.29) en 4:5 : le lieu du crime de bord à bord en haut,
 *  calé sur son ciel, l'encre plate dessous, et la fiche en grand (les deux tiers de la
 *  largeur, lisible en miniature dans un fil) qui chevauche le bas de l'image.
 *  « Avis de recherche » sur sa plaque d'encre comme sur la story, ce que c'est en une ligne et l'appel en pied. */
export function PortraitImage({ card, lang, avatars, scene }: { card: CardData; lang: Lang; avatars: Avatars; scene?: SceneImage | null }) {
  const W = 1080;
  const H = 1350;
  const skyH = 620;
  const cw = 720;
  const cx = (W - cw) / 2;
  const cy = 116;
  const bottom = cy + (cw * CARD_H) / CARD_W;
  const what = fit(IMAGE_WORDS[lang].what, { font: "sans-500", size: 34, minSize: 26, maxWidth: W - 2 * 60 });
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <Ink w={W} h={H} />
      <SceneFrame scene={scene} id="pt" x={0} y={0} w={W} h={skyH} align="xMidYMin" />
      <PosterPlate x={W / 2} y={82} size={40} lang={lang} />
      <Placed card={card} lang={lang} avatars={avatars} id="pt" x={cx} y={cy} w={cw} />
      <text x={W / 2} y={Math.round(bottom + 56)} {...fontAttrs("sans-500")} fontSize={what.size} textAnchor="middle" fill={PALETTE.lilac}>
        {what.text}
      </text>
      <CtaPill x={W / 2} bottom={H - 40} label={t(lang).cta} lang={lang} size={38} maxW={W - 2 * 60} anchor="middle" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Story 1080 × 1920                                                    */
/* ------------------------------------------------------------------ */

/** Zones des applis (Instagram, TikTok) : rien d'important dans les 250 px du haut ni les 340 du bas. */
export const STORY_SAFE = { top: 250, bottom: 340 };

/** « Avis de recherche » sur une plaque d'encre, comme celle de la photo d'identité :
 *  à mi-hauteur d'un ciel, le texte passe sur un immeuble clair (night_owl) ou un mur
 *  de plans (mastermind), où ni l'encre ni le crème ne lisent partout. */
function PosterPlate({ x, y, size, lang }: { x: number; y: number; size: number; lang: Lang }) {
  const ls = size * 0.34;
  const text = upper(t(lang).poster, lang);
  const w = fit(text, { font: "sans-600", size, minSize: size, maxWidth: 4000, letterSpacing: ls }).width - ls;
  const padX = size * 0.8;
  const h = size * 1.9;
  return (
    <g>
      <rect x={x - w / 2 - padX} y={y - size * 0.73 - (h - size * 0.73) / 2} width={w + 2 * padX} height={h} rx={6} fill={PALETTE.ink0} />
      <Poster x={x} y={y} size={size} lang={lang} opacity={1} />
    </g>
  );
}

/** La story : le lieu du crime sur le haut, « Avis de recherche » sur sa plaque sous la
 *  zone de l'appli, la fiche à cheval sur le bas de l'image, puis la peine en capitales
 *  crème et la caution en pêche (la page d'une fiche les donne aussi sous la fiche,
 *  §18.29 ; le profil et sa phrase sont déjà sur la fiche), et l'adresse, au-dessus de
 *  la zone du bas. */
export function StoryImage({ card, lang, avatars, scene }: { card: CardData; lang: Lang; avatars: Avatars; scene?: SceneImage | null }) {
  const W = 1080;
  const H = 1920;
  const skyH = 860;
  const cw = 720;
  const cx = (W - cw) / 2;
  const cy = 338;
  const bottom = cy + (cw * CARD_H) / CARD_W;
  const maxW = W - 2 * 80;
  const sentence = card.sentence;
  const penalty = sentence ? fit(upper(sentence.label[lang] ?? sentence.label.fr, lang), { font: "display-700", size: 54, minSize: 36, maxWidth: maxW, letterSpacing: 0.6 }) : null;
  const bail = sentence?.bail ? fit(sentence.bail[lang] ?? sentence.bail.fr, { font: "sans-600", size: 34, minSize: 24, maxWidth: maxW }) : null;
  const penaltyY = bottom + 62;
  // La pilule de l'appel sous la peine et la caution, jamais dans la zone du bas.
  const ctaBottom = Math.min(H - STORY_SAFE.bottom - 10, (penalty ? penaltyY + (bail ? 46 : 0) : bottom) + 30 + 62);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <Ink w={W} h={H} />
      <SceneFrame scene={scene} id="st" x={0} y={0} w={W} h={skyH} align="xMidYMin" />
      <PosterPlate x={W / 2} y={298} size={36} lang={lang} />
      <Placed card={card} lang={lang} avatars={avatars} id="st" x={cx} y={cy} w={cw} />
      {penalty && (
        <text x={W / 2} y={penaltyY} {...fontAttrs("display-700")} fontSize={penalty.size} letterSpacing={penalty.letterSpacing} textAnchor="middle" fill={PALETTE.cream}>
          {penalty.text}
        </text>
      )}
      {bail && (
        <text x={W / 2} y={penaltyY + 46} {...fontAttrs("sans-600")} fontSize={bail.size} textAnchor="middle" fill={PALETTE.peach}>
          {bail.text}
        </text>
      )}
      <CtaPill x={W / 2} bottom={ctaBottom} label={t(lang).cta} lang={lang} size={32} maxW={maxW} anchor="middle" />
    </svg>
  );
}
