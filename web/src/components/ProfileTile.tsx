// La tuile de profil (SPEC §18.28) : le « lieu du crime » du profil criminel,
// au ratio 3:2, le nom en capitales crème et la phrase en rose poudré, en bas à
// gauche. L'illustration (`/profiles/{id}.jpg`, 1152 × 768) se pose si elle existe ; sinon
// la tuile garde un aplat de la teinte de carte et un grand palmier ton sur ton.
// Dessous, la peine et la caution, en petit.
import { useEffect, useRef, useState } from "react";
import type { CardData } from "../../../shared/types";
import { pick, useT } from "../i18n";

/** Palmier de la fiche (shared/card/Card.tsx), viewBox 0 0 120 140. */
const PALM = [
  "M46 140c2-34 5-62 12-86l4 1c-8 24-11 52-12 85z",
  "M60 54C40 38 20 38 4 50c18-4 36 0 56 7z",
  "M60 54C36 56 18 68 10 88c14-14 30-22 50-30z",
  "M60 54c18-22 40-28 60-20-20 0-40 8-60 24z",
  "M60 54c26-2 44 10 54 30-14-14-32-22-54-26z",
  "M60 54c-6-22-2-40 8-52-2 16 0 32-4 50z",
  "M60 54c10-20 26-32 44-34-16 8-30 20-42 36z",
  "M60 54c-14-14-18-30-14-48 4 16 10 30 16 46z",
].join("");

/** Les profils de l'heure bleue (docs/brief-illustrations.md §4, lumière C) sont marine ; les autres, prune. */
const NAVY = new Set(["mastermind", "night_owl", "ghost", "default"]);

export type Tint = "plum" | "navy";

/** La teinte de la tuile : fixe pour un profil donné, la même que l'heure de son illustration. */
export function tintOf(profileId: string): Tint {
  return NAVY.has(profileId) ? "navy" : "plum";
}

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
  return { src: `/profiles/${id}.jpg`, tone: NAVY.has(id) ? "dark" : "light" };
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

export function ProfileTile({ card }: { card: CardData }) {
  const { t, lang } = useT();
  // L'illustration : « idle » tant qu'elle charge, retirée si elle n'existe pas.
  const [art, setArt] = useState<"idle" | "loaded" | "failed">("idle");
  const profile = card.profile;
  if (!profile) return null;
  const id = safeId(profile.id);
  const sentence = card.sentence;

  return (
    <section className={`profile-tile tint-${tintOf(profile.id)}${art === "loaded" ? " has-art" : ""}`} aria-labelledby="profile-name">
      <div className="profile-art">
        <svg className="profile-palm" viewBox="0 0 120 140" aria-hidden>
          <path d={PALM} />
        </svg>
        {id && art !== "failed" && (
          <img
            src={`/profiles/${id}.jpg`}
            width={1152}
            height={768}
            alt=""
            loading="lazy"
            decoding="async"
            onLoad={() => setArt("loaded")}
            onError={() => setArt("failed")}
          />
        )}
        <div className="profile-copy">
          <p className="profile-kicker">{t.result.profile}</p>
          <h2 className="profile-name" id="profile-name">
            {pick(profile.label, lang)}
          </h2>
          <p className="profile-hook">{pick(profile.tagline, lang)}</p>
        </div>
      </div>
      {sentence && (
        <p className="profile-sentence">
          <span>{pick(sentence.label, lang)}</span>
          {sentence.bail && <span>{pick(sentence.bail, lang)}</span>}
        </p>
      )}
    </section>
  );
}
