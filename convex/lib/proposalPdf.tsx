"use node";

import React from "react";
import { 
  Document, 
  Page, 
  Text, 
  View, 
  StyleSheet, 
  Font,
  Image 
} from "@react-pdf/renderer";

// Styles for the PDF
const styles = StyleSheet.create({
  page: {
    padding: 50,
    fontFamily: "Helvetica",
    color: "#18181b",
    fontSize: 11,
    lineHeight: 1.5,
  },
  header: {
    marginBottom: 40,
    borderBottomWidth: 1,
    borderBottomColor: "#e4e4e7",
    paddingBottom: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  logo: {
    width: 100,
  },
  brandName: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#2563eb",
  },
  titleSection: {
    marginBottom: 30,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 8,
    color: "#09090b",
  },
  subtitle: {
    fontSize: 14,
    color: "#71717a",
    marginBottom: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "#2563eb",
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f4f4f5",
    paddingBottom: 4,
  },
  paragraph: {
    marginBottom: 10,
  },
  bulletList: {
    marginLeft: 15,
  },
  bulletItem: {
    flexDirection: "row",
    marginBottom: 6,
  },
  bulletPoint: {
    width: 15,
    fontSize: 12,
  },
  moduleCard: {
    backgroundColor: "#f8fafc",
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  moduleName: {
    fontWeight: "bold",
    fontSize: 13,
    marginBottom: 4,
    color: "#1e293b",
  },
  moduleDescription: {
    fontSize: 10,
    color: "#64748b",
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 50,
    right: 50,
    borderTopWidth: 1,
    borderTopColor: "#e4e4e7",
    paddingTop: 10,
    textAlign: "center",
    color: "#a1a1aa",
    fontSize: 9,
  }
});

export type ProposalData = {
  universityName: string;
  agenda: string[];
  executiveSummary: string;
  problemStatement: string[];
  solutionOverview: string;
  modules: Array<{ name: string; description: string; benefit: string }>;
  preparedFor?: string;
  date: string;
};

export const ProposalDocument = ({ data }: { data: ProposalData }) => (
  <Document>
    <Page size="A4" style={styles.page}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.brandName}>Fretbox</Text>
        <Text style={{ color: "#71717a" }}>Proposal #{Math.floor(Math.random() * 10000)}</Text>
      </View>

      {/* Hero Section */}
      <View style={styles.titleSection}>
        <Text style={styles.title}>Strategic Growth Partnership</Text>
        <Text style={styles.subtitle}>Prepared for {data.universityName}</Text>
        <Text style={{ color: "#71717a", fontSize: 10 }}>Issued on {data.date}</Text>
      </View>

      {/* Executive Summary */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Executive Summary</Text>
        <Text style={styles.paragraph}>{data.executiveSummary}</Text>
      </View>

      {/* Discovery Agenda */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Proposed Discovery Agenda</Text>
        <View style={styles.bulletList}>
          {data.agenda.map((item, i) => (
            <View key={i} style={styles.bulletItem}>
              <Text style={styles.bulletPoint}>•</Text>
              <Text>{item}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Problem Statement */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Identified Challenges</Text>
        <View style={styles.bulletList}>
          {data.problemStatement.map((item, i) => (
            <View key={i} style={styles.bulletItem}>
              <Text style={styles.bulletPoint}>•</Text>
              <Text>{item}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Solutions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recommended Solutions</Text>
        <Text style={styles.paragraph}>{data.solutionOverview}</Text>
        
        {data.modules.map((m, i) => (
          <View key={i} style={styles.moduleCard}>
            <Text style={styles.moduleName}>{m.name}</Text>
            <Text style={styles.moduleDescription}>{m.description}</Text>
            <Text style={{ ...styles.moduleDescription, marginTop: 4, fontStyle: "italic" }}>
              Key Benefit: {m.benefit}
            </Text>
          </View>
        ))}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text>© 2026 Fretbox. Confidential and Proprietary.</Text>
        <Text>www.fretbox.in | support@fretbox.in</Text>
      </View>
    </Page>
  </Document>
);
