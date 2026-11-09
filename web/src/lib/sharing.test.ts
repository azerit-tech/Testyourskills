import { describe, expect, it } from "vitest";
import { inAppBrowser } from "./sharing";

const IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)";
const ANDROID = "Mozilla/5.0 (Linux; Android 15; Pixel 9";

describe("navigateur intégré d'une appli (§18.27)", () => {
  it("reconnaît LinkedIn, Instagram et Facebook sur iPhone", () => {
    expect(inAppBrowser(`${IOS} Mobile/15E148 [LinkedInApp]/9.30.1234`)).toBe(true);
    expect(inAppBrowser(`${IOS} Mobile/15E148 Instagram 355.0.0.31.108 (iPhone16,1; iOS 18_1; fr_FR)`)).toBe(true);
    expect(inAppBrowser(`${IOS} Mobile/15E148 [FBAN/FBIOS;FBAV/485.0.0.31.108;FBBV/1]`)).toBe(true);
  });

  it("reconnaît une WebView Android, avec ou sans nom d'appli", () => {
    expect(inAppBrowser(`${ANDROID}; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36 LinkedInApp`)).toBe(true);
    expect(inAppBrowser(`${ANDROID}; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36`)).toBe(true);
  });

  it("une WebView iOS sans nom : pas de « Safari/ »", () => {
    expect(inAppBrowser(`${IOS} Mobile/15E148`)).toBe(true);
  });

  it("laisse passer les vrais navigateurs", () => {
    expect(inAppBrowser(`${IOS} Version/18.1 Mobile/15E148 Safari/604.1`)).toBe(false);
    expect(inAppBrowser(`${IOS} CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1`)).toBe(false);
    expect(inAppBrowser(`${ANDROID}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36`)).toBe(false);
    expect(inAppBrowser("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15")).toBe(false);
    expect(inAppBrowser("Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0")).toBe(false);
  });
});
