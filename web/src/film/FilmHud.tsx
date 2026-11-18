// Ce que le site pose sur le film (§18.36, docs/cinematique-poursuite.md §2.2,
// §3.3), par-dessus l'image, rien n'étant gravé dans la vidéo : la rangée des
// six étoiles en haut, sur le ciel (la règle unique du §18.48 : remplies de
// gauche à droite, crème pleine, éteintes en contour), la jauge de l'étoile
// suivante, l'étoile qui tombe en grand puis rejoint sa place, une ligne sous
// la berline (une étiquette, une ligne), la plaque, le niveau et la ligne de
// l'étoile refusée à l'arrêt sur image (son image en deux tons, toise comprise,
// est tirée par freeze.ts), le score qui monte jusqu'à la note (§18.78), le
// grain, la vignette et deux ombres d'encre. Tout
// vient de hudAt : aucun état, aucune animation CSS qui dériverait de l'image.
// Mat : aplats, ni halo ni ombre lumineuse.
import type { CSSProperties } from "react";
import type { Lang } from "../../../shared/types";
import type { FilmPlan, Hud } from "../../../shared/film";
import { upper } from "../../../shared/card/text";

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

/**
 * La ligne sous la berline : son étiquette, puis le texte, sur une ligne dont le corps suit la longueur
 * (--n) ; posée sur l'image, ou sur la bande d'encre du bas (téléphone couché, Film.tsx).
 */
export function FilmLine({ line }: { line: Hud["line"] }) {
  if (!line) return null;
  return (
    <p className={`film-line${line.hit ? " is-hit" : ""}`} style={{ "--enter": line.enter, "--n": line.text.length } as CSSProperties}>
      <small className="film-line-label">{line.label}</small>
      <span className="film-line-text">{line.text}</span>
    </p>
  );
}

/** La ligne de l'étoile refusée, à l'arrêt sur image : « 3ᵉ étoile : à 7 points ». */
export function FilmVerdict({ plan, hud, lang }: { plan: FilmPlan; hud: Hud; lang: Lang }) {
  if (!plan.verdict || !hud.freeze) return null;
  const l = plan.verdict.line[lang];
  return (
    <span className="film-verdict" style={{ opacity: hud.freeze.verdict, "--n": l.ord.length + l.sup.length + l.rest.length } as CSSProperties}>
      {l.ord}
      {l.sup && <sup>{l.sup}</sup>}
      {l.rest}
    </span>
  );
}

/**
 * La part de la boîte de l'étoile (24 unités) que la jauge découvre, depuis le bas : le dessin va de 1,6 à 21,
 * la jauge vide s'arrête sous sa pointe basse, pleine elle le couvre entier.
 */
const gaugeHeight = (fill: number) => `${((3 + 19.4 * fill) / 24) * 100}%`;

/** Le score, un chiffre par case de largeur fixe : il ne tremble pas en montant, quelle que soit la police. */
function ScoreDigits({ n, className }: { n: number; className: string }) {
  return (
    <span className={className}>
      {String(n)
        .split("")
        .map((d, i) => (
          <i key={i}>{d}</i>
        ))}
    </span>
  );
}

export function FilmHud({ plan, hud, lang }: { plan: FilmPlan; hud: Hud; lang: Lang }) {
  const grain = grainTile();
  const stamp = hud.stamp;
  return (
    <>
      {grain && <div className="film-grain" style={{ backgroundImage: `url(${grain})`, transform: `translate(${hud.grain[0]}px, ${hud.grain[1]}px)` }} />}
      <div className="film-vignette" />
      {/* deux ombres d'encre, en haut sous les étoiles, en bas sous « Passer » : l'image reste entière */}
      <div className="film-shade" style={{ opacity: hud.bands }} />

      {hud.freeze && (
        <div className="film-mug">
          <span className="film-plate">
            <b>{upper(plan.plate, lang)}</b>
            <i>{plan.plateSub[lang]}</i>
          </span>
          <span className="film-level" style={{ transform: `scale(${hud.freeze.titleScale})`, "--n": plan.title[lang].length } as CSSProperties}>
            {plan.title[lang]}
          </span>
          <FilmVerdict plan={plan} hud={hud} lang={lang} />
        </div>
      )}

      <div className="film-stars" style={{ opacity: hud.bands }}>
        {hud.stars.map((s, i) => {
          const live = !s.on && s.fill !== undefined && s.pending === undefined;
          const cls = `film-star${s.on && !s.flying ? " is-on" : ""}${s.flying ? " is-flying" : ""}${live ? " is-live" : ""}${s.pending !== undefined ? " is-pending" : ""}`;
          return (
            <span key={i} className={cls} style={s.scale !== 1 ? { transform: `scale(${s.scale})` } : undefined}>
              <svg viewBox="0 0 24 24">
                <path className="film-star-rim" d={STAR} />
                <path className="film-star-body" d={STAR} style={s.pending !== undefined ? { strokeOpacity: s.pending } : undefined} />
              </svg>
              {s.fill !== undefined && (
                <span className="film-star-gauge" style={{ height: gaugeHeight(s.fill) }}>
                  <svg viewBox="0 0 24 24">
                    <path d={STAR} />
                  </svg>
                </span>
              )}
            </span>
          );
        })}
      </div>

      {/* le score qui monte (§18.78), sous la rangée : la montée adoucie, ou palier par palier en mouvement réduit */}
      <p className="film-score" style={{ opacity: hud.bands }} aria-hidden="true">
        <ScoreDigits n={hud.score.value} className="film-score-run" />
        <ScoreDigits n={hud.score.step} className="film-score-step" />
      </p>

      {stamp && (
        <svg className="film-stamp" viewBox="0 0 24 24" style={{ opacity: stamp.opacity, "--fly": stamp.fly, "--slap": stamp.scale, "--slot": stamp.star - 3.5 } as CSSProperties}>
          <path className="film-star-rim" d={STAR} />
          <path className="film-star-body" d={STAR} />
        </svg>
      )}

      <FilmLine line={hud.line} />

      {/* téléphone couché : la bande d'encre du bas, sous la colonne étroite ; la ligne s'y pose (Film.tsx) */}
      <div className="film-band film-band-bottom" style={{ transform: `translateY(${(1 - hud.bands) * 100}%)` }} />
    </>
  );
}
