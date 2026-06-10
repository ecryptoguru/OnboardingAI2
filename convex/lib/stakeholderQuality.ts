"use node";

import { normalizeRoleText } from "./contactInference";

const DECISION_ROLE_KEYWORDS = [
  "owner",
  "president",
  "chairman",
  "chairperson",
  "chancellor",
  "vice chancellor",
  "pro vice chancellor",
  "registrar",
  "dean",
  "director",
  "principal",
  "controller of examinations",
  "finance officer",
  "librarian",
  "head of department",
  "hod",
  "placement officer",
  "public relations officer",
  "chief warden",
  "rector",
  "secretary",
  "treasurer",
  "dean of faculty",
  "head of administration",
  "administrative officer",
  "executive director",
  "managing director",
  "joint director",
  "deputy director",
  "associate director",
];

const ACADEMIC_NON_DECISION_ROLE_RE =
  /\b(assistant professor|associate professor|professor|lecturer|faculty|research scientist|scientist)\b/i;

export function isDecisionMakerRole(role?: string): boolean {
  if (!role) return false;
  const normalized = normalizeRoleText(role);
  if (!normalized) return false;
  return DECISION_ROLE_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

export function isLikelyAcademicNonDecisionRole(role?: string): boolean {
  if (!role) return false;
  const normalized = normalizeRoleText(role);
  if (!normalized) return false;
  if (!ACADEMIC_NON_DECISION_ROLE_RE.test(normalized)) return false;
  // Keep mixed admin-academic roles (e.g. "Dean and Professor")
  return !isDecisionMakerRole(role);
}
