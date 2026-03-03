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
  signals: any[]
) {
  let student_count_score = 0;
  
  // Calculate total students from demographics if available
  let calculated_students = uni.student_count || 0;
  if (!calculated_students && uni.demographics) {
    if (uni.demographics.total_students) {
      calculated_students = uni.demographics.total_students;
    } else if (uni.demographics.total_students_male || uni.demographics.total_students_female) {
      calculated_students = (uni.demographics.total_students_male || 0) + (uni.demographics.total_students_female || 0);
    }
  }

  if (calculated_students) {
    if (calculated_students > 20000) student_count_score = 20;
    else if (calculated_students > 10000) student_count_score = 15;
    else if (calculated_students > 5000) student_count_score = 10;
    else student_count_score = 5;
  }

  let naac_score = 0;
  if (uni.naac_grade) {
    naac_score = SCORING_FACTORS.naac[uni.naac_grade] || 0;
  }

  // Baseline digital presence based on linkedin data
  const liSignals = signals.filter((s: any) => s.signal_type === "linkedin").length;
  const digital_presence_score = Math.min(15, liSignals * 5);

  const newsSignals = signals.filter((s: any) => s.signal_type === "news").length;
  const news_activity_score = Math.min(20, newsSignals * 5);

  let location_score = 0;
  if (uni.city || uni.state) location_score = 10; // Bonus for having clean location data
  if (uni.type) {
    location_score += SCORING_FACTORS.universityType[uni.type.toLowerCase()] || 0;
  }

  const deterministic_score = Math.min(
    100,
    student_count_score + naac_score + digital_presence_score + news_activity_score + location_score
  );

  return {
    deterministic_score,
    factors: {
      student_count_score,
      naac_score,
      digital_presence_score,
      news_activity_score,
      location_score,
    },
  };
}
