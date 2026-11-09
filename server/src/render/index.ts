// Rendu PNG côté serveur : composant React SVG → renderToStaticMarkup → resvg.
// Mêmes polices TTF que le navigateur, donc une image identique à l'écran.
import { renderAsync, type ResvgRenderOptions } from "@resvg/resvg-js";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CardData, ComparisonData, Lang } from "../../../shared/types";
import { fetchAvatar } from "./avatar";
import {
  CardOnly, ComparisonCard, ComparisonOg, ComparisonPortrait, HomeOg, OgImage, PortraitImage, type Avatars,
} from "./compositions";
import { fontFiles } from "./fonts";

/** `home` : l'aperçu de lien de l'accueil, la promesse et la fiche donnée (celle de la vitrine). */
export type ImageFormat = "card" | "og" | "portrait" | "home";

export interface RenderInput {
  format: ImageFormat;
  card?: CardData;
  comparison?: ComparisonData;
  lang: Lang;
}

/** Largeur de sortie par format (la hauteur suit le viewBox). */
const OUTPUT_WIDTH: Record<ImageFormat, number> = { card: 1080, og: 1200, portrait: 1080, home: 1200 };

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
  const { format, card, comparison, lang } = input;
  if (comparison) {
    const avatars = await avatarsFor([comparison.cv, comparison.github]);
    const props = { cmp: comparison, lang, avatars };
    if (format === "og") return createElement(ComparisonOg, props);
    if (format === "portrait") return createElement(ComparisonPortrait, props);
    return createElement(ComparisonCard, props);
  }
  if (!card) throw new Error("renderImage : card ou comparison requis");
  const avatars = await avatarsFor([card]);
  const props = { card, lang, avatars };
  if (format === "home") return createElement(HomeOg, props);
  if (format === "og") return createElement(OgImage, props);
  if (format === "portrait") return createElement(PortraitImage, props);
  return createElement(CardOnly, props);
}

/** Le SVG brut (utile pour déboguer ou servir une version vectorielle). */
export async function renderSvg(input: RenderInput): Promise<string> {
  return renderToStaticMarkup(await buildElement(input));
}

export async function renderImage(input: RenderInput): Promise<Buffer> {
  const svg = await renderSvg(input);
  const width = input.comparison && input.format === "card" ? 1920 : OUTPUT_WIDTH[input.format];
  const opts: ResvgRenderOptions = {
    font: { fontFiles: fontFiles(), loadSystemFonts: false, defaultFontFamily: "Outfit" },
    fitTo: { mode: "width", value: width },
    shapeRendering: 2,
    textRendering: 1,
    imageRendering: 0,
    logLevel: "off",
  };
  const img = await renderAsync(svg, opts);
  return img.asPng();
}
