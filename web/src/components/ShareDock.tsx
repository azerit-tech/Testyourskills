// La barre du pouce (§18.27) : sur téléphone, dès que la fiche est posée, « Partager »
// et « Dénoncer » restent sous le pouce. Elle s'efface quand le bouton rose du bloc de partage
// ou la fiche d'un complice prête à envoyer est à l'écran, et pendant qu'on écrit dans un champ.
// Tant que le bloc « Dénonce un complice » est à l'écran, « Dénoncer » quitte la barre :
// « Partager » reste seul, pleine largeur.
import { useEffect, useState } from "react";
import { useT } from "../i18n";
import { useMediaQuery } from "../lib/util";
import { ShareMain, useSharing } from "./After";
import type { Shareable } from "./After";

interface Props {
  item: Shareable;
  /** La fiche est posée : jamais pendant la révélation. */
  ready: boolean;
  toast: (m: string) => void;
  /** Sous trois étoiles, la source qui manque (§18.52) : « Ajouter mon LinkedIn » (ou GitHub) en rose, « Partager » en contour, pas de « Dénoncer ». */
  add?: "linkedin" | "github" | null;
}

/** Pour qui a fait la fiche, sur écran étroit seulement. Le parent écarte le visiteur et la fiche masquée. */
export function ShareDock({ item, ready, toast, add = null }: Props) {
  const narrow = useMediaQuery("(max-width: 640px)");
  return narrow && ready ? <Dock item={item} toast={toast} add={add} /> : null;
}

const isField = (el: Element | null) => !!el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);

/** Descend au champ d'un bloc et l'active, dans le geste (sinon le clavier ne s'ouvre pas sur iPhone). */
function toField(selector: string) {
  const block = document.querySelector<HTMLElement>(selector);
  if (!block) return;
  const input = block.querySelector<HTMLInputElement>("input");
  const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  (input ?? block).scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "center" });
  input?.focus({ preventScroll: true });
}

function Dock({ item, toast, add }: { item: Shareable; toast: (m: string) => void; add: "linkedin" | "github" | null }) {
  const { t } = useT();
  const kit = useSharing(item, toast);
  // null : on ne sait pas encore si le bloc de partage est à l'écran, la barre attend.
  const [blockSeen, setBlockSeen] = useState<boolean | null>(null);
  const [denounceSeen, setDenounceSeen] = useState(false);
  const [typing, setTyping] = useState(false);

  // Un seul bouton rose par écran : la barre s'efface devant le bloc de partage, devant la fiche
  // d'un complice prête à envoyer (« Envoyer à @x »), et sous trois étoiles devant le bouton rose du
  // bloc de la source à ajouter (le bouton, pas le haut du bloc : la barre reste tant qu'il est sous le pli).
  // Ces blocs arrivent et repartent : on les guette.
  // Du bloc de partage aussi, c'est le bouton qui compte : son titre qui affleure au bas du premier écran ne retire plus le rose.
  const hides = add
    ? ".after-block.out .out-main, .after-block.denounce.is-done, .after-block.add-source .entry-submit"
    : ".after-block.out .out-main, .after-block.denounce.is-done";
  useEffect(() => {
    if (typeof IntersectionObserver !== "function") return setBlockSeen(false);
    const seen = new Set<Element>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) seen.add(e.target);
        else seen.delete(e.target);
      }
      const all = [...seen];
      setBlockSeen(all.some((el) => el.matches(hides)));
      setDenounceSeen(all.some((el) => el.matches(".after-block.denounce")));
    });
    const scan = () => {
      io.disconnect();
      seen.clear();
      const marks = document.querySelectorAll(`${hides}, .after-block.denounce`);
      if (!document.querySelector(hides)) setBlockSeen(false);
      setDenounceSeen(false);
      marks.forEach((m) => io.observe(m));
    };
    scan();
    const after = document.querySelector(".page-result .after");
    const mo = after && typeof MutationObserver === "function" ? new MutationObserver(scan) : null;
    if (after) mo?.observe(after, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    return () => {
      io.disconnect();
      mo?.disconnect();
    };
  }, [hides]);

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

  const on = blockSeen === false && !typing;
  if (add)
    return (
      <div className={`dock is-add${on ? " is-on" : ""}`} role="region" aria-label={t.result.share.title} inert={on ? undefined : true}>
        <button type="button" className="pill pill-big dock-main" onClick={() => toField(".after-block.add-source")}>
          {add === "linkedin" ? t.result.addLinkedin.btn : t.result.prove.btn}
        </button>
        <ShareMain kit={kit} className="pill-ghost" from="dock" />
      </div>
    );
  return (
    <div className={`dock${on ? " is-on" : ""}`} role="region" aria-label={t.result.share.title} inert={on ? undefined : true}>
      <ShareMain kit={kit} className="dock-main" from="dock" />
      {!denounceSeen && (
        <button type="button" className="pill pill-big pill-ghost" onClick={() => toField(".after-block.denounce")}>
          {t.denounce.btn}
        </button>
      )}
    </div>
  );
}
