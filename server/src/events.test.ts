// La page Vie privée dit ce qu'on mesure (§11, §13) : chaque événement de la liste fermée du serveur, par famille.
import { describe, expect, it } from "vitest";
import { PAGES_TEXT } from "../../web/src/pagesText";
import { EVENT_NAMES, type EventName } from "./events";

/** Où la section « Mesure » nomme chaque événement, en français et en anglais. */
const SAID: Record<EventName, [RegExp, RegExp]> = {
  card_generated: [/fiches faites/, /sheets made/],
  card_shared: [/fiches faites et partagées/, /sheets made and shared/],
  card_email: [/emails laissés/, /emails left/],
  cta_azerit_clicked: [/clics vers azerit\.tech/, /clicks to azerit\.tech/],
  shared_visit: [/visites par un lien partagé/, /visits from a shared link/],
  denounce_sent: [/dénonciations envoyées/, /tip-offs sent/],
  denounce_landed: [/visites d'une fiche dénoncée/, /visits to a tipped-off sheet/],
  denounce_claimed: [/fiches dénoncées revendiquées/, /tipped-off sheets claimed/],
  jury_vote: [/votes du jury/, /jury votes/],
  film: [/déroulement du film/, /how the film played/],
  band_join: [/entrées et sorties de bande/, /crews joined/],
  band_leave: [/sorties de bande/, /joined and left/],
  band_view: [/bandes ouvertes au classement/, /crews opened in the ranking/],
  band_share: [/ouvertes au classement et partagées/, /opened in the ranking and shared/],
  prime_view: [/pages de prime vues/, /bounty pages viewed/],
  prime_join: [/inscriptions et retraits de prime/, /bounties entered/],
  prime_withdraw: [/retraits de prime/, /entered and withdrawn/],
};

describe("la Mesure de la page Vie privée", () => {
  it("nomme chaque événement que le serveur enregistre, et aucun de plus", () => {
    expect(Object.keys(SAID).sort()).toEqual([...EVENT_NAMES].sort());
    (["fr", "en"] as const).forEach((lang, i) => {
      const sections = PAGES_TEXT[lang].privacy.sections("x@y.z");
      const text = sections.at(-1)!.blocks.flat().join(" ").replace(/[  ]/g, " ");
      for (const [name, re] of Object.entries(SAID)) expect(text, `${lang} ${name}`).toMatch(re[i]!);
    });
  });
});
