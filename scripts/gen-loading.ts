// Génère les illustrations de l'écran de chargement (SPEC §17.5) : une dizaine
// d'images 16:9 de devs et de bureaux dans le style des écrans de chargement
// de la série (aplats, contours à l'encre, lumière de fin de journée, palmiers,
// néons rose et cyan), par un modèle d'image via OpenRouter. Une fois, à la
// main : les images sont ensuite relues, triées, converties en WebP (1600 × 900,
// qualité 80) dans web/public/loading/, puis listées dans
// web/src/components/LoadingScenes.tsx (PAINTED).
//
//   npx tsx --env-file=.env scripts/gen-loading.ts [--model google/gemini-3.1-flash-image] [--only 3,5] [--out <dossier>]
//
// Les PNG bruts vont dans <out>/png/ (par défaut var/loading-src/, hors dépôt),
// la conversion WebP passe par `npx sharp-cli`. OpenRouter exige au moins 1 $ de
// crédit pour une sortie image, quel que soit le prix de l'appel.

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const STYLE =
  "Stylized illustration in the manner of a 2000s open-world video game loading screen: flat colour fields, bold clean ink outlines, " +
  "painterly but graphic, warm late-afternoon light turning to dusk, pink and cyan neon accents, palm trees, art-deco seaside city. " +
  "Invented characters, diverse, no real person. Absolutely no text, no letters, no logos, no brands, no watermark. Wide 16:9 composition, cinematic.";

/** Dix scènes de devs et de bureaux. Les sujets évitent tout ce qui identifie le jeu. */
const SCENES = [
  "A young woman developer with headphones typing on a laptop at a rooftop bar at sunset, the ocean and a neon skyline behind her.",
  "A developer seen from behind at a desk with three glowing monitors in a dark office, a huge window showing a neon-lit city at dusk.",
  "An open-plan office at golden hour, people at standing desks, potted palms, pink neon sign glow on the glass, a skateboard leaning on a desk.",
  "A man in a loud shirt coding on a laptop on a sun lounger by a hotel pool, a flamingo float, palms, pastel art-deco hotel behind.",
  "Two developers pair-programming in a street café under a striped awning, scooters parked, palm-lined avenue, pink sky.",
  "A server room lit by pink and cyan LEDs, a developer with a coffee cup checking a rack, cables, cool blue shadows.",
  "A developer riding a bicycle with a laptop bag along a beachfront promenade at dusk, palms, neon hotel façades.",
  "A woman presenting a whiteboard full of diagrams to a small team in a glass meeting room, sunset city behind the glass.",
  "A late-night coder at a kitchen table in a small apartment, window open on a neon-lit street, a cat on the keyboard.",
  "A rooftop party of developers around a laptop, string lights, palms, the bay and a lit skyline at blue hour.",
];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function generate(model: string, prompt: string): Promise<{ bytes: Buffer; ext: string; usage?: unknown; ms: number }> {
  const t0 = Date.now();
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY ?? ""}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.BASE_URL || "https://skills.azerit.tech",
      "X-Title": "Testyourskills",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: `Generate an image. ${STYLE} Scene: ${prompt}` }],
      modalities: ["image", "text"],
      image_config: { aspect_ratio: "16:9" },
    }),
  });
  const json = (await res.json()) as {
    error?: { message?: string };
    usage?: unknown;
    choices?: { message?: { images?: { image_url?: { url?: string } }[] } }[];
  };
  if (json.error) throw new Error(json.error.message ?? "erreur OpenRouter");
  const url = json.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!url) throw new Error("pas d'image dans la réponse");
  const [head, b64] = url.split(",", 2);
  const ext = head.includes("png") ? "png" : head.includes("webp") ? "webp" : "jpg";
  return { bytes: Buffer.from(b64, "base64"), ext, usage: json.usage, ms: Date.now() - t0 };
}

function toWebp(src: string, dst: string) {
  execFileSync("npx", ["--yes", "sharp-cli", "-i", src, "-o", dst, "-f", "webp", "-q", "80", "resize", "1600", "900"], { stdio: "inherit" });
}

async function main() {
  if (!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY manquante (npx tsx --env-file=.env …)");
  const model = arg("--model") ?? "google/gemini-3.1-flash-image";
  const out = arg("--out") ?? "var/loading-src";
  const only = arg("--only")?.split(",").map(Number);
  mkdirSync(join(out, "png"), { recursive: true });
  mkdirSync("web/public/loading", { recursive: true });

  for (let i = 0; i < SCENES.length; i++) {
    const n = i + 1;
    if (only && !only.includes(n)) continue;
    const name = String(n).padStart(2, "0");
    const webp = join("web/public/loading", `${name}.webp`);
    if (existsSync(webp) && !only) {
      console.log(`${name}: déjà là`);
      continue;
    }
    try {
      const r = await generate(model, SCENES[i]);
      const png = join(out, "png", `${name}.${r.ext}`);
      writeFileSync(png, r.bytes);
      console.log(`${name}: ${r.ext} ${Math.round(r.bytes.length / 1024)} Ko en ${(r.ms / 1000).toFixed(1)} s`, JSON.stringify(r.usage));
      toWebp(png, webp);
    } catch (e) {
      console.error(`${name}: ${(e as Error).message}`);
    }
  }
  console.log("Relire chaque image, jeter celles qui ratent, puis lister les gardées dans LoadingScenes.tsx (PAINTED).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
