import { Doc } from "../_generated/dataModel";

export type FretboxModule = {
  id: string;
  name: string;
  description: string;
  benefit: string;
};

export const MODULES: Record<string, FretboxModule> = {
  HOSTEL_MGMT: {
    id: "hostel_mgmt",
    name: "AI-Powered Hostel Management",
    description: "Automated room allocation, attendance, and grievance redressal for residential campuses.",
    benefit: "Reduces administrative overhead by 40% while improving student safety.",
  },
  SECURITY_GATE: {
    id: "security_gate",
    name: "Smart Visitor & Gate Security",
    description: "QR-based visitor entry, student leave management, and real-time security alerts.",
    benefit: "Ensures 100% accountability for every entry and exit in the campus.",
  },
  FEE_PAYMENTS: {
    id: "fee_payments",
    name: "Digital Fee Collection & Accounts",
    description: "Multi-channel fee payments, automated reminders, and real-time reconciliation.",
    benefit: "Improves collection efficiency and reduces manual accounting errors.",
  },
  ACADEMIC_ERP: {
    id: "academic_erp",
    name: "Outcome-Based Academic ERP",
    description: "Attendance tracking, timetable management, and NAAC/NIRF data compliance.",
    benefit: "Simplifies accreditation reporting and improves academic transparency.",
  },
  COMMUNITY_APP: {
    id: "community_app",
    name: "Student Community & Engagement",
    description: "Events, notices, and peer-to-peer discussion forums on a unified mobile app.",
    benefit: "Increases student engagement and streamlines internal communication.",
  },
};

/**
 * Recommends a set of modules based on university characteristics.
 */
export function recommendModules(
  university: Doc<"universities">,
  signals: Pick<Doc<"universitySignals">, "content" | "signal_type">[]
): FretboxModule[] {
  const recommendations: FretboxModule[] = [];

  // 1. Basic Rules
  // All universities get the Security Gate module as a baseline "wow" factor
  recommendations.push(MODULES.SECURITY_GATE);

  // Private universities often have higher expectations for student community apps
  if (university.type?.toLowerCase() === "private") {
    recommendations.push(MODULES.COMMUNITY_APP);
  }

  // Deemed/Private often care more about fee collection efficiency
  if (university.type?.toLowerCase() !== "public") {
    recommendations.push(MODULES.FEE_PAYMENTS);
  }

  // 2. Signal-based Rules
  const hasHostelSignal = signals.some(s => 
    s.content.toLowerCase().includes("hostel") || 
    s.content.toLowerCase().includes("residential") ||
    s.content.toLowerCase().includes("dormitory")
  );

  if (hasHostelSignal) {
    recommendations.push(MODULES.HOSTEL_MGMT);
  }

  // If they have certain keywords related to academic rigor or accreditation
  const hasAccreditationSignal = signals.some(s => 
    s.content.toLowerCase().includes("naac") || 
    s.content.toLowerCase().includes("nirf") ||
    s.content.toLowerCase().includes("ranking")
  );

  if (hasAccreditationSignal || university.lead_tier === "High") {
    recommendations.push(MODULES.ACADEMIC_ERP);
  }

  // Deduplicate and return (though rules currently don't duplicate)
  return Array.from(new Set(recommendations));
}

/**
 * Determines a suggested pricing tier based on lead tier and type.
 */
export function suggestPricingTier(university: Doc<"universities">): "Starter" | "Professional" | "Enterprise" {
  if (university.lead_tier === "High") return "Enterprise";
  if (university.lead_tier === "Medium") return "Professional";
  return "Starter";
}
