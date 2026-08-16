import type { StakeholderLike } from "./validateDeepEnrichment";

function digitsOnly(value?: string | null): string | undefined {
  if (!value) return undefined;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7 ? digits : undefined;
}

/**
 * Remove email/phone/LinkedIn that are not literally present in the source
 * block. Keeps the model honest: contact details must be evidence-backed, and
 * a page-controlled prompt injection can't plant arbitrary emails/phones into
 * outreach drafts.
 */
export function sanitiseEvidence(
  stakeholders: StakeholderLike[],
  block: string,
): StakeholderLike[] {
  const lowerBlock = block.toLowerCase();
  return stakeholders.map((st) => {
    const out: StakeholderLike = { ...st };

    if (out.linkedin_url) {
      const url = out.linkedin_url.toLowerCase();
      if (!lowerBlock.includes(url)) {
        out.linkedin_url = undefined;
        out.linkedin_source = "none";
        if (typeof out.contact_confidence === "number" && out.contact_confidence > 0.5) {
          out.contact_confidence = 0.5;
        }
      } else {
        out.linkedin_source = "scraped";
      }
    } else {
      out.linkedin_source = "none";
    }

    if (out.phone) {
      const phoneDigits = digitsOnly(out.phone);
      if (!phoneDigits || !lowerBlock.includes(phoneDigits)) {
        out.phone = undefined;
        out.phone_source = "none";
      } else {
        out.phone_source = "scraped";
      }
    } else {
      out.phone_source = "none";
    }

    if (out.email) {
      const email = out.email.toLowerCase();
      if (!lowerBlock.includes(email)) {
        out.email = undefined;
        out.email_source = "none";
        if (typeof out.contact_confidence === "number" && out.contact_confidence > 0.5) {
          out.contact_confidence = 0.5;
        }
      } else {
        out.email_source = "scraped";
      }
    } else {
      out.email_source = "none";
    }

    return out;
  });
}
