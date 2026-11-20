// Le geste du visiteur toujours sous le pouce (SPEC §18.48, §18.104) : sur téléphone, la page
// vue par un visiteur porte la même barre fixe que celle de la personne fichée,
// pleine largeur, avec un seul bouton rose. Sur une fiche dénoncée qu'on peut reprendre,
// « C'est bien moi » (§18.118), seul ; sinon, sans fiche à soi, « Faire ma fiche », qui mène
// au champ de « À ton tour » ; avec sa fiche, sur celle d'un autre, pas de barre : rien
// ne pousse à envoyer ou à partager à l'arrivée (le duel est plus bas, en contour).
// Elle sort par le bas dès que ce bloc touche l'écran (son bouton prend le relais),
// tant que les boutons d'une fiche dénoncée sont à l'écran, et pendant qu'on écrit.
// Au-delà de 640 px elle n'est pas rendue : ces blocs sont dans la colonne de droite.
import { useEffect, useState } from "react";
import { useT } from "../i18n";
import { useMediaQuery, useReducedMotion } from "../lib/util";

/**
 * Le bouton de la barre du visiteur (§18.104) : « verify » sur une fiche dénoncée qu'on peut
 * reprendre (qu'on ait ou non une autre fiche ici), « make » pour qui n'a pas de fiche,
 * null pour qui a déjà la sienne et regarde celle d'un autre.
 */
export function visitorBar(o: { verify: boolean; hasOwn: boolean }): "verify" | "make" | null {
  if (o.verify) return "verify";
  return o.hasOwn ? null : "make";
}

interface Props {
  /** Le bloc d'une fiche dénoncée vient d'arriver dans la page : la barre le guette aussi. */
  watch?: boolean;
  /** Fiche dénoncée qu'on peut reprendre ou refaire : « C'est bien moi », seul bouton (§18.104, §18.118). */
  onLawyer?: (() => void) | null;
}

export function MakeYours({ watch = false, onLawyer = null }: Props) {
  const narrow = useMediaQuery("(max-width: 640px)");
  return narrow ? <Bar watch={watch} onLawyer={onLawyer} /> : null;
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

function Bar({ watch, onLawyer }: Required<Props>) {
  const { t } = useT();
  const reduced = useReducedMotion();
  // null : on ne sait pas encore ce qui est à l'écran, la barre attend (pas d'apparition furtive).
  const [seen, setSeen] = useState<boolean | null>(null);
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    // Fiche dénoncée : la barre reste tant que le bouton « C'est bien moi » du bloc n'est pas entier
    // à l'écran (§18.52) : un bouton rose coupé au bas de l'écran ne remplace pas celui de la barre.
    const den = document.querySelector(".denounced .pill") ?? document.querySelector(".denounced");
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
  }, [watch]);

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
  // Un seul bouton : reprendre sa fiche dénoncée (« C'est bien moi », §18.118), sinon faire la sienne (§18.104).
  const label = onLawyer ? t.denounce.itsMe : t.result.makeYours;
  return (
    <div className={`dock make-yours${on ? " is-on" : ""}`} role="region" aria-label={label} inert={on ? undefined : true}>
      <button type="button" className="pill pill-big dock-main" onClick={onLawyer ?? (() => toYourTurn(reduced))}>
        {label}
      </button>
    </div>
  );
}
