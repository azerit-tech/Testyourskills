// La barre du pouce (§18.27, §18.81) : sur téléphone, dès que la fiche est posée, deux rangs
// sous le pouce. En haut, « Dénonce un complice », dessiné comme un champ : un toucher mène au
// champ du bloc, juste sous la fiche, clavier ouvert. Dessous, « Partager », le rose.
// Elle s'efface quand le bouton rose du bloc de partage ou la fiche d'un complice prête à
// envoyer est à l'écran, et pendant qu'on écrit dans un champ. Dès que le champ du bloc
// « Dénonce un complice » est à l'écran, au-dessus de la barre, son rang la quitte :
// « Partager » reste seul.
import { useEffect, useState } from "react";
import { useT } from "../i18n";
import { useMediaQuery } from "../lib/util";
import { ShareMain, useSharing } from "./After";
import type { Shareable } from "./After";
import { IconArrow } from "./Icons";

/** Le champ du bloc « Dénonce un complice », ou son attente : ce qui rend le rang de la barre inutile. */
const DENOUNCE_MARKS = ".after-block.denounce .denounce-form .field, .after-block.denounce.is-pending";
/** La hauteur de la barre à deux rangs : ce qui est derrière elle n'est pas « à l'écran ». */
const DOCK_PX = 124;

interface Props {
  item: Shareable;
  /** La fiche est posée : jamais pendant la révélation. */
  ready: boolean;
  toast: (m: string) => void;
  /** Sous trois étoiles, la source qui manque (§18.52) : « Ajouter mon LinkedIn » (ou GitHub) en rose, « Partager » en contour. */
  add?: "linkedin" | "github" | null;
}

/** Pour qui a fait la fiche, sur écran étroit seulement. Le parent écarte le visiteur et la fiche masquée. */
export function ShareDock({ item, ready, toast, add = null }: Props) {
  const narrow = useMediaQuery("(max-width: 640px)");
  return narrow && ready ? <Dock item={item} toast={toast} add={add} /> : null;
}

const isField = (el: Element | null) => !!el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);

/**
 * Descend au champ d'un bloc et l'active, dans le geste (sinon le clavier ne s'ouvre pas sur iPhone).
 * `top` : le bloc entier monte au haut de l'écran, son titre et son champ au-dessus du clavier.
 */
function toField(selector: string, top = false) {
  const block = document.querySelector<HTMLElement>(selector);
  if (!block) return;
  const input = block.querySelector<HTMLInputElement>("input");
  const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (top) block.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
  else (input ?? block).scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "center" });
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
      setBlockSeen(seen.size > 0);
    });
    // Le champ du bloc ne compte qu'au-dessus de la barre : derrière elle, on ne le voit pas.
    const above = new Set<Element>();
    const ioWho = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) above.add(e.target);
          else above.delete(e.target);
        }
        setDenounceSeen(above.size > 0);
      },
      { rootMargin: `0px 0px -${DOCK_PX}px 0px` },
    );
    // Seuls les blocs qui arrivent ou repartent relancent le guet : les lignes de suggestions sous un champ n'y touchent pas.
    let marks: Element[] = [];
    const scan = () => {
      const pinks = [...document.querySelectorAll(hides)];
      const whos = [...document.querySelectorAll(DENOUNCE_MARKS)];
      const next = [...pinks, ...whos];
      if (next.length === marks.length && next.every((m, i) => m === marks[i])) return;
      marks = next;
      io.disconnect();
      ioWho.disconnect();
      seen.clear();
      above.clear();
      if (!pinks.length) setBlockSeen(false);
      if (!whos.length) setDenounceSeen(false);
      pinks.forEach((m) => io.observe(m));
      whos.forEach((m) => ioWho.observe(m));
    };
    scan();
    if (!marks.length) setBlockSeen(false);
    const after = document.querySelector(".page-result .after");
    const mo = after && typeof MutationObserver === "function" ? new MutationObserver(scan) : null;
    if (after) mo?.observe(after, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    return () => {
      io.disconnect();
      ioWho.disconnect();
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
  // « Dénonce un complice », en tête de la barre : il a l'air d'un champ, il mène au vrai, dans le geste.
  const who = !denounceSeen && (
    <button type="button" className="dock-who" onClick={() => toField(".after-block.denounce", true)}>
      <span>{t.denounce.title}</span>
      <IconArrow />
    </button>
  );
  if (add)
    return (
      <div className={`dock is-add${on ? " is-on" : ""}`} role="region" aria-label={t.result.share.title} inert={on ? undefined : true}>
        {who}
        <button type="button" className="pill pill-big dock-main" onClick={() => toField(".after-block.add-source")}>
          {add === "linkedin" ? t.result.addLinkedin.btn : t.result.prove.btn}
        </button>
        <ShareMain kit={kit} className="pill-ghost" from="dock" />
      </div>
    );
  return (
    <div className={`dock${on ? " is-on" : ""}`} role="region" aria-label={t.result.share.title} inert={on ? undefined : true}>
      {who}
      <ShareMain kit={kit} className="dock-main" from="dock" />
    </div>
  );
}
