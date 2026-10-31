// Galerie de maquette (dev) : toutes les fixtures en CardView interactif,
// bascules fr/en et mouvement réduit, comparaison, et aperçu des PNG serveur
// présents dans var/renders (npx tsx scripts/render-fixtures.ts).
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { FIXTURES, FIXTURE_COMPARISON } from "../../shared/fixtures";
import { STAT_CODES, type Lang } from "../../shared/types";
import { CardView } from "./card/CardView";

const renders = import.meta.glob("../../var/renders/*.png", { eager: true, query: "?url", import: "default" }) as Record<string, string>;

const css = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #0a0a1f; color: #f3f1ff; font-family: Inter, system-ui, sans-serif;
    background-image: radial-gradient(1200px 600px at 10% -10%, rgba(255,63,164,.14), transparent 60%),
      radial-gradient(900px 600px at 100% 110%, rgba(63,216,255,.10), transparent 60%); background-attachment: fixed; }
  header { position: sticky; top: 0; z-index: 10; display: flex; flex-wrap: wrap; gap: 12px 20px; align-items: center;
    justify-content: space-between; padding: 14px 16px; background: rgba(10,15,22,.82); backdrop-filter: blur(10px);
    border-bottom: 1px solid #223040; }
  h1 { margin: 0; font: 700 22px/1 "Barlow Condensed", sans-serif; letter-spacing: .06em; text-transform: uppercase; }
  h1 span { color: #ff3fa4; }
  h2 { margin: 56px 0 20px; font: 500 12px/1 "JetBrains Mono", monospace; letter-spacing: .22em; text-transform: uppercase; color: #8494a5; }
  .controls { display: flex; gap: 8px; flex-wrap: wrap; }
  .seg { display: inline-flex; border: 1px solid #223040; border-radius: 999px; overflow: hidden; background: #101722; }
  .seg button { appearance: none; border: 0; background: transparent; color: #8494a5; padding: 8px 14px;
    font: 500 12px/1 "JetBrains Mono", monospace; letter-spacing: .08em; cursor: pointer; }
  .seg button[aria-pressed="true"] { background: #ff3fa4; color: #0a0a1f; }
  main { max-width: 1560px; margin: 0 auto; padding: 8px 16px 96px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(360px, 100%), 1fr)); gap: 56px 32px; justify-items: center; }
  figure { margin: 0; display: grid; gap: 14px; justify-items: center; width: 100%; }
  figcaption { font: 500 11px/1 "JetBrains Mono", monospace; letter-spacing: .16em; color: #8494a5; text-transform: uppercase; }
  .cmp { display: flex; flex-wrap: wrap; gap: 24px; align-items: center; justify-content: center; }
  .cmp > div { width: min(360px, 100%); }
  .deltas { display: grid; gap: 8px; min-width: 140px; }
  .delta { display: flex; justify-content: space-between; gap: 18px; padding: 8px 14px; border-radius: 999px; border: 1px solid;
    font: 500 13px/1 "JetBrains Mono", monospace; }
  .delta b { font: 800 20px/1 "Barlow Condensed", sans-serif; }
  .headline { text-align: center; font: 700 clamp(26px, 4vw, 40px)/1.05 "Barlow Condensed", sans-serif; text-transform: uppercase; margin: 0 0 28px; }
  .pngs { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(420px, 100%), 1fr)); gap: 20px; }
  .pngs a { display: block; border: 1px solid #223040; border-radius: 10px; overflow: hidden; background: #101722; }
  .pngs img { display: block; width: 100%; height: auto; }
  .pngs span { display: block; padding: 8px 10px; font: 400 11px/1.2 "JetBrains Mono", monospace; color: #8494a5; }
  .empty { color: #8494a5; font: 400 13px/1.5 "JetBrains Mono", monospace; }
`;

function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="group">
      {options.map(([v, label]) => (
        <button key={v} aria-pressed={v === value} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function Gallery() {
  const [lang, setLang] = useState<Lang | "auto">("auto");
  const [motion, setMotion] = useState<"auto" | "reduce">("auto");
  const [revealKey, setRevealKey] = useState(0);

  useEffect(() => {
    if (motion === "reduce") document.documentElement.dataset.motion = "reduce";
    else delete document.documentElement.dataset.motion;
  }, [motion]);

  const l = (fallback: Lang) => (lang === "auto" ? fallback : lang);
  const cmpLang: Lang = lang === "auto" ? "fr" : lang;
  const pngs = Object.entries(renders)
    .filter(([p]) => /-(og|portrait)(-fr|-en)?\.png$/.test(p))
    .sort(([a], [b]) => a.localeCompare(b));

  return (
    <>
      <style>{css}</style>
      <header>
        <h1>
          Testyourskills <span>· galerie</span>
        </h1>
        <div className="controls">
          <Seg value={lang} onChange={setLang} options={[["auto", "AUTO"], ["fr", "FR"], ["en", "EN"]]} />
          <Seg value={motion} onChange={setMotion} options={[["auto", "MOUVEMENT"], ["reduce", "RÉDUIT"]]} />
          <div className="seg">
            <button onClick={() => setRevealKey((k) => k + 1)}>REJOUER LA RÉVÉLATION</button>
          </div>
        </div>
      </header>
      <main>
        <h2>Fixtures</h2>
        <div className="grid">
          {Object.entries(FIXTURES).map(([key, card]) => (
            <figure key={key + revealKey}>
              <CardView card={card} lang={l(card.lang)} reveal={revealKey > 0} idPrefix={`g-${key}`} />
              <figcaption>{key}</figcaption>
            </figure>
          ))}
        </div>

        <h2>Comparaison</h2>
        <p className="headline">{FIXTURE_COMPARISON.headline[cmpLang]}</p>
        <div className="cmp">
          <div>
            <CardView card={FIXTURE_COMPARISON.cv} lang={cmpLang} idPrefix="cmp-cv" />
          </div>
          <div className="deltas">
            {STAT_CODES.map((c) => {
              const d = FIXTURE_COMPARISON.deltas[c];
              const col = c === "BUZZ" ? "#ffd23f" : d > 0 ? "#8ce06b" : d < 0 ? "#ff5c7a" : "#7d7a9c";
              return (
                <div key={c} className="delta" style={{ borderColor: col + "66", background: col + "1a" }}>
                  <span style={{ color: "#8494a5" }}>{c}</span>
                  <b style={{ color: col }}>{d > 0 ? `+${d}` : d < 0 ? `−${-d}` : "0"}</b>
                </div>
              );
            })}
          </div>
          <div>
            <CardView card={FIXTURE_COMPARISON.github} lang={cmpLang} idPrefix="cmp-gh" />
          </div>
        </div>

        <h2>Statique (interactive = false)</h2>
        <div className="grid">
          <figure>
            <CardView card={FIXTURES.icon} interactive={false} idPrefix="st-icon" />
            <figcaption>icon · statique</figcaption>
          </figure>
        </div>

        <h2>Images serveur (var/renders)</h2>
        {pngs.length === 0 ? (
          <p className="empty">Aucun rendu : lancer npx tsx scripts/render-fixtures.ts puis relancer Vite.</p>
        ) : (
          <div className="pngs">
            {pngs.map(([p, url]) => (
              <a key={p} href={url} target="_blank" rel="noreferrer">
                <img src={url} alt={p} loading="lazy" />
                <span>{p.split("/").pop()}</span>
              </a>
            ))}
          </div>
        )}
      </main>
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Gallery />
  </StrictMode>,
);
