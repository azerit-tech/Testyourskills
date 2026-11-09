// Fiche interactive : enveloppe <Card> (SVG identique au rendu serveur) avec
// l'inclinaison 3D (12° max, doigt ou souris, retour élastique), le grain
// et le balayage de révélation. Style mat (SPEC §18.18) : ni reflet
// holographique ni glare ; seul ★★★★★★ porte un halo, son contour éclairé.
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { CardData, Lang } from "../../../shared/types";
import { styleOf } from "../../../shared/types";
import { Card } from "../../../shared/card/Card";
import { CARD_MASK_URL, CARD_PATH } from "../../../shared/card/geometry";
import { themeCssVars, themeOf } from "../../../shared/card/themes";
import "./fonts.css";
import "./card.css";

export { CARD_PATH, CARD_MASK_URL };

export interface CardViewProps {
  card: CardData;
  lang?: Lang;
  /** Défaut true : inclinaison qui suit le pointeur. */
  interactive?: boolean;
  /** Joue le balayage de lumière à l'apparition. */
  reveal?: boolean;
  idPrefix?: string;
  className?: string;
}

const MAX_TILT = 12;

/** Silhouette de la carte, pour réutiliser le masque ailleurs (pack, comparaison). */
export function useCardShape() {
  return { path: CARD_PATH, maskUrl: CARD_MASK_URL, viewBox: "0 0 360 520", aspectRatio: 360 / 520 };
}

/**
 * Mouvement réduit : préférence système, ou forcé par <html data-motion="reduce">
 * (bascule de la galerie, tests).
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => readReduced());
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(readReduced());
    mq?.addEventListener?.("change", update);
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });
    return () => {
      mq?.removeEventListener?.("change", update);
      mo.disconnect();
    };
  }, []);
  return reduced;
}

function readReduced(): boolean {
  if (typeof window === "undefined") return false;
  if (document.documentElement.dataset.motion === "reduce") return true;
  if (document.documentElement.dataset.motion === "full") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/** Ressort amorti : léger dépassement au retour, d'où l'effet élastique. */
interface Spring {
  x: number;
  v: number;
  target: number;
}
const spring = (x: number): Spring => ({ x, v: 0, target: x });
function step(s: Spring, k: number, damping: number) {
  s.v += (s.target - s.x) * k;
  s.v *= 1 - damping;
  s.x += s.v;
}

export function CardView({ card, lang, interactive = true, reveal = false, idPrefix, className }: CardViewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const live = interactive && !reduced;
  const [revealing, setRevealing] = useState(false);
  const style = styleOf(card);

  // Balayage à l'apparition (et à chaque passage de reveal à true)
  useEffect(() => {
    if (!reveal || reduced) {
      setRevealing(false);
      return;
    }
    setRevealing(true);
    const t = window.setTimeout(() => setRevealing(false), 1500);
    return () => window.clearTimeout(t);
  }, [reveal, reduced]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const write = (rx: number, ry: number, mx: number, my: number, active: number) => {
      el.style.setProperty("--rx", rx.toFixed(3));
      el.style.setProperty("--ry", ry.toFixed(3));
      el.style.setProperty("--mx", `${mx.toFixed(2)}%`);
      el.style.setProperty("--my", `${my.toFixed(2)}%`);
      el.style.setProperty("--bgx", `${(37 + (mx / 100) * 26).toFixed(2)}%`);
      el.style.setProperty("--bgy", `${(33 + (my / 100) * 34).toFixed(2)}%`);
      el.style.setProperty("--active", active.toFixed(3));
    };
    if (!live) {
      write(0, 0, 50, 30, 0);
      return;
    }

    const rx = spring(0), ry = spring(0), mx = spring(50), my = spring(30), act = spring(0);
    const all = [rx, ry, mx, my, act];
    let raf = 0;
    const tick = () => {
      for (const s of all) step(s, 0.075, 0.18);
      write(rx.x, ry.x, mx.x, my.x, Math.max(0, Math.min(1, act.x)));
      const moving = all.some((s) => Math.abs(s.v) > 0.002 || Math.abs(s.target - s.x) > 0.01);
      raf = moving ? requestAnimationFrame(tick) : 0;
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const aim = (px: number, py: number) => {
      // px, py dans [0, 1] sur la carte
      const cx = Math.max(0, Math.min(1, px));
      const cy = Math.max(0, Math.min(1, py));
      ry.target = (cx - 0.5) * 2 * MAX_TILT;
      rx.target = (0.5 - cy) * 2 * MAX_TILT;
      mx.target = cx * 100;
      my.target = cy * 100;
      act.target = 1;
      kick();
    };
    const rest = () => {
      rx.target = 0;
      ry.target = 0;
      mx.target = 50;
      my.target = 30;
      act.target = 0;
      kick();
    };

    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      aim((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    };
    // Le doigt ou la souris, rien d'autre : aucun capteur de mouvement, donc
    // aucune demande d'accès sur iPhone (§18.27). Le toucher incline dès qu'il se pose.
    el.addEventListener("pointerdown", onMove);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", rest);
    el.addEventListener("pointercancel", rest);

    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("pointerdown", onMove);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", rest);
      el.removeEventListener("pointercancel", rest);
    };
  }, [live]);

  const th = themeOf(card);
  const vars = { ...themeCssVars(th), "--tys-mask": CARD_MASK_URL } as CSSProperties;

  return (
    <div
      ref={ref}
      className={["tys-card", revealing ? "is-revealing" : "", className ?? ""].filter(Boolean).join(" ")}
      data-style={style}
      data-dark="true"
      data-level={th.key}
      data-interactive={interactive ? "true" : "false"}
      data-static={live ? "false" : "true"}
      style={vars}
    >
      <div className="tys-card__rotator">
        <div className="tys-card__shadow" aria-hidden />
        <Card card={card} lang={lang} idPrefix={idPrefix} className="tys-card__svg" />
        <div className="tys-card__fx tys-card__grain" aria-hidden />
        <div className="tys-card__fx tys-card__sweep" aria-hidden />
      </div>
    </div>
  );
}

export default CardView;
