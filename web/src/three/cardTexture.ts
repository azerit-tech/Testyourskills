// Texture de la carte pour la scène 3D : le PNG serveur (`/og/:id-card.png`,
// pixel-identique à la carte) quand il y a un serveur, sinon le SVG de la carte
// rastérisé côté client avec les polices et l'avatar incorporés (mode démo).
import * as THREE from "three";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Card } from "../../../shared/card/Card";
import { CARD_H, CARD_W } from "../../../shared/card/geometry";
import type { CardData, Lang } from "../../../shared/types";
import { isMock } from "../lib/api";
import { loadImageTexture } from "./textures";

const FONT_FILES: [family: string, weight: number, file: string][] = [
  ["Barlow Condensed", 600, "barlow-condensed-600.ttf"],
  ["Barlow Condensed", 700, "barlow-condensed-700.ttf"],
  ["Barlow Condensed", 800, "barlow-condensed-800.ttf"],
  ["Barlow Condensed SemiBold", 600, "barlow-condensed-600.ttf"],
  ["Barlow Condensed ExtraBold", 800, "barlow-condensed-800.ttf"],
  ["Inter", 400, "inter-400.ttf"],
  ["Inter", 500, "inter-500.ttf"],
  ["Inter", 600, "inter-600.ttf"],
  ["Inter", 700, "inter-700.ttf"],
  ["JetBrains Mono", 400, "jetbrains-mono-400.ttf"],
  ["JetBrains Mono", 500, "jetbrains-mono-500.ttf"],
  ["JetBrains Mono", 700, "jetbrains-mono-700.ttf"],
  ["Outfit", 400, "outfit-400.ttf"],
  ["Outfit", 500, "outfit-500.ttf"],
  ["Outfit", 600, "outfit-600.ttf"],
  ["Outfit", 700, "outfit-700.ttf"],
];

let fontCss: Promise<string> | null = null;

async function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Les @font-face avec les TTF en data URI, chargés une fois. */
function embeddedFonts(): Promise<string> {
  if (!fontCss) {
    fontCss = (async () => {
      const cache = new Map<string, Promise<string>>();
      const rules = await Promise.all(
        FONT_FILES.map(async ([family, weight, file]) => {
          let p = cache.get(file);
          if (!p) {
            p = fetch(new URL(`../../../server/fonts/${file}`, import.meta.url))
              .then((r) => r.blob())
              .then(toDataUrl);
            cache.set(file, p);
          }
          const data = await p.catch(() => "");
          return data ? `@font-face{font-family:"${family}";font-weight:${weight};src:url("${data}") format("truetype");}` : "";
        }),
      );
      return rules.join("");
    })();
  }
  return fontCss;
}

async function inlineAvatar(url: string | undefined): Promise<string> {
  if (!url) return "";
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return "";
    return await toDataUrl(await res.blob());
  } catch {
    return "";
  }
}

/** Rastérise la carte dans un canvas, à 3× pour rester nette en plein écran. */
async function rasterize(card: CardData, lang: Lang): Promise<THREE.Texture> {
  const [css, avatarHref] = await Promise.all([embeddedFonts(), inlineAvatar(card.avatarUrl)]);
  let svg = renderToStaticMarkup(createElement(Card, { card, lang, avatarHref, idPrefix: "tex" }));
  if (!/xmlns=/.test(svg)) svg = svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"');
  svg = svg.replace(/<svg[^>]*>/, (m) => `${m}<style>${css}</style>`);
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("rastérisation de la carte"));
    i.src = url;
  });
  const scale = 3;
  const c = document.createElement("canvas");
  c.width = CARD_W * scale;
  c.height = CARD_H * scale;
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export async function loadCardTexture(card: CardData, lang: Lang): Promise<THREE.Texture> {
  if (!isMock()) {
    try {
      const t = await loadImageTexture(`/og/${encodeURIComponent(card.id)}-card.png`);
      t.anisotropy = 8;
      return t;
    } catch {
      /* pas de PNG serveur : on rastérise */
    }
  }
  return rasterize(card, lang);
}
