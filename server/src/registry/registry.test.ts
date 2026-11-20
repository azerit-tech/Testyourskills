import { describe, expect, it } from "vitest";
import { newCvDocument, packCv, trimApifyItem, unpackCv } from "./appFormat";
import { Registry, registryFromEnv } from "./index";
import { MemoryRegistryDb } from "./memory";
import { signInSignal } from "./signals";

// Noms inventés.
const NOW = new Date(2026, 10, 20, 12, 0, 0).getTime();
const URL_ = "https://www.linkedin.com/in/camille-ardent";
const ITEM = {
  linkedinUrl: URL_,
  firstName: "Camille",
  lastName: "Ardent",
  headline: "Développeuse backend",
  experience: [{ position: "Développeuse", companyName: "Paysolde", employmentType: "Full-time", startDate: { year: 2022, month: "Mar" }, endDate: { text: "Present" } }],
  skills: [{ name: "Rust" }],
};

function setup(o: { timeoutMs?: number } = {}) {
  const db = new MemoryRegistryDb();
  const logs: string[] = [];
  let now = NOW;
  const reg = new Registry(db, { now: () => now, readTimeoutMs: o.timeoutMs ?? 300, log: (m) => logs.push(m) });
  return { db, reg, logs, later: (ms: number) => (now += ms) };
}

function seedCv(db: MemoryRegistryDb, slug: string, fetchedAt: string) {
  const a = db.ensure("linkedin", slug);
  const doc = newCvDocument(`https://www.linkedin.com/in/${slug}`, trimApifyItem(ITEM)!, { fetchedAt });
  db.cvs.push({ account: a.id, data: packCv(doc), sha256: doc.versions[0]!.sha256, fetchedAt });
}

describe("registre : lectures", () => {
  it("le LinkedIn d'un GitHub, avec sa force", async () => {
    const { db, reg } = setup();
    db.seedLink("CamArdent", "camille-ardent", 2);
    expect(await reg.linkedinOf("camardent")).toEqual({ url: URL_, strength: 2 });
    expect(await reg.linkedinOf("inconnu")).toBeNull();
  });

  it("un LinkedIn porté par deux GitHub n'est rendu à aucun (sauf lien vérifié)", async () => {
    const { db, reg } = setup();
    db.seedLink("camardent", "camille-ardent", 2);
    db.seedLink("homonyme", "camille-ardent", 1, { source: "cv_search" });
    expect(await reg.linkedinOf("camardent")).toBeNull();
    expect(await reg.githubOf(URL_)).toBeNull();
    db.seedLink("camardent", "camille-ardent", 3, { source: "operator" });
    expect(await reg.linkedinOf("camardent")).toEqual({ url: URL_, strength: 3 });
    expect(await reg.githubOf(URL_)).toEqual({ login: "camardent", strength: 3 });
  });

  it("le GitHub d'un LinkedIn, sous sa casse ; une recherche reste « trouvé »", async () => {
    const { db, reg } = setup();
    db.seedLink("CamArdent", "camille-ardent", 2, { source: "brave_search" });
    expect(await reg.githubOf("https://fr.linkedin.com/in/Camille-Ardent/")).toEqual({ login: "CamArdent", strength: 1 });
  });

  it("une ligne marquée (supprimée) n'est jamais lue", async () => {
    const { db, reg } = setup();
    db.seedLink("camardent", "camille-ardent", 2);
    db.links_[0]!.deleted = true;
    expect(await reg.linkedinOf("camardent")).toBeNull();
  });

  it("un CV de moins de 90 jours devient le profil du jugement ; plus vieux, rien", async () => {
    const { db, reg } = setup();
    seedCv(db, "camille-ardent", "2026-10-01T09:00:00");
    seedCv(db, "vieux-profil", "2026-08-01T09:00:00");
    const p = await reg.profileOf(URL_);
    expect(p).toMatchObject({ url: URL_, name: "Camille Ardent", title: "Développeuse" });
    expect(await reg.profileOf("https://www.linkedin.com/in/vieux-profil")).toBeNull();
    expect(await reg.profileOf("https://www.linkedin.com/in/personne-ici")).toBeNull();
  });

  it("la photo gardée, JPEG ou PNG seulement", async () => {
    const { db, reg } = setup();
    db.photos.push({ account: db.ensure("linkedin", "camille-ardent").id, data: new Uint8Array([0xff, 0xd8, 0xff]), contentType: "image/jpeg" });
    db.photos.push({ account: db.ensure("linkedin", "autre-profil").id, data: new Uint8Array([1]), contentType: "image/webp" });
    expect(await reg.photoOf(URL_)).toEqual({ bytes: new Uint8Array([0xff, 0xd8, 0xff]), ext: "jpg" });
    expect(await reg.photoOf("https://www.linkedin.com/in/autre-profil")).toBeNull();
  });

  it("panne : null, une seule ligne au journal, puis la base est laissée en paix 30 s", async () => {
    const { db, reg, logs, later } = setup();
    db.failWith = Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
    expect(await reg.linkedinOf("camardent")).toBeNull();
    expect(await reg.githubOf(URL_)).toBeNull();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("ECONNREFUSED");
    expect(db.calls).toEqual(["links"]);
    db.failWith = null;
    later(31_000);
    db.seedLink("camardent", "camille-ardent", 2);
    expect(await reg.linkedinOf("camardent")).not.toBeNull();
  });

  it("lenteur : rien après le délai, la fiche n'attend pas", async () => {
    const { db, reg } = setup({ timeoutMs: 20 });
    db.seedLink("camardent", "camille-ardent", 2);
    db.delayMs = 200;
    const t = Date.now();
    expect(await reg.linkedinOf("camardent")).toBeNull();
    expect(Date.now() - t).toBeLessThan(150);
  });

  it("pas d'AZERIT_DB_URL : pas de registre", () => {
    expect(registryFromEnv({})).toBeNull();
    expect(registryFromEnv({ AZERIT_DB_URL: "  " })).toBeNull();
  });
});

