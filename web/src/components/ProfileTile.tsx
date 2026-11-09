// Le décor du profil sur la page d'une fiche (SPEC §18.28, §18.29) : son « lieu du
// crime » (`/profiles/{id}.jpg`, 1152 × 768) en ciel de page, derrière la barre du
// haut ; sous la fiche, la peine et la caution en texte. Le nom du profil et sa phrase
// sont sur la fiche : ils ne se répètent pas ici.
import { useEffect, useRef, useState } from "react";
import type { CardData } from "../../../shared/types";
import { pick, useT } from "../i18n";

/** Les ciels de l'heure bleue (docs/brief-illustrations.md §4, lumière C) ; les autres sont à l'heure rose. */
const BLUE_HOUR = new Set(["mastermind", "night_owl", "ghost", "default"]);

/** Seuls les identifiants de data/profiles.json (minuscules, chiffres, `_`) deviennent une adresse. */
const safeId = (id: string) => (/^[a-z0-9_]{1,40}$/.test(id) ? id : null);

/** Ciel sombre (heure bleue) : le texte posé dessus est crème. Ciel clair (heure rose) : il est d'encre. */
export type SkyTone = "dark" | "light";

/**
 * Le ciel de la page d'une fiche (§18.29) : l'illustration du profil, `default` sans profil.
 * Le ton suit l'heure de l'image : contraste AA mesuré sur les 14 dans la zone de la barre et de l'en-tête.
 */
export function skyOf(profileId: string | undefined): { src: string; tone: SkyTone } {
  const id = (profileId && safeId(profileId)) || "default";
  return { src: `/profiles/${id}.jpg`, tone: BLUE_HOUR.has(id) ? "dark" : "light" };
}

/**
 * L'illustration en fond de page, derrière la barre du haut, fondue dans l'encre par le bas.
 * Elle n'apparaît qu'une fois la fiche posée (`shown`) et l'image chargée ; si elle échoue, rien.
 */
export function ProfileSky({ card, shown, tall = false }: { card: CardData; shown: boolean; tall?: boolean }) {
  const { src, tone } = skyOf(card.profile?.id);
  const [state, setState] = useState<"idle" | "loaded" | "failed">("idle");
  const img = useRef<HTMLImageElement>(null);
  // Déjà en cache, l'image peut finir avant que React n'écoute son « load ».
  useEffect(() => {
    const el = img.current;
    if (el?.complete) setState(el.naturalWidth > 0 ? "loaded" : "failed");
  }, []);
  if (state === "failed") return null;
  return (
    <div className={`card-sky sky-${tone}${tall ? " is-tall" : ""}${shown && state === "loaded" ? " is-in" : ""}`} aria-hidden="true">
      <img
        ref={img}
        src={src}
        width={1152}
        height={768}
        alt=""
        decoding="async"
        fetchPriority="high"
        onLoad={() => setState("loaded")}
        onError={() => setState("failed")}
      />
    </div>
  );
}

/** Sous la fiche : la peine, puis la caution. Rien si la fiche n'a pas de peine. */
export function Penalty({ card }: { card: CardData }) {
  const { lang } = useT();
  const sentence = card.sentence;
  if (!sentence) return null;
  return (
    <p className="penalty">
      <span>{pick(sentence.label, lang)}</span>
      {sentence.bail && <span>{pick(sentence.bail, lang)}</span>}
    </p>
  );
}
