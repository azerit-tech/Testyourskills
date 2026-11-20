// Les vraies recherches des propositions sous une fiche (SPEC §18.100), branchées
// par index.ts ; les tests en donnent de fausses.

import type { GithubAuth } from "../github/http";
import type { LinkedinFinder } from "../linkedinProfile/index";
import type { LinkedinPeople } from "../linkedinProfile/search";
import type { PipelineOptions } from "../pipeline";
import type { RegistryPort } from "../registry/index";
import { findGithubFor } from "./github";
import { findLinkedinFor } from "./linkedin";

export function realProposers(o: { github: GithubAuth; registry?: RegistryPort; linkedinProfiles?: LinkedinFinder; linkedinPeople?: LinkedinPeople }): NonNullable<PipelineOptions["propose"]> {
  const { registry, linkedinPeople } = o;
  return {
    github: (person, signal) => findGithubFor(o.github, person, { signal }),
    // Sans lecture de profils, « Ajoute ton LinkedIn » n'existe pas : rien à proposer.
    linkedin: o.linkedinProfiles
      ? (gh, x) =>
          findLinkedinFor(
            {
              namesakes: registry ? (name) => registry.namesakes(name) : undefined,
              byName: linkedinPeople ? (name, q) => linkedinPeople.byName(name, q) : undefined,
            },
            gh,
            x,
          )
      : undefined,
  };
}
