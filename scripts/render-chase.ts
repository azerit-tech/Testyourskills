// Planches de la poursuite (§18.33) : ChaseFrame rendu en PNG par resvg, aux
// instants clés (ouverture, chaque étoile à son sommet, le clignotement, le
// freinage devant le décor, le flash), pour juger l'image sans navigateur.
// Usage : npx tsx scripts/render-chase.ts [--out=dossier] [--size=390x844] [--lang=en]
//   [--only=1,3,6] [--profile=arsonist] [--t=4.2] (une seule image à cet instant)
// Par défaut : var/chase/ (ignoré par git), planches de 1, 3 et 6 étoiles en
// heure rose, dorée et bleue, plus quelques images seules en ×2.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Resvg } from "@resvg/resvg-js";
import { FIXTURES } from "../shared/fixtures";
import type { CardData, Lang } from "../shared/types";
import { FONT_FILES } from "../shared/card/fonts";
import { ChaseFrame, chasePlan, type ChasePlan } from "../shared/chase";

const ROOT = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const opt = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const OUT = resolve(opt("out") ?? resolve(ROOT, "var/chase"));
mkdirSync(OUT, { recursive: true });
const [SW, SH] = (opt("size") ?? "390x844").split("x").map(Number);
const lang = (opt("lang") ?? "fr") as Lang;
const fonts = FONT_FILES.map((f) => resolve(ROOT, "server/fonts", f));

/** Note de chaque niveau : 1 à 6 étoiles. */
const OVERALL = [0, 22, 38, 52, 67, 82, 94];

function cardFor(stars: number, profileId: string, base: CardData = FIXTURES.silver): CardData {
  const p = FIXTURES.silver.profile!;
  return { ...base, id: `chase-${profileId}-${stars}`, overall: OVERALL[stars], profile: { ...p, id: profileId } };
}

const backdrops = new Map<string, string>();
function backdrop(scene: string): string {
  let uri = backdrops.get(scene);
  if (!uri) {
    uri = "data:image/jpeg;base64," + readFileSync(resolve(ROOT, "web/public/profiles", `${scene}.jpg`)).toString("base64");
    backdrops.set(scene, uri);
  }
  return uri;
}

function frame(plan: ChasePlan, t: number, idPrefix: string, w = SW, h = SH) {
  return createElement(ChaseFrame, { t, plan, width: w, height: h, lang, insetTop: 0, backdropHref: backdrop(plan.scene), idPrefix });
}

function png(svg: string, width: number): Buffer {
  return new Resvg(svg, { font: { fontFiles: fonts, loadSystemFonts: false, defaultFontFamily: "Outfit" }, fitTo: { mode: "width", value: width } })
    .render()
    .asPng();
}

/** Les instants clés d'un plan, avec leur légende. */
function moments(plan: ChasePlan): [string, number][] {
  const out: [string, number][] = [["ouverture", 0.7]];
  for (const b of plan.beats) out.push([`etoile ${b.star}`, b.at + (b.star === 3 ? 0.55 : 0.95)]);
  if (plan.flicker) out.push(["clignote", plan.flicker.at + 0.03]);
  out.push(["freinage", plan.brakeAt + 0.75]);
  out.push(["arret", plan.flashAt - 0.02]);
  out.push(["flash", plan.flashAt + 0.1]);
  return out;
}

function sheet(name: string, plan: ChasePlan) {
  const ms = moments(plan);
  const cols = Math.min(5, ms.length);
  const rows = Math.ceil(ms.length / cols);
  const pad = 16;
  const lab = 22;
  const W = cols * SW + (cols + 1) * pad;
  const H = rows * (SH + lab) + (rows + 1) * pad;
  const el = createElement(
    "svg",
    { xmlns: "http://www.w3.org/2000/svg", width: W, height: H, viewBox: `0 0 ${W} ${H}` },
    createElement("rect", { width: W, height: H, fill: "#1a1b2e" }),
    ...ms.map(([label, t], i) => {
      const x = pad + (i % cols) * (SW + pad);
      const y = pad + Math.floor(i / cols) * (SH + lab + pad);
      return createElement(
        "g",
        { key: i, transform: `translate(${x} ${y})` },
        createElement("text", { x: 0, y: 15, fill: "#e5ddff", fontSize: 14, fontFamily: "JetBrains Mono", fontWeight: 500 }, `${label} · t=${t.toFixed(2)}`),
        createElement("g", { transform: `translate(0 ${lab})` }, frame(plan, t, `f${i}`)),
      );
    }),
  );
  writeFileSync(resolve(OUT, `${name}.png`), png(renderToStaticMarkup(el), W));
  console.log("→", resolve(OUT, `${name}.png`));
}

function single(name: string, plan: ChasePlan, t: number, w = SW, h = SH) {
  const svg = renderToStaticMarkup(frame(plan, t, "s", w, h));
  writeFileSync(resolve(OUT, `${name}.png`), png(svg, w * 2));
  console.log("→", resolve(OUT, `${name}.png`), `${(svg.match(/<[a-zA-Z]/g) ?? []).length} nœuds`);
}

const only = opt("only")?.split(",").map(Number) ?? [1, 3, 6];
const tArg = opt("t");
const profileArg = opt("profile");

if (tArg !== undefined) {
  const plan = chasePlan(cardFor(only[0] ?? 6, profileArg ?? "arsonist"));
  single(`frame-${plan.scene}-${plan.level}-${tArg}`, plan, Number(tArg));
} else {
  const profiles = profileArg ? [profileArg] : ["kingpin", "arsonist", "night_owl"];
  for (const prof of profiles) for (const n of only) sheet(`sheet-${prof}-${n}`, chasePlan(cardFor(n, prof)));
  // en grand : la sixième étoile à son sommet, au téléphone, au petit téléphone et sur ordinateur
  const six = chasePlan(cardFor(6, profiles[profiles.length - 1]));
  const peak = six.beats[5].at + 1.0;
  single("big-six-390", six, peak);
  single("big-six-360x640", six, peak, 360, 640);
  single("big-six-1440x900", six, peak, 1440, 900);
}
