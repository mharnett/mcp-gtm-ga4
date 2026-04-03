// Consent classification logic -- ported from gtm_consent.py

const GOOGLE_AD_TAG_TYPES = new Set(["awct", "awud", "gclidw", "sp", "flc"]);
const GOOGLE_ANALYTICS_TAG_TYPES = new Set(["googtag", "gaawe"]);
const NON_GOOGLE_AD_TYPES = new Set(["baut", "bzi", "asp"]);
const AD_NAME_PATTERNS = [
  "meta", "facebook", "linkedin", "rollworks", "capterra", "g2",
  "salesloft", "microsoft", "bing", "google ads",
];

export interface TagClassification {
  tagId: string;
  name: string;
  type: string;
  currentStatus: string;
  recommendedConsent: string;
}

export function classifyTag(tag: any): TagClassification {
  const tagType = tag.type || "";
  const tagName = (tag.name || "").toLowerCase();
  const consent = tag.consentSettings || {};
  const status = consent.consentStatus || "NONE";

  let recommended: string;
  if (GOOGLE_ANALYTICS_TAG_TYPES.has(tagType)) {
    recommended = "analytics_storage";
  } else if (GOOGLE_AD_TAG_TYPES.has(tagType) || NON_GOOGLE_AD_TYPES.has(tagType)) {
    recommended = "ad_storage";
  } else if (tagType === "html") {
    if (AD_NAME_PATTERNS.some(p => tagName.includes(p))) {
      recommended = "ad_storage";
    } else if (["ga4", "analytics", "scroll", "click"].some(kw => tagName.includes(kw))) {
      recommended = "analytics_storage";
    } else {
      recommended = "review_manually";
    }
  } else {
    recommended = "review_manually";
  }

  return {
    tagId: tag.tagId,
    name: tag.name,
    type: tagType,
    currentStatus: status,
    recommendedConsent: recommended,
  };
}