describe("registre : écritures, en ajout seul", () => {
  it("un lien : les deux comptes créés, puis le lien, source testyourskills, une seule fois", async () => {
    const { db, reg } = setup();
    reg.recordLink({ login: "CamArdent", url: URL_, strength: 2, step: "github_social" });
    reg.recordLink({ login: "camardent", url: URL_, strength: 2, step: "github_social" });
    reg.recordLink({ login: "camardent", url: URL_, strength: 1, step: "crustdata_search" });
    await reg.flush();
    expect(db.written()).toEqual([{ login: "camardent", slug: "camille-ardent", strength: 2, step: "github_social" }]);
    expect(db.account("github", "camardent")!.handle).toBe("CamArdent");
    expect(db.links_[0]!.observedAt).toBe("2026-11-20T12:00:00");
  });

  it("jamais de force 3, jamais un pseudo ou une adresse invalide", async () => {
    const { db, reg } = setup();
    reg.recordLink({ login: "camardent", url: URL_, strength: 3, step: "x" });
    reg.recordLink({ login: "pas un login", url: URL_, strength: 2, step: "x" });
    reg.recordLink({ login: "camardent", url: "https://github.com/x", strength: 2, step: "x" });
    await reg.flush();
    expect(db.calls).toEqual([]);
  });

  it("jamais de lien vers un compte marqué (supprimé)", async () => {
    const { db, reg } = setup();
    db.ensure("linkedin", "camille-ardent").deleted = true;
    reg.recordLink({ login: "camardent", url: URL_, strength: 2, step: "github_social" });
    await reg.flush();
    expect(db.links_).toHaveLength(0);
  });

  it("un CV payé : écrit au format de l'App si le compte n'en a aucun, jamais une seconde version", async () => {
    const { db, reg } = setup();
    reg.recordProfile(URL_, ITEM, { login: "camardent" });
    await reg.flush();
    expect(db.cvs).toHaveLength(1);
    expect(await reg.profileOf(URL_)).toMatchObject({ name: "Camille Ardent" });
    reg.recordProfile(URL_, { ...ITEM, headline: "Autre titre" });
    await reg.flush();
    expect(db.cvs).toHaveLength(1);
  });

  it("le CV écrit ne porte aucun lieu : ni celui de la personne, ni ceux de ses postes", async () => {
    const { db, reg } = setup();
    const placed = { ...ITEM, location: { linkedinText: "Lyon" }, experience: [{ ...ITEM.experience[0], location: "Lyon, France" }] };
    reg.recordProfile(URL_, placed);
    await reg.flush();
    const doc = unpackCv(db.cvs[0]!.data)!;
    expect(doc.versions[0]!.profile.location).toBe("");
    expect(doc.versions[0]!.profile.experiences[0]!.location).toBe("");
    expect(JSON.stringify(doc)).not.toContain("Lyon");
  });

  it("une panne d'écriture ne lève jamais", async () => {
    const { db, reg, logs } = setup();
    db.failWith = new Error("permission denied for table cvs");
    reg.recordProfile(URL_, ITEM);
    await reg.flush();
    expect(logs).toHaveLength(1);
  });

  it("les comptes d'une fiche", async () => {
    const { db, reg } = setup();
    reg.recordAccounts({ github: "CamArdent", linkedin: URL_ });
    reg.recordAccounts({ github: null, linkedin: null });
    await reg.flush();
    expect(db.accounts.map((a) => `${a.platform}:${a.key}`)).toEqual(["github:camardent", "linkedin:camille-ardent"]);
  });
});

