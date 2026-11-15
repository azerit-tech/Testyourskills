// Les ordinaux à l'écran : « 1er novembre », « 3e des écoles », la marque en
// exposant, comme on l'écrit (SPEC §18.52). Le même découpage que les images de
// partage (shared/typo.ts, ordinalParts).
import type { ReactNode } from "react";
import { ordinalParts } from "../../../shared/typo";

export function withSup(text: string): ReactNode[] {
  return ordinalParts(text).map((part, i) => (part.sup ? <sup key={i}>{part.text}</sup> : part.text));
}
