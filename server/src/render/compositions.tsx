// Compositions des images partagées : carte seule, aperçu de lien 1200 × 630,
// portrait 1080 × 1350, story 1080 × 1920, les variantes « comparaison », et
// l'aperçu de lien de l'accueil (la promesse et la fiche de la vitrine). Tout est
// en SVG, la carte y est imbriquée telle quelle (même composant qu'à l'écran).
// Style mat (SPEC §18.18) dans la langue de la couverture de l'accueil (§18.31) :
// une page d'encre, le lieu du crime du profil (§18.28) en panneau ou en ciel
// de bord à bord, et AUCUN dégradé en plus de celui de la fiche. Le texte posé
// sur un ciel suit son heure (shared/scenes.ts). Sans fichier de décor, le front
// de mer dessiné ci-dessous le remplace. Seule lumière : le halo de ★★★★★★, un
// rectangle flou derrière la fiche (le drop-shadow CSS de l'écran ne passe pas dans le PNG).
import type { ReactNode } from "react";
import type { CardData, ComparisonData, Lang, StatCode } from "../../../shared/types";
import { declaredOf, STAT_CODES } from "../../../shared/types";
import { CardGraphic } from "../../../shared/card/Card";
import { AzeritGem } from "../../../shared/card/AzeritGem";
import { fontAttrs } from "../../../shared/card/fonts";
import { CARD_H, CARD_R, CARD_W } from "../../../shared/card/geometry";
import { t } from "../../../shared/card/i18n";
import { fit, fitLines, upper, wrap } from "../../../shared/card/text";
import { PALETTE, themeOf } from "../../../shared/card/themes";
import { SKY_TEXT } from "../../../shared/scenes";
import type { SceneImage } from "./scenes";

/** Aplats de l'illustration (maquette validée du 9 novembre 2026, dans l'historique git). */
const SCENE = {
  sky: "#2d2a66",
  sun: "#e98a98",
  far: "#463b84",
  palm: "#241f55",
  near: "#1d1946",
  ground: "#121130",
  window: "#ffc46b",
};

const PALM = "M46 140c2-34 5-62 12-86l4 1c-8 24-11 52-12 85zM60 54C40 38 20 38 4 50c18-4 36 0 56 7zM60 54C36 56 18 68 10 88c14-14 30-22 50-30zM60 54c18-22 40-28 60-20-20 0-40 8-60 24zM60 54c26-2 44 10 54 30-14-14-32-22-54-26zM60 54c-6-22-2-40 8-52-2 16 0 32-4 50zM60 54c10-20 26-32 44-34-16 8-30 20-42 36zM60 54c-14-14-18-30-14-48 4 16 10 30 16 46z";

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

/* ------------------------------------------------------------------ */
/* Décor                                                                */
/* ------------------------------------------------------------------ */

/** Une rangée d'immeubles en aplat jusqu'à l'horizon `y`, pseudo-aléatoire mais stable. */
function skyline(w: number, y: number, fill: string, seed: number, maxH: number, lights: boolean): ReactNode[] {
  const out: ReactNode[] = [];
  let x = 0;
  let r = seed;
  const rnd = () => (r = (r * 9301 + 49297) % 233280) / 233280;
  while (x < w) {
    const bw = 26 + rnd() * 50;
    const bh = 30 + rnd() * (maxH - 30);
    out.push(<rect key={`b${x}`} x={+x.toFixed(1)} y={+(y - bh).toFixed(1)} width={+(bw + 1).toFixed(1)} height={+(bh + 2).toFixed(1)} fill={fill} />);
    if (lights) {
      for (let k = 0; k < bh / 18 - 1; k++)
        for (let j = 0; j < bw / 14 - 1; j++)
          if (rnd() > 0.55) out.push(<rect key={`w${x}-${k}-${j}`} x={+(x + 6 + j * 13).toFixed(1)} y={+(y - bh + 10 + k * 17).toFixed(1)} width={4} height={5} fill={SCENE.window} fillOpacity={0.75} />);
    }
    x += bw;
  }
  return out;
}

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

