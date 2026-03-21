"use node";

import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";

const BLUE = "#1d4ed8";
const DARK = "#0f172a";
const MUTED = "#64748b";
const LIGHT_BG = "#f8fafc";
const BORDER = "#e2e8f0";
const CHECK_GREEN = "#16a34a";

const styles = StyleSheet.create({
  page: {
    padding: 50,
    fontFamily: "Helvetica",
    color: DARK,
    fontSize: 10.5,
    lineHeight: 1.6,
    backgroundColor: "#ffffff",
  },
  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    marginBottom: 32,
    borderBottomWidth: 2,
    borderBottomColor: BLUE,
    paddingBottom: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  brandName: {
    fontSize: 22,
    fontWeight: "bold",
    color: BLUE,
    letterSpacing: 1,
  },
  proposalMeta: {
    fontSize: 9,
    color: MUTED,
    textAlign: "right",
  },
  // ── Title Block ───────────────────────────────────────────────────────────
  titleSection: {
    marginBottom: 28,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  proposalLabel: {
    fontSize: 9,
    fontWeight: "bold",
    color: BLUE,
    textTransform: "uppercase",
    letterSpacing: 2,
    marginBottom: 6,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: DARK,
    marginBottom: 6,
    lineHeight: 1.3,
  },
  subtitle: {
    fontSize: 12,
    color: MUTED,
    marginBottom: 4,
  },
  attentionLine: {
    fontSize: 11,
    fontWeight: "bold",
    color: DARK,
    marginTop: 6,
  },
  dateText: {
    fontSize: 9,
    color: MUTED,
    marginTop: 4,
  },
  // ── Section ───────────────────────────────────────────────────────────────
  section: {
    marginBottom: 22,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  sectionAccent: {
    width: 3,
    height: 14,
    backgroundColor: BLUE,
    marginRight: 8,
    borderRadius: 2,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    color: DARK,
  },
  // ── Typography ────────────────────────────────────────────────────────────
  paragraph: {
    marginBottom: 8,
    color: "#1e293b",
    lineHeight: 1.65,
  },
  // ── Bullet list ───────────────────────────────────────────────────────────
  bulletList: {
    marginLeft: 4,
    marginTop: 2,
  },
  bulletItem: {
    flexDirection: "row",
    marginBottom: 5,
    alignItems: "flex-start",
  },
  bulletPoint: {
    width: 14,
    fontSize: 11,
    color: BLUE,
    lineHeight: 1.6,
  },
  checkPoint: {
    width: 14,
    fontSize: 10,
    color: CHECK_GREEN,
    lineHeight: 1.6,
    fontWeight: "bold",
  },
  bulletText: {
    flex: 1,
    color: "#1e293b",
    lineHeight: 1.6,
  },
  // ── Numbered list ─────────────────────────────────────────────────────────
  numberedItem: {
    flexDirection: "row",
    marginBottom: 5,
    alignItems: "flex-start",
  },
  numberBadge: {
    width: 16,
    height: 16,
    backgroundColor: BLUE,
    borderRadius: 8,
    marginRight: 8,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  numberText: {
    fontSize: 7,
    color: "#ffffff",
    fontWeight: "bold",
  },
  // ── ROI Box ───────────────────────────────────────────────────────────────
  roiBox: {
    backgroundColor: LIGHT_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 6,
    padding: 14,
  },
  roiHeadline: {
    fontSize: 12,
    fontWeight: "bold",
    color: BLUE,
    marginBottom: 10,
  },
  // ── Module Cards ──────────────────────────────────────────────────────────
  moduleCard: {
    backgroundColor: LIGHT_BG,
    padding: 10,
    borderRadius: 5,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: BORDER,
    borderLeftWidth: 3,
    borderLeftColor: BLUE,
  },
  moduleName: {
    fontWeight: "bold",
    fontSize: 11,
    marginBottom: 3,
    color: DARK,
  },
  moduleDescription: {
    fontSize: 9.5,
    color: MUTED,
    lineHeight: 1.5,
  },
  moduleBenefit: {
    fontSize: 9.5,
    color: CHECK_GREEN,
    marginTop: 3,
    fontStyle: "italic",
  },
  // ── Divider ───────────────────────────────────────────────────────────────
  divider: {
    borderTopWidth: 1,
    borderTopColor: BORDER,
    marginVertical: 10,
  },
  // ── Footer ────────────────────────────────────────────────────────────────
  footer: {
    position: "absolute",
    bottom: 28,
    left: 50,
    right: 50,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerLeft: {
    fontSize: 8,
    color: MUTED,
  },
  footerRight: {
    fontSize: 8,
    color: MUTED,
    textAlign: "right",
  },
  confidentialBadge: {
    fontSize: 7.5,
    color: "#b91c1c",
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
});

// ── Helper: Section Header with accent bar ────────────────────────────────────
const SectionHeader = ({ title }: { title: string }) => (
  <View style={styles.sectionHeader}>
    <View style={styles.sectionAccent} />
    <Text style={styles.sectionTitle}>{title}</Text>
  </View>
);

export type ExecutiveSummaryStructured = {
  hook: string;
  why_now: string;
  vision_statement: string;
};

export type RoiSummary = {
  headline: string;
  bullets: string[];
};

export type ProposalData = {
  universityName: string;
  agenda: string[];
  executiveSummary: ExecutiveSummaryStructured | string; // Handle both old and new format
  problemStatement: string[];
  solutionOverview: string;
  keyBenefits?: string[];
  roiSummary?: RoiSummary;
  nextSteps?: string[];
  modules: Array<{ name: string; description: string; benefit: string }>;
  preparedFor?: string;
  date: string;
  proposalNumber: string;
};

export const ProposalDocument = ({ data }: { data: ProposalData }) => {
  const execSummary = data.executiveSummary;
  const isStructured = typeof execSummary === "object" && execSummary !== null;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* ── Header ── */}
        <View style={styles.header}>
          <Text style={styles.brandName}>Fretbox</Text>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.proposalMeta}>Proposal #{data.proposalNumber}</Text>
            <Text style={styles.proposalMeta}>Confidential & Proprietary</Text>
          </View>
        </View>

        {/* ── Title Block ── */}
        <View style={styles.titleSection}>
          <Text style={styles.proposalLabel}>Strategic Partnership Proposal</Text>
          <Text style={styles.title}>{data.universityName}</Text>
          <Text style={styles.subtitle}>AI-Powered Campus Management Platform</Text>
          {data.preparedFor && (
            <Text style={styles.attentionLine}>Attn: {data.preparedFor}</Text>
          )}
          <Text style={styles.dateText}>Issued: {data.date} · Valid for 30 days</Text>
        </View>

        {/* ── Executive Summary ── */}
        <View style={styles.section}>
          <SectionHeader title="Executive Summary" />
          {isStructured ? (
            <>
              <Text style={styles.paragraph}>{(execSummary as ExecutiveSummaryStructured).hook}</Text>
              <Text style={styles.paragraph}>{(execSummary as ExecutiveSummaryStructured).why_now}</Text>
              <Text style={styles.paragraph}>{(execSummary as ExecutiveSummaryStructured).vision_statement}</Text>
            </>
          ) : (
            <Text style={styles.paragraph}>{execSummary as string}</Text>
          )}
        </View>

        {/* ── Identified Challenges ── */}
        <View style={styles.section}>
          <SectionHeader title="Identified Challenges" />
          <View style={styles.bulletList}>
            {(Array.isArray(data.problemStatement)
              ? data.problemStatement
              : [data.problemStatement]
            ).map((item: string, i: number) => (
              <View key={i} style={styles.bulletItem}>
                <Text style={styles.bulletPoint}>›</Text>
                <Text style={styles.bulletText}>{item}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Discovery Agenda ── */}
        <View style={styles.section}>
          <SectionHeader title="Proposed Discovery Agenda" />
          <View style={styles.bulletList}>
            {data.agenda.map((item: string, i: number) => (
              <View key={i} style={styles.numberedItem}>
                <View style={styles.numberBadge}>
                  <Text style={styles.numberText}>{i + 1}</Text>
                </View>
                <Text style={[styles.bulletText, { flex: 1 }]}>{item}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Recommended Solutions ── */}
        <View style={styles.section}>
          <SectionHeader title="Recommended Solutions" />
          <Text style={styles.paragraph}>{data.solutionOverview}</Text>
          {data.modules.map((m, i) => (
            <View key={i} style={styles.moduleCard}>
              <Text style={styles.moduleName}>{m.name}</Text>
              <Text style={styles.moduleDescription}>{m.description}</Text>
              <Text style={styles.moduleBenefit}>✓ {m.benefit}</Text>
            </View>
          ))}
        </View>

        {/* ── Key Benefits ── */}
        {data.keyBenefits && data.keyBenefits.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="Key Benefits" />
            <View style={styles.bulletList}>
              {data.keyBenefits.map((b: string, i: number) => (
                <View key={i} style={styles.bulletItem}>
                  <Text style={styles.checkPoint}>✓</Text>
                  <Text style={styles.bulletText}>{b}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── ROI Summary ── */}
        {data.roiSummary && (
          <View style={styles.section}>
            <SectionHeader title="Return on Investment" />
            <View style={styles.roiBox}>
              <Text style={styles.roiHeadline}>{data.roiSummary.headline}</Text>
              <View style={styles.bulletList}>
                {data.roiSummary.bullets.map((b: string, i: number) => (
                  <View key={i} style={styles.bulletItem}>
                    <Text style={styles.checkPoint}>✓</Text>
                    <Text style={styles.bulletText}>{b}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* ── Next Steps ── */}
        {data.nextSteps && data.nextSteps.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="Next Steps" />
            <View style={styles.bulletList}>
              {data.nextSteps.map((s: string, i: number) => (
                <View key={i} style={styles.numberedItem}>
                  <View style={styles.numberBadge}>
                    <Text style={styles.numberText}>{i + 1}</Text>
                  </View>
                  <Text style={[styles.bulletText, { flex: 1 }]}>{s}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── Footer ── */}
        <View style={styles.footer}>
          <View>
            <Text style={styles.footerLeft}>© 2026 Fretbox Campus Technologies Pvt. Ltd.</Text>
            <Text style={styles.footerLeft}>Prepared by the Fretbox Partnerships Team</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.footerRight}>partnerships@fretbox.in</Text>
            <Text style={styles.footerRight}>www.fretbox.in</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
};
