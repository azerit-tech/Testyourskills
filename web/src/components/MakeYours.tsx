// « Fais la tienne » toujours visible (SPEC §18.27) : sur téléphone, une pilule
// fixe en bas de la page partagée, qui mène au champ de « Et toi ? ». Elle
// s'efface dès que ce bloc est à l'écran ou qu'on y écrit. Avec une fiche déjà
// faite dans ce navigateur, elle dit « Ma fiche » et y mène. Masquée au-delà de
// 640 px par la feuille de style.
import { useEffect, useState } from "react";
import { useT } from "../i18n";
import { onLinkClick } from "../lib/router";
import type { MyCard } from "../lib/session";
import { useReducedMotion } from "../lib/util";

export function MakeYours({ mine }: { mine: MyCard | null }) {
  const { t } = useT();
  const reduced = useReducedMotion();
  // Effacée tant qu'on ne sait pas : pas d'apparition furtive au chargement.
  const [seen, setSeen] = useState(true);
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    const you = document.getElementById("you");
    if (!you) return;
    const onIn = () => setTyping(true);
    const onOut = () => setTyping(false);
    you.addEventListener("focusin", onIn);
    you.addEventListener("focusout", onOut);
    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver === "undefined") setSeen(false);
    else {
      // La moitié du bloc à l'écran : son champ arrive là où se tient la pilule.
      io = new IntersectionObserver(([e]) => setSeen(!!e && e.intersectionRatio >= 0.5), { threshold: [0, 0.5, 1] });
      io.observe(you);
    }
    return () => {
      io?.disconnect();
      you.removeEventListener("focusin", onIn);
      you.removeEventListener("focusout", onOut);
    };
  }, []);

  const off = seen || typing;
  const cls = `pill pill-big make-yours${off ? " is-off" : ""}`;
  const hidden = { "aria-hidden": off || undefined, tabIndex: off ? -1 : undefined };

  if (mine) {
    const href = `/c/${mine.id}`;
    return (
      <a className={cls} href={href} onClick={(e) => onLinkClick(e, href)} {...hidden}>
        {t.denounce.mine}
      </a>
    );
  }

  const toField = () => {
    const you = document.getElementById("you");
    const input = you?.querySelector<HTMLInputElement>("input:not([type='file'])");
    (input ?? you)?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
    input?.focus({ preventScroll: true });
  };
  return (
    <button type="button" className={cls} onClick={toField} {...hidden}>
      {t.result.makeYours}
    </button>
  );
}
