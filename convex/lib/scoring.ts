export const SCORING_FACTORS = {
  naac: {
    "A++": 25,
    "A+": 20,
    "A": 15,
    "B++": 10,
    "B+": 5,
    "B": 0,
    "C": 0,
  } as Record<string, number>,
  universityType: {
    "private": 15, // High willingness to adopt SAAS
    "deemed": 10,  // Good budgets, moderate speed
    "state": 5,    // Government, slow procurement
    "central": 5,  // Government, slow procurement
    "ini": 5,      // Institutes of National Importance (IITs, NITs), autonomous but govt-tied
    "public": 5,   // Fallback for generic public
  } as Record<string, number>,
};

export function calculateDeterministicScore(
  uni: { student_count?: number; type?: string; naac_grade?: string; city?: string; state?: string; demographics?: any },
  signals: any[],
  stakeholdersCount: number = 0
) {
  // 1. Hostelite Score (Max 30) - Crucial for Fretbox Hostel Module
  let hostelite_score = 0;
  let hostelites = 0;
  if (uni.demographics && typeof uni.demographics.hostelites === "number") {
    hostelites = uni.demographics.hostelites;
  }
  if (hostelites >= 5000) hostelite_score = 30;
  else if (hostelites >= 2000) hostelite_score = 20;
  else if (hostelites >= 500) hostelite_score = 10;
  else if (hostelites > 0) hostelite_score = 5;

  // 2. Student Scale Score (Max 20) - Campus ERP size
  // FIX: Always prefer demographics data over the stale student_count field.
  // demographics.total_students is authoritative (extracted from NIRF/NAAC/AISHE).
  // Only fall back to student_count if demographics is completely absent.
  let student_scale_score = 0;
  let calculated_students = 0;
  if (uni.demographics) {
    if (uni.demographics.total_students) {
      calculated_students = uni.demographics.total_students;
    } else if (uni.demographics.nirf_total) {
      calculated_students = uni.demographics.nirf_total;
    } else if (uni.demographics.total_students_male || uni.demographics.total_students_female) {
      calculated_students = (uni.demographics.total_students_male || 0) + (uni.demographics.total_students_female || 0);
    }
  }
  // Only fall back to stale student_count if demographics returned nothing
  if (!calculated_students && uni.student_count) {
    calculated_students = uni.student_count;
  }

  if (calculated_students >= 20000) student_scale_score = 20;
  else if (calculated_students >= 10000) student_scale_score = 15;
  else if (calculated_students >= 5000) student_scale_score = 10;
  else if (calculated_students >= 2000) student_scale_score = 5;

  // 3. NAAC Score (Max 15) - Budget / Quality proxy
  let naac_score = 0;
  if (uni.naac_grade) {
    const g = uni.naac_grade.trim().toUpperCase();
    if (g === "A++") naac_score = 15;
    else if (g === "A+") naac_score = 10;
    else if (g === "A") naac_score = 5;
    else if (g === "B++") naac_score = 3;
  }

  // 4. Agility Score (Max 15) - Private/Deemed move faster
  let agility_score = 0;
  if (uni.type) {
    const t = uni.type.toLowerCase();
    if (t.includes("private") || t.includes("deemed")) {
      agility_score = 15;
    } else {
      agility_score = 5; // State, Central, Public
    }
  }

  // 5. Stakeholder Score (Max 10) - Decision makers available
  let stakeholder_score = 0;
  if (stakeholdersCount >= 5) stakeholder_score = 10;
  else if (stakeholdersCount >= 3) stakeholder_score = 7;
  else if (stakeholdersCount >= 1) stakeholder_score = 3;

  // 6. Digital Signals Score (Max 10) - News & LinkedIn presence
  let digital_signals_score = 0;
  const hasLinkedIn = signals.some((s: any) => s.signal_type === "linkedin");
  const hasNews = signals.some((s: any) => s.signal_type === "news");
  if (hasLinkedIn) digital_signals_score += 5;
  if (hasNews) digital_signals_score += 5;

  const deterministic_score = Math.min(
    100,
    hostelite_score + student_scale_score + naac_score + agility_score + stakeholder_score + digital_signals_score
  );

  // Debug log so we can trace scoring in Convex logs
  console.log(
    `[Scoring] breakdown → hostelites:${hostelites} (+${hostelite_score}) | students:${calculated_students} (+${student_scale_score}) | naac:${uni.naac_grade || 'N/A'} (+${naac_score}) | type:${uni.type || 'N/A'} (+${agility_score}) | stakeholders:${stakeholdersCount} (+${stakeholder_score}) | signals:+${digital_signals_score} | TOTAL:${deterministic_score}`
  );

  return {
    deterministic_score,
    factors: {
      hostelite_score,
      student_scale_score,
      naac_score,
      agility_score,
      stakeholder_score,
      digital_signals_score,
    },
  };
}
