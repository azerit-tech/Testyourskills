// « Voir ma fiche » : sur l'accueil de qui revient (§18.52), et sous la fiche de quelqu'un
// d'autre quand elle est aussi la sienne (§18.90).
import { starsFor } from "../../../shared/types";
import { useT } from "../i18n";
import { onLinkClick } from "../lib/router";
import type { MyCard } from "../lib/session";
import { Stars } from "./Stars";

/**
 * Qui revient avec sa fiche (§18.52) : la ligne de sa fiche, le bouton rose « Voir ma fiche », et
 * dessous le lien qui ouvre le formulaire. Revenir sert d'abord à retrouver sa fiche, son rang, son partage.
 */
export function ReturnCall({ mine, onAnother, onSignOut }: { mine: MyCard; onAnother: () => void; onSignOut?: () => void }) {
  const { t } = useT();
  const b = t.home.back;
  const href = `/c/${mine.id}`;
  const stars = starsFor(mine.overall);
  return (
    <div className="home-return">
      <p className="home-back">
        <span>
          {b.mine} <Stars n={stars} label={t.plea.count(stars)} /> {mine.overall}/100.
        </span>
      </p>
      <a className="pill pill-big home-see" href={href} onClick={(e) => onLinkClick(e, href)}>
        {b.see}
      </a>
      {onSignOut ? (
        // Connecté (§18.91) : « Faire une autre fiche · Se déconnecter », une seule petite ligne.
        <div className="entry-foot entry-or home-another">
          <button type="button" className="link-alt" aria-expanded={false} onClick={onAnother}>
            {b.another}
          </button>
          <span aria-hidden>·</span>
          <button type="button" className="link-alt" onClick={onSignOut}>
            {t.home.account.out}
          </button>
        </div>
      ) : (
        <button type="button" className="link-alt home-another" aria-expanded={false} onClick={onAnother}>
          {b.another}
        </button>
      )}
    </div>
  );
}
