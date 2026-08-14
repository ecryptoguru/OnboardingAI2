"use node";

/**
 * Compatibility re-export of the unified role registry.
 * All role/contact inference logic now lives in ./roleRegistry.
 */

export {
  ROLE_REGISTRY,
  normalizeRoleText,
  getRoleByCanonical,
  normalizeStakeholderRole,
  isSingletonRole,
  isDecisionMakerRole,
  isAcademicNonDecisionRole,
  inferRoleFromContactContext,
  getRoleEmailAliases,
  getRoleEmailRank,
  inferPreferredRoleEmail,
  inferRoleFromInstitutionEmail,
  isRoleBasedInstitutionEmail,
  choosePreferredRoleEmail,
  canonicalizeInstitutionEmail,
  normalizeInstitutionDomain,
  getEmailParts,
  isRelevantInstitutionEmailDomain,
  namesEquivalent,
  TARGET_ROLES,
} from "./roleRegistry";
