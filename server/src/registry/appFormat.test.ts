import { describe, expect, it } from "vitest";
import { cvDigest, githubKey, isoSeconds, latestVersion, linkedinKey, newCvDocument, packCv, profileFromApp, pyJson, trimApifyItem, unpackCv, type AppProfile } from "./appFormat";

// Une sortie d'acteur inventée (noms fictifs), avec ce qui piège : accents, émoji,
// caractères de contrôle, description de plus de 600 caractères, contact à jeter.
const ITEM = {
  linkedinUrl: "https://www.linkedin.com/in/Camille-Ardent-42",
  firstName: "Camille",
  lastName: "Ardënt",
  headline: "Ingénieure « backend » — Rust\tGo\n🚀",
  location: { linkedinText: "Lyon, Auvergne-Rhône-Alpes" },
  experience: [
    {
      position: "Développeuse",
      companyName: "Paysolde",
      companyUniversalName: "paysolde",
      employmentType: "Full-time",
      startDate: { year: 2022, month: "Mar", text: "Mar 2022" },
      endDate: { text: "Present" },
      duration: "2 yrs",
      location: "Lyon",
      description: "é".repeat(598) + "😀😀😀" + '\u0001 \\ " /',
    },
    { position: "Stagiaire", companyName: "Nébuleuse", employmentType: "Internship", startDate: { year: 2021, month: "Jun" }, endDate: { year: 2021, month: "Aug", text: "Aug 2021" } },
  ],
  education: [{ schoolName: "INSA Lyon", degree: "Diplôme d'ingénieur", fieldOfStudy: "Informatique", startDate: { year: 2017 }, endDate: { year: 2022 } }],
  skills: [{ name: "Rust" }, { name: " Go " }, "TypeScript", { name: "" }],
  profilePicture: { url: "https://media.licdn.com/x" },
  emails: ["jamais@example.com"],
};

/**
 * Relevé le 20 novembre 2026 : le `trim_profile` de l'App (Python) rend ce même
 * profil pour ITEM, et `hashlib.sha256(json.dumps(profil, sort_keys=True,
 * ensure_ascii=False))` cette empreinte ; `zlib.decompress` relit `packCv`.
 */
const PY_DIGEST = "c4a24358a00e7f94303167e93f728d61602b7461b81b926e1ae95544cdda28cd";

describe("format des comptes de l'App", () => {
  it("handle_key : login en minuscules, slug LinkedIn décodé et sans casse", () => {
    expect(githubKey("CamArdent")).toBe("camardent");
    expect(linkedinKey("https://fr.linkedin.com/in/Camille-Ard%C3%A9nt/?trk=x")).toBe("camille-ardént");
    expect(linkedinKey("https://github.com/x")).toBeNull();
  });

  it("les dates s'écrivent comme l'App : heure locale, à la seconde, sans fuseau", () => {
    expect(isoSeconds(new Date(2026, 10, 20, 9, 5, 7).getTime())).toBe("2026-11-20T09:05:07");
  });
});

describe("le CV de l'App", () => {
  it("trimApifyItem rend ce que rend trim_profile : jamais d'image, de contact ni d'email", () => {
    const p = trimApifyItem(ITEM)!;
    expect(p.public_url).toBe("https://www.linkedin.com/in/Camille-Ardent-42");
    expect(p.name).toBe("Camille Ardënt");
    expect(p.location).toBe("Lyon, Auvergne-Rhône-Alpes");
    expect(p.experiences[0]!.end).toEqual({ year: null, month: null, text: "Present" });
    expect(Array.from(p.experiences[0]!.description)).toHaveLength(600);
    expect(p.experiences[1]!.company_slug).toBe("");
    expect(p.education[0]).toEqual({ school: "INSA Lyon", degree: "Diplôme d'ingénieur", field: "Informatique", start_year: 2017, end_year: 2022 });
    expect(p.skills).toEqual(["Rust", "Go", "TypeScript"]);
    expect(JSON.stringify(p)).not.toMatch(/licdn|jamais@/);
  });

  it("l'empreinte d'une version est celle de Python", () => {
    expect(cvDigest(trimApifyItem(ITEM)!)).toBe(PY_DIGEST);
  });

  it("pyJson : clés triées, séparateurs de Python, Unicode tel quel", () => {
    expect(pyJson({ b: [1, null, "é\n"], a: { y: true, x: 2 } })).toBe('{"a": {"x": 2, "y": true}, "b": [1, null, "é\\n"]}');
  });

  it("un document neuf se relit, une seule version", () => {
    const doc = newCvDocument("https://www.linkedin.com/in/camille-ardent-42", trimApifyItem(ITEM)!, { login: "cardent", fetchedAt: "2026-11-20T10:00:00" });
    const back = unpackCv(packCv(doc))!;
    expect(back.schema).toBe("azerit-cv-store-v1");
    expect(back.logins).toEqual(["cardent"]);
    expect(back.versions).toHaveLength(1);
    expect(back.versions[0]).toMatchObject({ sha256: PY_DIGEST, fetched_at: "2026-11-20T10:00:00", campaign: "", login: "cardent" });
    expect(unpackCv(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it("latestVersion : la lecture la plus récente", () => {
    const p = trimApifyItem(ITEM)!;
    const doc = { schema: "azerit-cv-store-v1", url: "u", logins: [], versions: [
      { sha256: "b", fetched_at: "2026-10-02T00:00:00", campaign: "", login: "", profile: p },
      { sha256: "a", fetched_at: "2026-09-01T00:00:00", campaign: "", login: "", profile: p },
    ] };
    expect(latestVersion(doc)!.sha256).toBe("b");
  });

  it("profileFromApp : le profil du jugement, postes en cours d'abord, sans lieu ni résumé", () => {
    const p = profileFromApp("https://www.linkedin.com/in/camille-ardent-42", trimApifyItem(ITEM)!)!;
    expect(p.name).toBe("Camille Ardënt");
    expect(p.title).toBe("Développeuse");
    expect(p.summary).toBe("");
    expect(p.roles[0]).toMatchObject({ title: "Développeuse", company: "Paysolde", start: "2022-03", end: null, contract: "full_time" });
    expect(p.roles[1]).toMatchObject({ title: "Stagiaire", start: "2021-06", end: "2021-08", contract: "internship" });
    expect(p.education[0]).toEqual({ school: "INSA Lyon", degree: "Diplôme d'ingénieur", field: "Informatique", start: 2017, end: 2022 });
    expect(p.skills).toEqual(["Rust", "Go", "TypeScript"]);
    expect(JSON.stringify(p)).not.toContain("Lyon, Auvergne");
  });

  it("profileFromApp : un CV vide ne donne rien", () => {
    const empty: AppProfile = { public_url: "", name: "", headline: "", location: "", experiences: [], education: [], skills: [] };
    expect(profileFromApp("https://www.linkedin.com/in/x-y-z", empty)).toBeNull();
  });
});
