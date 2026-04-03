import { describe, it, expect } from "vitest";
import { classifyTag } from "./consent.js";

describe("classifyTag", () => {
  it("googtag recommends analytics_storage", () => {
    expect(classifyTag({ tagId: "101", name: "GA4 - Base Tag", type: "googtag", consentSettings: { consentStatus: "needed" } }).recommendedConsent).toBe("analytics_storage");
  });

  it("gaawe recommends analytics_storage", () => {
    expect(classifyTag({ tagId: "249", name: "GA4 - Form", type: "gaawe", consentSettings: { consentStatus: "needed" } }).recommendedConsent).toBe("analytics_storage");
  });

  it("awct recommends ad_storage", () => {
    expect(classifyTag({ tagId: "41", name: "Google Ads - Demo", type: "awct", consentSettings: { consentStatus: "needed" } }).recommendedConsent).toBe("ad_storage");
  });

  it("baut recommends ad_storage", () => {
    expect(classifyTag({ tagId: "42", name: "Microsoft Ads UET", type: "baut", consentSettings: { consentStatus: "needed" } }).recommendedConsent).toBe("ad_storage");
  });

  it("linkedin html recommends ad_storage", () => {
    expect(classifyTag({ tagId: "119", name: "LinkedIn Event - Conversion", type: "html", consentSettings: { consentStatus: "notSet" } }).recommendedConsent).toBe("ad_storage");
  });

  it("meta html recommends ad_storage", () => {
    expect(classifyTag({ tagId: "86", name: "Meta - Base Pixel", type: "html", consentSettings: { consentStatus: "notSet" } }).recommendedConsent).toBe("ad_storage");
  });

  it("ga4 html recommends analytics_storage", () => {
    expect(classifyTag({ tagId: "277", name: "GA4 CTA location- Header", type: "html", consentSettings: { consentStatus: "notSet" } }).recommendedConsent).toBe("analytics_storage");
  });

  it("unknown html gets review_manually", () => {
    expect(classifyTag({ tagId: "999", name: "Custom Widget Loader", type: "html", consentSettings: { consentStatus: "notSet" } }).recommendedConsent).toBe("review_manually");
  });

  it("detects notSet status", () => {
    expect(classifyTag({ tagId: "86", name: "Meta", type: "html", consentSettings: { consentStatus: "notSet" } }).currentStatus).toBe("notSet");
  });

  it("detects needed status", () => {
    expect(classifyTag({ tagId: "101", name: "GA4", type: "googtag", consentSettings: { consentStatus: "needed" } }).currentStatus).toBe("needed");
  });
});
