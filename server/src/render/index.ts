// Rendu PNG côté serveur : composant React SVG → renderToStaticMarkup → resvg.
// Mêmes polices TTF que le navigateur, donc une image identique à l'écran.
import { renderAsync, type ResvgRenderOptions } from "@resvg/resvg-js";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fileOf } from "../../../shared/caseFile";
import type { BandStanding } from "../../../shared/bands";
import type { CardData, ComparisonData, Lang } from "../../../shared/types";
import { fetchAvatar } from "./avatar";
import { BandOg } from "./band";
import { CardOnly, HomeOg, OgImage, PortraitImage, StoryImage, type Avatars } from "./compositions";
import { fontFiles } from "./fonts";
import { encodeOpaquePng } from "./png";
import { sceneFor } from "./scenes";

/**
 * `home` : l'aperçu de lien de l'accueil, la promesse et la fiche donnée (celle de la vitrine).
 * `story` : 9:16 pour Instagram et TikTok, une fiche seule.
 * Un dossier à deux pièces prend les compositions d'une fiche : celle du dossier (§18.36).
 */
export type ImageFormat = "card" | "og" | "portrait" | "story" | "home" | "band";

export interface RenderInput {
  format: ImageFormat;
  card?: CardData;
  comparison?: ComparisonData;
  /** `band` : l'aperçu de lien d'une bande (§18.38, band.tsx), sans fiche. */
  band?: BandStanding;
  lang: Lang;
}

/** Largeur de sortie par format (la hauteur suit le viewBox). */
const OUTPUT_WIDTH: Record<ImageFormat, number> = { card: 1080, og: 1200, portrait: 1080, story: 1080, home: 1200, band: 1200 };

async function avatarsFor(cards: CardData[]): Promise<Avatars> {
  const out: Avatars = {};
  await Promise.all(
    cards.map(async (c) => {
      out[c.id] = await fetchAvatar(c.avatarUrl);
    }),
  );
  return out;
}

/** Construit l'élément SVG de la composition demandée. */
export async function buildElement(input: RenderInput): Promise<ReactElement> {
  const { format, comparison, lang } = input;
  if (format === "band") {
    if (!input.band) throw new Error("renderImage : band requis");
    return createElement(BandOg, { band: input.band, lang });
  }
  // Un dossier, une fiche, une note (shared/caseFile.ts).
  const card = comparison ? fileOf(comparison) : input.card;
  if (!card) throw new Error("renderImage : card ou comparison requis");
  const avatars = await avatarsFor([card]);
  const props = { card, lang, avatars };
  if (format === "home") return createElement(HomeOg, props);
  // Le lieu du crime du profil (§18.28) ; le petit fichier suffit au panneau de l'aperçu de lien.
  const profileId = card.profile?.id;
  if (format === "og") return createElement(OgImage, { ...props, scene: sceneFor(profileId, "small") });
  if (format === "portrait") return createElement(PortraitImage, { ...props, scene: sceneFor(profileId, "large") });
  if (format === "story") return createElement(StoryImage, { ...props, scene: sceneFor(profileId, "large") });
  return createElement(CardOnly, props);
}

/** Le SVG brut (utile pour déboguer ou servir une version vectorielle). */
export async function renderSvg(input: RenderInput): Promise<string> {
  return renderToStaticMarkup(await buildElement(input));
}

export async function renderImage(input: RenderInput): Promise<Buffer> {
  const svg = await renderSvg(input);
  const width = OUTPUT_WIDTH[input.format];
  const opts: ResvgRenderOptions = {
    font: { fontFiles: fontFiles(), loadSystemFonts: false, defaultFontFamily: "Outfit" },
    fitTo: { mode: "width", value: width },
    shapeRendering: 2,
    textRendering: 1,
    imageRendering: 0,
    logLevel: "off",
  };
  const img = await renderAsync(svg, opts);
  // La fiche seule garde sa transparence ; les autres formats sont posés sur l'encre :
  // PNG opaque, plus léger (png.ts).
  if (input.format === "card") return img.asPng();
  return encodeOpaquePng(img.pixels, img.width, img.height);
}
