// Le geste du visiteur toujours sous le pouce (SPEC §18.48) : sur téléphone, la page
// vue par un visiteur porte la même barre fixe que celle de la personne fichée,
// pleine largeur, avec un seul bouton rose. Sans fiche à soi, « Faire ma fiche »,
// qui mène au champ de « À ton tour » ; sur une fiche dénoncée, « C'est moi » d'abord ;
// avec sa fiche, « Lui envoyer mon score », comme le bouton du duel.
// Elle sort par le bas dès que ce bloc touche l'écran (son bouton prend le relais),
// tant que les boutons d'une fiche dénoncée sont à l'écran, et pendant qu'on écrit.
// Au-delà de 640 px elle n'est pas rendue : ces blocs sont dans la colonne de droite.
import { useEffect, useState } from "react";
import { useT } from "../i18n";
import { useMediaQuery, useReducedMotion } from "../lib/util";

interface Props {
  /** Le bloc d'une fiche dénoncée vient d'arriver dans la page : la barre le guette aussi. */
  watch?: boolean;
  /** Fiche dénoncée qu'on peut reprendre ou refaire : « C'est moi » en rose, « Faire ma fiche » en contour (§18.48). */
  onLawyer?: (() => void) | null;
  /** Le visiteur a sa fiche : « Lui envoyer mon score », seul bouton de la barre. */
  onSend?: (() => void) | null;
}

export function MakeYours({ watch = false, onLawyer = null, onSend = null }: Props) {
  const narrow = useMediaQuery("(max-width: 640px)");
  return narrow ? <Bar watch={watch} onLawyer={onLawyer} onSend={onSend} /> : null;
}

const isField = (el: Element | null) => !!el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);

/** Vers le champ de « À ton tour » : la barre, le jury après le vote et le bloc d'une fiche dénoncée y mènent. */
export function toYourTurn(reduced: boolean) {
  const you = document.getElementById("you");
  const input = you?.querySelector<HTMLInputElement>("input:not([type='file'])");
  (input ?? you)?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
  // Dans le geste, sinon le clavier ne s'ouvre pas sur iPhone.
  input?.focus({ preventScroll: true });
}

function Bar({ watch, onLawyer, onSend }: Required<Props>) {
  const { t } = useT();
  const reduced = useReducedMotion();
  // null : on ne sait pas encore ce qui est à l'écran, la barre attend (pas d'apparition furtive).
  const [seen, setSeen] = useState<boolean | null>(null);
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    // Fiche dénoncée : la barre reste tant que le bouton « C'est moi » du bloc n'est pas entier à l'écran
    // (§18.52) : un bouton rose coupé au bas de l'écran ne remplace pas celui de la barre.
    // Le duel : seul son bouton prend le relais (le bloc dénoncé est alors en contour).
    const den = onSend ? null : (document.querySelector(".denounced .pill") ?? document.querySelector(".denounced"));
    const marks = [document.getElementById("you"), den].filter((el): el is Element => !!el);
    if (!marks.length || typeof IntersectionObserver !== "function") return setSeen(false);
    const on = new Set<Element>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const shown = e.target === den ? e.intersectionRatio >= 0.98 : e.isIntersecting;
          if (shown) on.add(e.target);
          else on.delete(e.target);
        }
        setSeen(on.size > 0);
      },
      { threshold: [0, 0.98] },
    );
    marks.forEach((m) => io.observe(m));
    return () => io.disconnect();
  }, [watch, onSend]);

  // Le clavier est ouvert : la barre ne passe pas devant le champ.
  useEffect(() => {
    const on = () => setTyping(isField(document.activeElement));
    document.addEventListener("focusin", on);
    document.addEventListener("focusout", on);
    return () => {
      document.removeEventListener("focusin", on);
      document.removeEventListener("focusout", on);
    };
  }, []);

  // La marge basse de la page : la barre ne couvre jamais le dernier contenu.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("has-dock");
    return () => root.classList.remove("has-dock");
  }, []);

  const on = seen === false && !typing;
  if (onSend)
    return (
      <div className={`dock make-yours${on ? " is-on" : ""}`} role="region" aria-label={t.denounce.sendScore} inert={on ? undefined : true}>
        <button type="button" className="pill pill-big dock-main" onClick={onSend}>
          {t.denounce.sendScore}
        </button>
      </div>
    );
  return (
    <div className={`dock make-yours${on ? " is-on" : ""}`} role="region" aria-label={t.result.makeYours} inert={on ? undefined : true}>
      {onLawyer && (
        <button type="button" className="pill pill-big dock-main" onClick={onLawyer}>
          {t.denounce.lawyerShort}
        </button>
      )}
      <button type="button" className={onLawyer ? "pill pill-big pill-ghost" : "pill pill-big dock-main"} onClick={() => toYourTurn(reduced)}>
        {t.result.makeYours}
      </button>
    </div>
  );
}
