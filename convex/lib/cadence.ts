/**
 * Cadence configuration for Fretbox Outreach AI.
 * Defines the delay between steps in days.
 */

export const DAYS_TO_MS = 24 * 60 * 60 * 1000;

export const CADENCE = {
  STEP_1_TO_2: 4 * DAYS_TO_MS,
  STEP_2_TO_3: 7 * DAYS_TO_MS,
  STEP_3_TO_4: 10 * DAYS_TO_MS,
  // Add more steps or exit delays here
};

export function getNextSendAt(currentStep: number): number | null {
  const now = Date.now();
  
  switch (currentStep) {
    case 1:
      return now + CADENCE.STEP_1_TO_2;
    case 2:
      return now + CADENCE.STEP_2_TO_3;
    case 3:
      return now + CADENCE.STEP_3_TO_4;
    default:
      // No next step after Step 4
      return null;
  }
}
