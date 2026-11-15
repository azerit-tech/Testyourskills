// La photo d'identité de l'attente (§18.27, le début de l'interrogatoire du
// §18.13) : le cadre de la fiche, avec ses pièces mêmes (shared/card/mug.tsx :
// la toise, la silhouette à initiales, la plaque), l'avatar du pseudo dès qu'il
// est chargé et un flash blanc à l'apparition. Sans photo (entrée par LinkedIn
// ou CV, image en échec, avatar généré par GitHub) : la silhouette, ses initiales.
// La plaque est celle de la fiche (§18.48) : même nom, même numéro, même date.
import { useId } from "react";
import { MUG_PHOTO, MUG_SIZE, Plate, Silhouette, Toise, initialsOf, plateName, plateSub, toiseCover } from "../../../shared/card/mug";
import { useAvatar } from "../card/avatar";
import { useT } from "../i18n";
import { useReducedMotion } from "../lib/util";

const { w: W, h: H, r: R } = MUG_SIZE;

/** L'avatar public d'un pseudo GitHub, sans appel à l'API. */
export const githubAvatar = (login: string) => `https://github.com/${encodeURIComponent(login)}.png?size=280`;

interface MugshotProps {
  cardId: string;
  /** Pseudo GitHub tapé, ou celui de la fiche ; absent pour une entrée LinkedIn ou CV. */
  login?: string | null;
  /** Entrée par LinkedIn : le nom du lien (« camille-ardent »), sur la plaque tant que le nom n'est pas connu. */
  slug?: string | null;
  /** Photo déjà connue (la fiche est prête) ; sinon l'avatar public du pseudo. */
  src?: string | null;
  /** Le jour du dossier : celui de la fiche dès qu'elle est prête, sinon celui de la demande. Défaut : aujourd'hui. */
  createdAt?: string | number | null;
}

export function Mugshot({ cardId, login, slug, src, createdAt }: MugshotProps) {
  const { lang } = useT();
  const reduced = useReducedMotion();
  const uid = useId().replace(/:/g, "");
  const url = src || (login ? githubAvatar(login) : null);
  // « loading » : la silhouette tient la pose ; le flash part quand la photo est là, ou qu'on y renonce.
  const shot = useAvatar(url);
  const photo = shot === "photo" ? url : null;

  return (
    <div className="load-mug" aria-hidden>
      <svg viewBox={`0 0 ${W} ${H}`}>
        <defs>
          <clipPath id={`${uid}-mug`}>
            <rect width={W} height={H} rx={R} />
          </clipPath>
          <filter id={`${uid}-photo`} colorInterpolationFilters="sRGB">
            <feColorMatrix type="saturate" values="1.08" />
            <feComponentTransfer>
              <feFuncR type="table" tableValues="0.19 0.56 1" />
              <feFuncG type="table" tableValues="0.12 0.48 0.98" />
              <feFuncB type="table" tableValues="0.31 0.6 0.98" />
            </feComponentTransfer>
          </filter>
        </defs>
        <g clipPath={`url(#${uid}-mug)`}>
          <Toise coverTop={toiseCover(H, !!photo)} />
          {photo ? (
            <image key={photo} className="load-mug-photo" href={photo} x={MUG_PHOTO.inset} y={H - MUG_PHOTO.h} width={MUG_PHOTO.w} height={MUG_PHOTO.h} preserveAspectRatio="xMidYMin slice" filter={`url(#${uid}-photo)`} />
          ) : (
            <Silhouette initials={initialsOf(login ?? slug)} />
          )}
          <Plate name={plateName({ login, slug }, lang)} sub={plateSub(cardId, createdAt ?? Date.now(), lang)} />
        </g>
        <rect x={0.5} y={0.5} width={W - 1} height={H - 1} rx={R} fill="none" stroke="#fff" strokeOpacity={0.14} />
      </svg>
      {/* le flash : une fois, quand la photo (ou la silhouette) est prise ; jamais en mouvement réduit */}
      {shot !== "loading" && !reduced && <span className="load-flash" key={shot} />}
    </div>
  );
}
