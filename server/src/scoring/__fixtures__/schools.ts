// Les tests ne lisent jamais la vraie liste des écoles : elle vit hors du dépôt
// (SPEC §18.50) et n'existe pas en intégration continue. Ils posent l'une de
// ces deux listes à sa place.

import type { SchoolTier } from "../../../../shared/readings";
import example from "../../../../data/schools.example.json";
import lectureUn from "../../ai/__fixtures__/reading-exemple-un.json";
import lectureDeux from "../../ai/__fixtures__/reading-exemple-deux.json";
import { normSchool, parseSchools, setRankedSchoolsForTests, type ListedTier, type RankedSchool, type RankedSchoolList } from "../school";
import { jacquesReading, lumineReading } from "./founders";

/** La liste d'exemple du dépôt, aux écoles inventées (data/schools.example.json). */
export const EXAMPLE_SCHOOLS: RankedSchoolList = { schools: parseSchools(example), source: "data/schools.example.json" };

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Les écoles que portent déjà les lectures d'exemple (fondateurs, profils
 * d'exemple), listées au rang que l'IA y a lu : les notes de ces fiches restent
 * celles de leur grille, sans qu'aucun rang ne s'écrive ici.
 */
type SchoolRead = { school_name: string; school_tier: SchoolTier };

export function schoolsAsRead(...readings: SchoolRead[]): RankedSchool[] {
  const out: RankedSchool[] = [];
  for (const r of readings) {
    const key = normSchool(r.school_name);
    if (!key || r.school_tier === "none" || out.some((e) => e.re.test(key))) continue;
    out.push({ school: r.school_name, tier: r.school_tier as ListedTier, re: new RegExp(`\\b${escapeRe(key)}\\b`) });
  }
  return out;
}

/** La liste des tests : les écoles des lectures d'exemple, puis l'exemple du dépôt. */
export function testSchools(): RankedSchoolList {
  const read = schoolsAsRead(jacquesReading(), lumineReading(), lectureUn as SchoolRead, lectureDeux as SchoolRead);
  return { schools: [...read, ...EXAMPLE_SCHOOLS.schools], source: "tests" };
}

/** Pose la liste des tests pour tout le fichier de test (appelé au chargement, avant les describe). */
export function useTestSchools(): void {
  setRankedSchoolsForTests(testSchools());
}
