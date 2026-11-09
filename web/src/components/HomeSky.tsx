// Le ciel de l'accueil (§18.29) : les lieux du crime se succèdent en fondu
// enchaîné lent derrière la promesse, chacun avec un lent travelling.
// La première image est dans le premier rendu, en priorité haute ; les quatre
// autres ne se montent qu'une fois la première affichée et le navigateur au
// repos, pour ne rien retarder. Onglet caché : tout s'arrête. Mouvement réduit
// ou économiseur de données : une seule image fixe.
import { useEffect, useRef, useState } from "react";

/** L'ordre des ciels ; le premier est aussi celui du mouvement réduit. */
export const SKY_ORDER = ["kingpin", "arsonist", "delivery_machine", "night_owl", "default"] as const;
/** Temps à l'écran de chaque ciel, fondu compris dans le suivant (1,2 s, en CSS). */
export const SKY_HOLD_MS = 6000;

function still(): boolean {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return true;
  return !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
}

export function HomeSky() {
  const [rest, setRest] = useState(false);
  const [on, setOn] = useState(0);
  const [prev, setPrev] = useState(-1);
  const [paused, setPaused] = useState(false);
  const first = useRef<HTMLImageElement>(null);
  const cur = useRef(0);
  const loaded = useRef(new Set<number>([0]));

  useEffect(() => {
    if (still()) return;
    let alive = true;
    let timer: number | undefined;
    let idle: number | undefined;

    // Les autres ciels : après le premier affichage, quand le navigateur souffle.
    const mountRest = () => {
      const go = () => alive && setRest(true);
      if (window.requestIdleCallback) idle = window.requestIdleCallback(go, { timeout: 2000 });
      else timer = window.setTimeout(go, 300);
    };
    const img = first.current;
    if (!img || img.complete) mountRest();
    else img.addEventListener("load", mountRest, { once: true });

    // Le suivant qui est chargé ; s'il n'y en a pas encore, on réessaie dans une seconde.
    let cycle: number | undefined;
    const arm = (ms: number) => {
      window.clearTimeout(cycle);
      cycle = window.setTimeout(tick, ms);
    };
    const tick = () => {
      const n = SKY_ORDER.length;
      for (let k = 1; k < n; k++) {
        const i = (cur.current + k) % n;
        if (!loaded.current.has(i)) continue;
        setPrev(cur.current);
        setOn(i);
        cur.current = i;
        arm(SKY_HOLD_MS);
        return;
      }
      arm(1000);
    };
    const onVisibility = () => {
      if (document.hidden) {
        window.clearTimeout(cycle);
        setPaused(true);
      } else {
        setPaused(false);
        arm(SKY_HOLD_MS);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    onVisibility();

    return () => {
      alive = false;
      window.clearTimeout(timer);
      window.clearTimeout(cycle);
      if (idle !== undefined) window.cancelIdleCallback?.(idle);
      img?.removeEventListener("load", mountRest);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <div className={`home-sky${paused ? " is-paused" : ""}`} aria-hidden>
      {SKY_ORDER.map((id, i) =>
        i === 0 || rest ? (
          <img
            key={id}
            ref={i === 0 ? first : undefined}
            className={`home-sky-img${i === on ? " is-on" : i === prev ? " is-prev" : ""}`}
            src={`/profiles/${id}.jpg`}
            srcSet={`/profiles/${id}-s.jpg 576w, /profiles/${id}.jpg 1152w`}
            sizes="100vw"
            alt=""
            width={1152}
            height={768}
            fetchPriority={i === 0 ? "high" : "low"}
            decoding={i === 0 ? undefined : "async"}
            onLoad={i === 0 ? undefined : () => loaded.current.add(i)}
          />
        ) : null,
      )}
    </div>
  );
}
