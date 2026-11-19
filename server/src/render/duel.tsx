// L'aperçu du lien d'une dénonciation (SPEC §18.91), 1200 × 630 : le face-à-face.
// Les deux fiches en vis-à-vis, le dénonciateur à gauche, la personne dénoncée à
// droite, chacune avec son halo de ★★★★★★ ; entre elles, ce qu'une vignette de
// messagerie doit dire en une demi-seconde : les deux noms, les deux notes en très
// grand, les six étoiles de chacun, et « VS » sur un disque sirène. Dessous, de bord
// à bord, le verdict en une ligne (duelVerdict, la règle de la page partagée).
// Face à un dossier scellé, ni note ni étoiles : « ? », et le verdict invite.
// Le style des autres aperçus (compositions.tsx) : l'encre plate, les capitales
// condensées crème, aucun dégradé ajouté ; le rose reste à l'appel, absent ici.
import { fontAttrs } from "../../../shared/card/fonts";
import { CARD_H, CARD_W } from "../../../shared/card/geometry";
import { fit, upper } from "../../../shared/card/text";
import { PALETTE } from "../../../shared/card/themes";
import { starsFor, type CardData, type Lang } from "../../../shared/types";
import { duelVerdict } from "../duel";
import { Ink, Placed, StarRow, starRowWidth, type Avatars } from "./compositions";

const W = 1200;
const H = 630;
/** La colonne du milieu, calée au centre des fiches (34 à 474) : le nom, la note, les étoiles. */
const NAME_Y = 152;
const SCORE_SIZE = 176;
const SCORE_Y = 312;
const STARS_Y = 338;
/** « VS » au milieu des deux notes. */
const VS_Y = 248;

export function DuelOg({ by, target, lang, avatars }: { by: CardData; target: CardData; lang: Lang; avatars: Avatars }) {
  // Les fiches : 440 de haut, à 56 des bords.
  const ch = 440;
  const cw = Math.round((ch * CARD_W) / CARD_H);
  const cy = 34;
  const edge = 56;
  const lx = edge;
  const rx = W - edge - cw;
  // La colonne du milieu, entre les deux fiches.
  const pad = 30;
  const c0 = lx + cw + pad;
  const c1 = rx - pad;
  const mid = W / 2;
  const half = (c1 - c0) / 2 - 18;
  const side = (card: CardData, align: "start" | "end") => {
    const x = align === "start" ? c0 : c1;
    const who = card.login ? `@${card.login}` : card.name;
    const name = fit(upper(who, lang), { font: "display-700", size: 46, minSize: 28, maxWidth: half, letterSpacing: 0.5 });
    const sealed = !!card.sealed;
    const score = sealed ? "?" : String(card.overall);
    const starSize = 27;
    const sw = starRowWidth(starSize);
    return (
      <g data-duel-side={align === "start" ? "by" : "target"}>
        <text x={x} y={NAME_Y} {...fontAttrs("display-700")} fontSize={name.size} letterSpacing={name.letterSpacing} textAnchor={align} fill={PALETTE.cream}>
          {name.text}
        </text>
        <text x={x} y={SCORE_Y} {...fontAttrs("display-800")} fontSize={SCORE_SIZE} textAnchor={align} fill={PALETTE.cream}>
          {score}
        </text>
        {!sealed && <StarRow n={starsFor(card.overall)} x={align === "start" ? x : x - sw} y={STARS_Y} size={starSize} />}
      </g>
    );
  };
  const line = fit(upper(duelVerdict({ by, target }, lang), lang), { font: "display-700", size: 76, minSize: 44, maxWidth: W - 2 * edge, letterSpacing: 1 });
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <Ink w={W} h={H} />
      <Placed card={by} lang={lang} avatars={avatars} id="dl" x={lx} y={cy} w={cw} />
      <Placed card={target} lang={lang} avatars={avatars} id="dr" x={rx} y={cy} w={cw} />
      {side(by, "start")}
      {side(target, "end")}
      <g data-duel-vs="">
        <circle cx={mid} cy={VS_Y} r={40} fill={PALETTE.siren} />
        <text x={mid} y={VS_Y + 16} {...fontAttrs("display-800")} fontSize={44} letterSpacing={1} textAnchor="middle" fill={PALETTE.cream}>
          VS
        </text>
      </g>
      <text data-duel-verdict="" x={mid} y={H - 54} {...fontAttrs("display-700")} fontSize={line.size} letterSpacing={line.letterSpacing} textAnchor="middle" fill={PALETTE.peach}>
        {line.text}
      </text>
    </svg>
  );
}
