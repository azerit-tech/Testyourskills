// Une bande en formation (§18.48, §18.85) : trois emplacements, pleins ou à
// remplir, jamais un « ★ 0 ». En grand sur la page d'une bande et sur sa propre
// bande de /bandes ; en petit au bout d'une ligne du tableau, où la ligne dit
// déjà le compte à un lecteur d'écran.
import { BAND_MIN_MEMBERS } from "../../../shared/bands";
import { useT } from "../i18n";
import { StarMark } from "./Stars";
import "./bands.css";

export function BandSlots({ members, mini = false }: { members: number; mini?: boolean }) {
  const { t } = useT();
  const slots = Array.from({ length: BAND_MIN_MEMBERS }, (_, i) => (
    <span key={i} className={`band-slot${i < members ? " is-on" : ""}`}>
      {!mini && i < members && <StarMark />}
    </span>
  ));
  if (mini) {
    return (
      <span className="band-slots is-mini" aria-hidden>
        {slots}
      </span>
    );
  }
  return (
    <p className="band-slots" role="img" aria-label={t.bands.states.slots(members)}>
      {slots}
    </p>
  );
}
