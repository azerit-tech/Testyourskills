// Ce que le site pose sur le film (§18.36, docs/cinematique-poursuite.md §2.2,
// §3.3) : deux bandes d'encre, les six étoiles, la radio, l'arrêt sur image
// (deux tons, toise, plaque, niveau), les deux images d'encre de la coupe, le
// grain et la vignette. Tout vient de hudAt : aucun état, aucune animation CSS
// qui dériverait de l'image. Mat : aplats, ni halo ni ombre lumineuse.
import type { Lang } from "../../../shared/types";
import type { FilmPlan, Hud } from "../../../shared/film";

/** Tirage pseudo-aléatoire déterministe (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STAR = "M12 1.6l3.05 6.55 7.15.85-5.28 4.92 1.4 7.08L12 17.48 5.68 21l1.4-7.08L1.8 9l7.15-.85z";

let tile: string | null = null;
/** La tuile de grain : 128 px de bruit, tirée une fois pour la page, toujours la même. */
function grainTile(): string {
  if (tile !== null) return tile;
  tile = "";
  try {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d");
    if (!g) return tile;
    const img = g.createImageData(128, 128);
    const r = rng(0x5eed);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.floor(r() * 256);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    tile = c.toDataURL("image/png");
  } catch {
    /* sans canvas : pas de grain */
  }
  return tile;
}

export function FilmHud({ plan, hud, lang }: { plan: FilmPlan; hud: Hud; lang: Lang }) {
  const grain = grainTile();
  return (
    <>
      {hud.freeze && (
        <>
          {/* les ombres de l'image gelée remontent à la teinte d'ombre : jamais de noir */}
          <div className="film-shadow" />
          {/* la toise de la photo d'identité */}
          <div className="film-rule" />
        </>
      )}
      {grain && <div className="film-grain" style={{ backgroundImage: `url(${grain})`, transform: `translate(${hud.grain[0]}px, ${hud.grain[1]}px)` }} />}
      <div className="film-vignette" />
      {hud.ink && <div className="film-ink" />}

      {hud.freeze && (
        <div className="film-mug">
          <span className="film-plate">{plan.plate}</span>
          <span className="film-level" style={{ transform: `scale(${hud.freeze.titleScale})` }}>
            {plan.title[lang]}
          </span>
        </div>
      )}

      <div className="film-band film-band-top" style={{ transform: `translateY(${(hud.bands - 1) * 100}%)` }}>
        <div className="film-stars">
          {hud.stars.map((s, i) => (
            <svg key={i} className={`film-star${s.on ? " is-on" : ""}`} viewBox="0 0 24 24" width="26" height="26" style={s.scale !== 1 ? { transform: `scale(${s.scale})` } : undefined}>
              <path d={STAR} />
            </svg>
          ))}
        </div>
      </div>
      <div className="film-band film-band-bottom" style={{ transform: `translateY(${(1 - hud.bands) * 100}%)` }}>
        {hud.radio && (
          <p className="film-radio">
            <i className={`film-square is-${hud.radio.square}`} />
            <span>{hud.radio.text}</span>
          </p>
        )}
      </div>
    </>
  );
}
