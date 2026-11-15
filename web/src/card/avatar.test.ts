// L'avatar généré par GitHub ne se montre jamais agrandi : il passe pour une
// image cassée. On le reconnaît à sa taille (420 × 420 quelle que soit la taille
// demandée), sans rien télécharger de plus ; le doute garde la photo.
import { describe, expect, it } from "vitest";
import { askedSize, avatarVerdict, isDefaultAvatar } from "./avatar";

const BY_LOGIN = "https://github.com/leamd.png?size=280";
const BY_ID = "https://avatars.githubusercontent.com/u/1024025?v=4&s=280";

describe("la taille demandée à GitHub", () => {
  it("`size` sur github.com/<pseudo>.png, `s` sur avatars.githubusercontent.com", () => {
    expect(askedSize(BY_LOGIN)).toBe(280);
    expect(askedSize(BY_ID)).toBe(280);
    expect(askedSize("https://avatars.githubusercontent.com/leamd?s=56")).toBe(56);
  });

  it("null sans taille, ailleurs que chez GitHub, ou sur une adresse illisible", () => {
    expect(askedSize("https://avatars.githubusercontent.com/u/1024025?v=4")).toBeNull();
    expect(askedSize("https://github.com/leamd")).toBeNull();
    expect(askedSize("https://exemple.test/photo.png?size=280")).toBeNull();
    expect(askedSize("/photo-demo.jpg")).toBeNull();
    expect(askedSize("data:image/png;base64,AAAA")).toBeNull();
    expect(askedSize("https://avatars.githubusercontent.com/u/1?s=abc")).toBeNull();
  });
});

describe("avatar généré ou photo", () => {
  it("420 × 420 reçu pour 280 demandé : l'avatar généré", () => {
    expect(isDefaultAvatar(BY_LOGIN, 420, 420)).toBe(true);
    expect(isDefaultAvatar(BY_ID, 420, 420)).toBe(true);
    expect(avatarVerdict(BY_ID, { naturalWidth: 420, naturalHeight: 420 })).toBe("none");
  });

  it("une photo envoyée revient à la taille demandée, ou plus petite : on la garde", () => {
    expect(isDefaultAvatar(BY_ID, 280, 280)).toBe(false);
    expect(isDefaultAvatar(BY_ID, 200, 200)).toBe(false);
    expect(avatarVerdict(BY_ID, { naturalWidth: 280, naturalHeight: 280 })).toBe("photo");
  });

  it("le doute garde la photo : pas de taille demandée, 420 ou plus demandé, autre hébergeur", () => {
    expect(isDefaultAvatar("https://avatars.githubusercontent.com/u/1024025?v=4", 420, 420)).toBe(false);
    expect(isDefaultAvatar("https://avatars.githubusercontent.com/u/1024025?s=420", 420, 420)).toBe(false);
    expect(isDefaultAvatar("https://avatars.githubusercontent.com/u/1024025?s=460", 420, 420)).toBe(false);
    expect(isDefaultAvatar("https://exemple.test/photo.png?size=280", 420, 420)).toBe(false);
    expect(isDefaultAvatar("/photo-demo.jpg", 420, 420)).toBe(false);
  });

  it("une image qui n'a pas chargé : pas de photo", () => {
    expect(avatarVerdict(BY_ID, null)).toBe("none");
    expect(avatarVerdict(BY_ID, { naturalWidth: 0, naturalHeight: 0 })).toBe("none");
  });
});