/** Fond d'encre plat, pour les comparaisons (deux fiches, déjà chargées). */
function Ink({ w, h }: { w: number; h: number }) {
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
function Placed({ card, lang, avatars, id, x, y, w }: { card: CardData; lang: Lang; avatars: Avatars; id: string; x: number; y: number; w: number }) {
  return (
    <>
      <CardHalo card={card} x={x} y={y} w={w} id={id} />
      <CardGraphic card={card} lang={lang} avatarHref={av(avatars, card.id)} idPrefix={`${id}c`} x={x} y={y} width={w} height={(w * CARD_H) / CARD_W} />
    </>
  );
}

/** « skills.azerit.tech » précédé de la gemme, centré ou calé à gauche. */
function Host({ x, y, size, anchor = "middle" }: { x: number; y: number; size: number; anchor?: "start" | "middle" }) {
  const host = upper(ctaHost(), "en");
  const ls = size * 0.2;
  const f = fit(host, { font: "sans-600", size, minSize: size, maxWidth: 4000, letterSpacing: ls });
  const gemH = size * 1.15;
  const gemW = gemH * (104 / 120);
  const gap = size * 0.5;
  const total = gemW + gap + f.width;
  const x0 = anchor === "middle" ? x - total / 2 : x;
  return (
    <g>
      <AzeritGem x={x0} y={y - gemH * 0.9} h={gemH} />
      <text x={x0 + gemW + gap} y={y} {...fontAttrs("sans-600")} fontSize={size} letterSpacing={ls} fill={PALETTE.lilac} fillOpacity={0.8}>
        {host}
      </text>
    </g>
  );
}

/** Surtitre « AVIS DE RECHERCHE » : crème atténué sur l'encre, plein dans la couleur du ciel quand il s'y pose. */
function Poster({ x, y, size, lang, anchor = "middle", fill = PALETTE.cream, opacity = 0.6 }: { x: number; y: number; size: number; lang: Lang; anchor?: "start" | "middle"; fill?: string; opacity?: number }) {
  const ls = size * 0.34;
  return (
    <text x={anchor === "middle" ? x + ls / 2 : x} y={y} {...fontAttrs("sans-600")} fontSize={size} letterSpacing={ls} textAnchor={anchor} fill={fill} fillOpacity={opacity}>
      {upper(t(lang).poster, lang)}
    </text>
  );
}

/** La couleur d'un texte posé sur le haut d'un ciel ; le front de mer dessiné est sombre. */
const skyInk = (scene: SceneImage | null | undefined) => SKY_TEXT[scene?.tone ?? "dark"];

/**
 * Le lieu du crime dans un cadre : l'image recadrée pour le remplir (`slice`), centrée
 * (`xMidYMid`, le sujet est au centre de l'illustration) ou calée en haut (`xMidYMin`,
 * le ciel reste). Sans fichier, le front de mer dessiné. `r` : coins du panneau.
 */
function SceneFrame({ scene, id, x, y, w, h, align, r = 0 }: { scene: SceneImage | null | undefined; id: string; x: number; y: number; w: number; h: number; align: "xMidYMid" | "xMidYMin"; r?: number }) {
  const clip = `${id}-frame`;
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
          <image href={scene.href} x={x} y={y} width={w} height={h} preserveAspectRatio={`${align} slice`} />
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

/** La fiche à gauche, comme avant ; à droite, la colonne de la couverture : le
 *  surtitre sur l'encre, calé sur le haut de la fiche, le lieu du crime en panneau,
 *  puis seulement ce qui ne se lit pas sur la fiche en vignette : le nom en grand
 *  et le chef d'accusation le plus drôle. La note, le niveau et le pied sont sur la
 *  fiche. Le surtitre ne se pose pas sur le panneau : sur trois ciels clairs
 *  (forger, repeat_offender, old_school), le coin haut n'atteint pas 3:1. */
export function OgImage({ card, lang, avatars, scene }: { card: CardData; lang: Lang; avatars: Avatars; scene?: SceneImage | null }) {
  const W = 1200;
  const H = 630;
  const ch = 566;
  const cw = (ch * CARD_W) / CARD_H;
  const cx = 88;
  const cy = 32;
  const tx = 560;
  const maxW = W - tx - 64;
  const panelY = cy + 34;
  const panelH = 290;
  // Le nom sur une ligne jusqu'en 56 ; plus long, sur deux lignes, et le chef d'accusation sur une.
  const upperName = upper(card.name, lang);
  const one = fit(upperName, { font: "display-700", size: 84, minSize: 56, maxWidth: maxW, letterSpacing: 0.5 });
  const name = one.text === upperName ? { lines: [one.text], size: one.size } : fitLines(upperName, { font: "display-700", size: 64, minSize: 44, maxWidth: maxW, letterSpacing: 0.5 });
  const nameY = panelY + panelH + 20 + Math.round(name.size * 0.74);
  const lastNameY = nameY + (name.lines.length - 1) * Math.round(name.size * 0.98);
  const quote = mainStatus(card, lang);
  const quoted = quote ? (lang === "fr" ? `« ${quote} »` : `“${quote}”`) : "";
  const qLines = quote ? wrap(quoted, "sans-600", 34, maxW, name.lines.length > 1 ? 1 : 2) : [];
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <Ink w={W} h={H} />
      <Poster x={tx} y={cy + 15} size={20} lang={lang} anchor="start" />
      <SceneFrame scene={scene} id="og" x={tx} y={panelY} w={maxW} h={panelH} align="xMidYMid" r={8} />
      <Placed card={card} lang={lang} avatars={avatars} id="og" x={cx} y={cy} w={cw} />
      {name.lines.map((l, i) => (
        <text key={i} x={tx - 2} y={nameY + i * Math.round(name.size * 0.98)} {...fontAttrs("display-700")} fontSize={name.size} letterSpacing={0.5} fill={PALETTE.cream}>
          {l}
        </text>
      ))}
      {qLines.map((l, i) => (
        <text key={i} x={tx} y={lastNameY + 52 + i * 42} {...fontAttrs("sans-600")} fontSize={34} fill={PALETTE.blush}>
          {l}
        </text>
      ))}
      <CtaLine x={tx} y={604} lang={lang} />
    </svg>
  );
}

/** « Fais la tienne : skills.azerit.tech », au pied des aperçus de lien. */
function CtaLine({ x, y, lang }: { x: number; y: number; lang: Lang }) {
  const s = t(lang);
  const cta = lang === "fr" ? `${s.cta}\u00a0:` : `${s.cta}:`;
  const ctaW = fit(cta, { font: "sans-500", size: 26, minSize: 26, maxWidth: 4000 }).width;
  return (
    <>
      <text x={x} y={y} {...fontAttrs("sans-500")} fontSize={26} fill={PALETTE.lilac} fillOpacity={0.8}>
        {cta}
      </text>
      <text x={x + ctaW + 10} y={y} {...fontAttrs("sans-600")} fontSize={26} fill={PALETTE.cream}>
        {ctaHost()}
      </text>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Aperçu de lien de l'accueil 1200 × 630                               */
/* ------------------------------------------------------------------ */

/** La promesse, le titre de l'accueil : deux phrases de deux lignes, ce que le
 *  profil déclare en crème, puis ce que le code dira en rose. */
const PROMISE: Record<Lang, [string[], string[]]> = {
  fr: [
    ["Ton LinkedIn", "dit senior."],
    ["Ton GitHub,", "on va voir."],
  ],
  en: [
    ["Your LinkedIn", "says senior."],
    ["Your GitHub?", "We'll see."],
  ],
};

/** Même mise en page que l'aperçu d'une fiche : la fiche de la vitrine à gauche,
 *  et à droite la promesse en grand à la place du nom. */
export function HomeOg({ card, lang, avatars }: { card: CardData; lang: Lang; avatars: Avatars }) {
  const W = 1200;
  const H = 630;
  const ch = 566;
  const cw = (ch * CARD_W) / CARD_H;
  const cx = 88;
  const cy = 32;
  const tx = 560;
  const maxW = W - tx - 64;
  const [claim, proof] = PROMISE[lang];
  const lines = [...claim, ...proof].map((l) => upper(l, lang));
  // Une seule taille pour les quatre lignes : celle que la plus longue permet.
  const size = Math.min(...lines.map((l) => fit(l, { font: "display-700", size: 112, minSize: 60, maxWidth: maxW, letterSpacing: 0.5 }).size));
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <Scene w={W} h={H} horizon={556} sun={{ x: cx + cw / 2, y: 470, r: 300 }} maxH={120} palms={[{ x: W - 170, y: 300, k: 1.6, flip: true }]} />
      <Placed card={card} lang={lang} avatars={avatars} id="home" x={cx} y={cy} w={cw} />
      <Poster x={tx} y={118} size={22} lang={lang} anchor="start" />
      {lines.map((l, i) => (
        <text key={i} x={tx - 2} y={136 + (i + 1) * size * 0.94} {...fontAttrs("display-700")} fontSize={size} letterSpacing={0.5} fill={i >= claim.length ? PALETTE.blush : PALETTE.cream}>
          {l}
        </text>
      ))}
      <CtaLine x={tx} y={604} lang={lang} />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Portrait 1080 × 1350                                                 */
/* ------------------------------------------------------------------ */

/** La page d'une fiche (§18.29) en 4:5 : le lieu du crime de bord à bord en haut,
 *  calé sur son ciel, l'encre plate dessous, et la fiche en grand (72 % de la
 *  largeur, lisible en miniature dans un fil) qui chevauche le bas de l'image.
 *  « Avis de recherche » sur le ciel, l'adresse en pied. */
export function PortraitImage({ card, lang, avatars, scene }: { card: CardData; lang: Lang; avatars: Avatars; scene?: SceneImage | null }) {
  const W = 1080;
  const H = 1350;
  const skyH = 620;
  const cw = 780;
  const cx = (W - cw) / 2;
  const cy = 150;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <Ink w={W} h={H} />
      <SceneFrame scene={scene} id="pt" x={0} y={0} w={W} h={skyH} align="xMidYMin" />
      <Poster x={W / 2} y={98} size={40} lang={lang} fill={skyInk(scene)} opacity={1} />
      <Placed card={card} lang={lang} avatars={avatars} id="pt" x={cx} y={cy} w={cw} />
      <Host x={W / 2} y={1322} size={28} />
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
 *  crème et la caution en rose (la page d'une fiche les donne aussi sous la fiche,
 *  §18.29 ; le profil et sa phrase sont déjà sur la fiche), et l'adresse, au-dessus de
 *  la zone du bas. */
export function StoryImage({ card, lang, avatars, scene }: { card: CardData; lang: Lang; avatars: Avatars; scene?: SceneImage | null }) {
  const W = 1080;
  const H = 1920;
  const skyH = 860;
  const cw = 740;
  const cx = (W - cw) / 2;
  const cy = 338;
  const bottom = cy + (cw * CARD_H) / CARD_W;
  const maxW = W - 2 * 80;
  const sentence = card.sentence;
  const penalty = sentence ? fit(upper(sentence.label[lang] ?? sentence.label.fr, lang), { font: "display-700", size: 54, minSize: 36, maxWidth: maxW, letterSpacing: 0.6 }) : null;
  const bail = sentence?.bail ? fit(sentence.bail[lang] ?? sentence.bail.fr, { font: "sans-600", size: 34, minSize: 24, maxWidth: maxW }) : null;
  const penaltyY = bottom + 60;
  const hostY = Math.min(H - STORY_SAFE.bottom - 8, penalty ? penaltyY + (bail ? 110 : 66) : bottom + 80);
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
        <text x={W / 2} y={penaltyY + 46} {...fontAttrs("sans-600")} fontSize={bail.size} textAnchor="middle" fill={PALETTE.blush}>
          {bail.text}
        </text>
      )}
      <StoryCta x={W / 2} y={hostY} lang={lang} />
    </svg>
  );
}

/** « Fais la tienne : skills.azerit.tech », centré, la gemme devant. */
function StoryCta({ x, y, lang }: { x: number; y: number; lang: Lang }) {
  const s = t(lang);
  const size = 30;
  const cta = lang === "fr" ? `${s.cta}\u00a0:` : `${s.cta}:`;
  const host = ctaHost();
  const ctaW = fit(cta, { font: "sans-500", size, minSize: size, maxWidth: 4000 }).width;
  const hostW = fit(host, { font: "sans-600", size, minSize: size, maxWidth: 4000 }).width;
  const gemH = size * 1.15;
  const gemW = gemH * (104 / 120);
  const gap = size * 0.4;
  const total = gemW + gap + ctaW + 10 + hostW;
  const x0 = x - total / 2;
  return (
    <g>
      <AzeritGem x={x0} y={y - gemH * 0.88} h={gemH} />
      <text x={x0 + gemW + gap} y={y} {...fontAttrs("sans-500")} fontSize={size} fill={PALETTE.lilac} fillOpacity={0.8}>
        {cta}
      </text>
      <text x={x0 + gemW + gap + ctaW + 10} y={y} {...fontAttrs("sans-600")} fontSize={size} fill={PALETTE.cream}>
        {host}
      </text>
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* Comparaison                                                          */
/* ------------------------------------------------------------------ */

const MUTED = "rgba(229,221,255,0.62)";

function deltaColor(code: StatCode, d: number): string {
  if (code === "BUZZ") return PALETTE.peach;
  if (d > 0) return PALETTE.lime;
  if (d < 0) return PALETTE.blush;
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
            <rect x={x - w / 2} y={cy - 17} width={w} height={34} rx={17} fill={PALETTE.ink1} />
            <text x={x - w / 2 + 18} y={cy + 6} {...fontAttrs("sans-600")} fontSize={15} letterSpacing={1} fill={MUTED}>
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
    <text x={x} y={y} {...fontAttrs("sans-600")} fontSize={size} letterSpacing={size * 0.18} textAnchor="middle" fill={color}>
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
      <Ink w={W} h={H} />
      <text x={W / 2} y={70} {...fontAttrs("display-700")} fontSize={head.size} letterSpacing={head.letterSpacing} textAnchor="middle" fill={PALETTE.cream}>
        {head.text}
      </text>
      <SideLabel x={lx + cw / 2} y={120} text={upper(declaredOf(cmp) === "linkedin" ? s.linkedinSide : s.cvSide, lang)} color={MUTED} size={12} />
      <SideLabel x={rx + cw / 2} y={120} text={upper(s.githubSide, lang)} color={PALETTE.lime} size={12} />
      <Placed card={cmp.cv} lang={lang} avatars={avatars} id="cogcv" x={lx} y={cy} w={cw} />
      <Placed card={cmp.github} lang={lang} avatars={avatars} id="coggh" x={rx} y={cy} w={cw} />
      <DeltaColumn cmp={cmp} x={W / 2} y={cy + 52} rowH={64} w={150} />
      <Host x={W / 2} y={606} size={18} />
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
      <Ink w={W} h={H} />
      {lines.map((l, i) => (
        <text key={i} x={W / 2} y={(lines.length === 1 ? 225 : 190) + i * hs * 1.03} {...fontAttrs("display-700")} fontSize={hs} letterSpacing={0.4} textAnchor="middle" fill={PALETTE.cream}>
          {l}
        </text>
      ))}
      <SideLabel x={lx + cw / 2} y={cy - 22} text={upper(declaredOf(cmp) === "linkedin" ? s.linkedinSide : s.cvSide, lang)} color={MUTED} size={15} />
      <SideLabel x={rx + cw / 2} y={cy - 22} text={upper(s.githubSide, lang)} color={PALETTE.lime} size={15} />
      <Placed card={cmp.cv} lang={lang} avatars={avatars} id="cptcv" x={lx} y={cy} w={cw} />
      <Placed card={cmp.github} lang={lang} avatars={avatars} id="cptgh" x={rx} y={cy} w={cw} />
      <DeltaRow cmp={cmp} y={cy + ch + 70} W={W} />
      <Host x={W / 2} y={1296} size={26} />
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
            <rect x={x} y={y - 30} width={w} height={60} rx={14} fill={PALETTE.ink1} />
            <text x={x + 18} y={y + 7} {...fontAttrs("sans-600")} fontSize={17} letterSpacing={1} fill={MUTED}>
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
