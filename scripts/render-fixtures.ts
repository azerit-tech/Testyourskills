// Rend chaque fixture en PNG dans var/renders/ : carte seule, aperçu OG,
// portrait, plus la comparaison et une planche contact de toutes les cartes.
// Usage : npx tsx scripts/render-fixtures.ts [clé…] [--sheet-only] [--lang=en]
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Resvg } from "@resvg/resvg-js";
import { FIXTURES, FIXTURE_COMPARISON } from "../shared/fixtures";
import type { CardData, Lang } from "../shared/types";
import { CardGraphic } from "../shared/card/Card";
import { CARD_H, CARD_W } from "../shared/card/geometry";
import { renderImage, type ImageFormat } from "../server/src/render/index";
import { fetchAvatar } from "../server/src/render/avatar";
import { fontFiles } from "../server/src/render/fonts";

const OUT = resolve(import.meta.dirname, "../var/renders");
mkdirSync(OUT, { recursive: true });

const args = process.argv.slice(2);
const only = args.filter((a) => !a.startsWith("--"));
const sheetOnly = args.includes("--sheet-only");
const langArg = args.find((a) => a.startsWith("--lang="))?.slice(7) as Lang | undefined;

const entries = Object.entries(FIXTURES).filter(([k]) => only.length === 0 || only.includes(k)) as [string, CardData][];

/** Planche contact : toutes les cartes sur fond sombre, pour juger d'un coup d'œil. */
async function sheet(cards: [string, CardData][], lang?: Lang) {
  const cols = Math.min(4, cards.length);
  const rows = Math.ceil(cards.length / cols);
  const pad = 28;
  const W = cols * CARD_W + (cols + 1) * pad;
  const H = rows * CARD_H + (rows + 1) * pad;
  const avatars = await Promise.all(cards.map(([, c]) => fetchAvatar(c.avatarUrl)));
  const el = createElement(
    "svg",
    { xmlns: "http://www.w3.org/2000/svg", width: W, height: H, viewBox: `0 0 ${W} ${H}` },
    createElement("rect", { width: W, height: H, fill: "#0a0f16" }),
    ...cards.map(([k, c], i) =>
      createElement(CardGraphic, {
        key: k,
        card: c,
        lang: lang ?? c.lang,
        avatarHref: avatars[i] ?? "",
        idPrefix: `s${i}`,
        x: pad + (i % cols) * (CARD_W + pad),
        y: pad + Math.floor(i / cols) * (CARD_H + pad),
        width: CARD_W,
        height: CARD_H,
      }),
    ),
  );
  const svg = renderToStaticMarkup(el);
  const png = new Resvg(svg, {
    font: { fontFiles: fontFiles(), loadSystemFonts: false, defaultFontFamily: "Outfit" },
    fitTo: { mode: "width", value: Math.round(W * 1.6) },
  })
    .render()
    .asPng();
  const name = `sheet${lang ? "-" + lang : ""}${only.length ? "-" + only.join("_") : ""}.png`;
  writeFileSync(resolve(OUT, name), png);
  console.log("→", name);
}

async function main() {
  const t0 = Date.now();
  await sheet(entries, langArg);
  if (sheetOnly) return;
  const formats: ImageFormat[] = ["card", "og", "portrait"];
  for (const [key, card] of entries) {
    for (const format of formats) {
      const t = Date.now();
      const png = await renderImage({ format, card, lang: langArg ?? card.lang });
      writeFileSync(resolve(OUT, `${key}-${format}.png`), png);
      console.log(`→ ${key}-${format}.png  ${png.length >> 10} Ko  ${Date.now() - t} ms`);
    }
  }
  if (only.length === 0 || only.includes("comparison")) {
    for (const format of formats) {
      for (const lang of ["fr", "en"] as Lang[]) {
        const png = await renderImage({ format, comparison: FIXTURE_COMPARISON, lang });
        writeFileSync(resolve(OUT, `comparison-${format}-${lang}.png`), png);
        console.log(`→ comparison-${format}-${lang}.png`);
      }
    }
  }
  console.log(`Terminé en ${Date.now() - t0} ms`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