describe("signaux de la connexion LinkedIn", () => {
  it("déclaré seulement avec un GitHub par l'email et un profil que la personne désigne", () => {
    expect(signInSignal("photo", "email")).toEqual({ strength: 2, step: "linkedin_signin:photo+github_email" });
    expect(signInSignal("picked", "email").strength).toBe(2);
    expect(signInSignal("employer", "email").strength).toBe(1);
    expect(signInSignal("email", "name").strength).toBe(1);
  });
});

describe("registre : par le nom et par l'email (§18.96)", () => {
  /** Un compte LinkedIn de l'App, avec un CV à ce nom (ou sans CV) et une photo. */
  function person(db: MemoryRegistryDb, slug: string, o: { name?: string; headline?: string; photo?: boolean } = {}) {
    const a = db.ensure("linkedin", slug);
    if (o.name) {
      const [first, ...rest] = o.name.split(" ");
      const doc = newCvDocument(`https://www.linkedin.com/in/${slug}`, trimApifyItem({ ...ITEM, firstName: first, lastName: rest.join(" "), headline: o.headline ?? "Dev" })!, { fetchedAt: "2026-11-01T09:00:00" });
      db.cvs.push({ account: a.id, data: packCv(doc), sha256: doc.versions[0]!.sha256, fetchedAt: "2026-11-01T09:00:00" });
    }
    if (o.photo) db.photos.push({ account: a.id, data: new Uint8Array([0xff, 0xd8, 0xff]), contentType: "image/jpeg" });
    return a;
  }

  it("nom complet : les CV à ce nom d'abord, puis les adresses à ce nom sans CV ; jamais un autre nom", async () => {
    const { db, reg } = setup();
    person(db, "camille-ardent-4b2a", { name: "Camille Ardent", headline: "Backend chez Paysolde", photo: true });
    person(db, "ardent-camille", { name: "Camille Ardent" });
    person(db, "camille-ardent-x9", {});
    person(db, "camille-ardentes", { name: "Camille Ardentes" });
    person(db, "camille-ardent-77", { name: "Claire Martin" });
    person(db, "camille-ardentx", {});
    expect(await reg.namesakes("Camille Ardent")).toEqual([
      { url: "https://www.linkedin.com/in/camille-ardent-4b2a", name: "Camille Ardent", headline: "Backend chez Paysolde", hasPhoto: true },
      { url: "https://www.linkedin.com/in/ardent-camille", name: "Camille Ardent", headline: "Dev", hasPhoto: false },
      { url: "https://www.linkedin.com/in/camille-ardent-x9", name: null, headline: "", hasPhoto: false },
    ]);
  });

  it("en cours de frappe : seuls les CV dont le nom commence par ce qui est tapé", async () => {
    const { db, reg } = setup();
    person(db, "camille-ardent", { name: "Camille Ardent" });
    person(db, "camille-ardentes", { name: "Camille Ardentes" });
    person(db, "camille-arnaud", {});
    expect((await reg.namesakes("camille ard", { partial: true })).map((n) => n.name)).toEqual(["Camille Ardent", "Camille Ardentes"]);
    expect(await reg.namesakes("camille")).toEqual([]);
    expect(db.calls).toEqual(["namesakes"]);
  });

  it("base en panne ou lente : [], sans attendre", async () => {
    const { db, reg } = setup({ timeoutMs: 20 });
    person(db, "camille-ardent", { name: "Camille Ardent" });
    db.delayMs = 60;
    expect(await reg.namesakes("Camille Ardent")).toEqual([]);
  });

  it("l'email : le seul profil qu'il désigne ; deux profils : rien", async () => {
    const { db, reg } = setup();
    db.emails = { "camille-ardent": "camille@paysolde.io", "c-ardent": "c@ardent.dev", "c-ardent-2": "c@ardent.dev" };
    expect(await reg.linkedinOfEmail("Camille@Paysolde.io")).toBe(URL_);
    expect(await reg.linkedinOfEmail("c@ardent.dev")).toBeNull();
    expect(await reg.linkedinOfEmail("pas un email")).toBeNull();
  });

  it("fonction des emails pas encore posée : rien, une ligne au journal, et les autres lectures continuent", async () => {
    const { db, reg, logs } = setup();
    db.emails = null;
    db.seedLink("camardent", "camille-ardent", 2);
    expect(await reg.linkedinOfEmail("camille@paysolde.io")).toBeNull();
    expect(await reg.linkedinOfEmail("camille@paysolde.io")).toBeNull();
    expect(logs).toHaveLength(1);
    expect(db.calls.filter((c) => c === "linkedinByEmail")).toHaveLength(1);
    expect(await reg.linkedinOf("camardent")).toEqual({ url: URL_, strength: 2 });
  });
});
