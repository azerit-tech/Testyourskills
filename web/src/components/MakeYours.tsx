// « Fais la tienne » toujours sous le pouce (SPEC §18.48) : sur téléphone, la page
// vue par un visiteur porte la même barre fixe que celle de la personne fichée,
// pleine largeur, avec un seul bouton rose qui mène au champ de « À ton tour ».
// Elle sort par le bas dès que ce bloc touche l'écran (son bouton prend le relais),
// tant que le bloc d'une fiche dénoncée est à l'écran (il a ses deux boutons), et
// pendant qu'on écrit. Au-delà de 640 px elle n'est pas rendue : le formulaire est
// sous la fiche, dans la colonne de droite.
import { useEffect, useState } from "react";
import { useT } from "../i18n";
import { useMediaQuery, useReducedMotion } from "../lib/util";

interface Props {
  /** Le bloc d'une fiche dénoncée vient d'arriver dans la page : la barre le guette aussi. */
  watch?: boolean;
}

export function MakeYours({ watch = false }: Props) {
  const narrow = useMediaQuery("(max-width: 640px)");
  return narrow ? <Bar watch={watch} /> : null;
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

function Bar({ watch }: { watch: boolean }) {
  const { t } = useT();
  const reduced = useReducedMotion();
  // null : on ne sait pas encore ce qui est à l'écran, la barre attend (pas d'apparition furtive).
  const [seen, setSeen] = useState<boolean | null>(null);
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    const marks = [document.getElementById("you"), document.querySelector(".denounced")].filter((el): el is HTMLElement => !!el);
    if (!marks.length || typeof IntersectionObserver !== "function") return setSeen(false);
    const on = new Set<Element>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) on.add(e.target);
        else on.delete(e.target);
      }
      setSeen(on.size > 0);
    });
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
  return (
    <div className={`dock make-yours${on ? " is-on" : ""}`} role="region" aria-label={t.result.makeYours} inert={on ? undefined : true}>
      <button type="button" className="pill pill-big dock-main" onClick={() => toYourTurn(reduced)}>
        {t.result.makeYours}
      </button>
    </div>
  );
}
