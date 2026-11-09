// La barre du pouce (§18.27) : sur téléphone, dès que la fiche est posée, « Partager »
// et « Dénoncer » restent sous le pouce. Elle s'efface quand le bloc de partage est à
// l'écran, et pendant qu'on écrit dans un champ.
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
}

/** Pour qui a fait la fiche, sur écran étroit seulement. Le parent écarte le visiteur et la fiche masquée. */
export function ShareDock({ item, ready, toast }: Props) {
  const narrow = useMediaQuery("(max-width: 640px)");
  return narrow && ready ? <Dock item={item} toast={toast} /> : null;
}

const isField = (el: Element | null) => !!el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);

function Dock({ item, toast }: { item: Shareable; toast: (m: string) => void }) {
  const { t } = useT();
  const kit = useSharing(item, toast);
  // null : on ne sait pas encore si le bloc de partage est à l'écran, la barre attend.
  const [blockSeen, setBlockSeen] = useState<boolean | null>(null);
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    const block = document.querySelector(".after-block.out");
    if (!block || typeof IntersectionObserver !== "function") return setBlockSeen(false);
    const io = new IntersectionObserver((entries) => setBlockSeen(entries[entries.length - 1].isIntersecting));
    io.observe(block);
    return () => io.disconnect();
  }, []);

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

  const toDenounce = () => {
    const block = document.querySelector<HTMLElement>(".after-block.denounce");
    if (!block) return;
    const input = block.querySelector<HTMLInputElement>("input");
    const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    (input ?? block).scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "center" });
    // Dans le geste, sinon le clavier ne s'ouvre pas sur iPhone.
    input?.focus({ preventScroll: true });
  };

  const on = blockSeen === false && !typing;
  return (
    <div className={`dock${on ? " is-on" : ""}`} role="region" aria-label={t.result.share.title} inert={on ? undefined : true}>
      <ShareMain kit={kit} className="dock-main" from="dock" short />
      <button type="button" className="pill pill-big pill-ghost" onClick={toDenounce}>
        {t.denounce.btn}
      </button>
    </div>
  );
}
