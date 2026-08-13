"use node";

/**
 * Compatibility re-export of role quality helpers from the unified registry.
 */

export {
  isDecisionMakerRole,
  isAcademicNonDecisionRole,
} from "./roleRegistry";

export { isAcademicNonDecisionRole as isLikelyAcademicNonDecisionRole } from "./roleRegistry";
