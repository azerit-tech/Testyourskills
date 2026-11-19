// Sa propre bande en formation (§18.85) : un bloc, pas une ligne. Sur /bandes, en
// tête de sa ligue ; sur l'accueil de qui a sa fiche (§18.89), en tête des bandes.
import type { BandStanding } from "../../../shared/bands";
import { bandPath } from "../../../shared/bands";
import { useT } from "../i18n";
import { onLinkClick } from "../lib/router";
import { BandSlots } from "./BandSlots";
import { IconLinkedIn, IconShare } from "./Icons";
import "./bands.css";

/** Sa propre bande en formation : son nom, ses trois emplacements, ce qu'il lui manque, et le partage. Pas d'étoiles avant le tableau. */
export function MineForming({ band, onShare, native }: { band: BandStanding; onShare: (band: BandStanding) => void; native: boolean }) {
  const { t } = useT();
  const href = bandPath(band);
  return (
    <div className="block bands-mine">
      <p className="label">{t.bands.board.yours}</p>
      <h3 className="t-block">
        {/* une boîte au nom libre n'a pas de page avant trois fiches (§18.44) : son nom seul */}
        {band.hasPage ? (
          <a href={href} onClick={(e) => onLinkClick(e, href)}>
            {band.label}
          </a>
        ) : (
          band.label
        )}
      </h3>
      <BandSlots members={band.members} />
      <p className="band-rank">{t.bands.board.toBoard(band.missing)}</p>
      <button type="button" className="pill band-share" onClick={() => onShare(band)}>
        {native ? <IconShare /> : <IconLinkedIn />}
        {t.bands.page.share}
      </button>
    </div>
  );
}
