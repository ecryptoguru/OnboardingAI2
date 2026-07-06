/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as actions_autoReply from "../actions/autoReply.js";
import type * as actions_deepEnrichment from "../actions/deepEnrichment.js";
import type * as actions_discovery from "../actions/discovery.js";
import type * as actions_email from "../actions/email.js";
import type * as actions_enrichGovernmentData from "../actions/enrichGovernmentData.js";
import type * as actions_enrichment from "../actions/enrichment.js";
import type * as actions_inferContacts from "../actions/inferContacts.js";
import type * as actions_ingest from "../actions/ingest.js";
import type * as actions_listUniversities from "../actions/listUniversities.js";
import type * as actions_liveTest from "../actions/liveTest.js";
import type * as actions_migrateEmbeddings from "../actions/migrateEmbeddings.js";
import type * as actions_orchestrator from "../actions/orchestrator.js";
import type * as actions_outreach from "../actions/outreach.js";
import type * as actions_personalize from "../actions/personalize.js";
import type * as actions_proposals from "../actions/proposals.js";
import type * as actions_realWorldVerify from "../actions/realWorldVerify.js";
import type * as actions_replyClassifier from "../actions/replyClassifier.js";
import type * as actions_scoring from "../actions/scoring.js";
import type * as actions_scrapeAntiRagging from "../actions/scrapeAntiRagging.js";
import type * as actions_scraper from "../actions/scraper.js";
import type * as actions_ugcSeed from "../actions/ugcSeed.js";
import type * as actions_ugcSync from "../actions/ugcSync.js";
import type * as admin from "../admin.js";
import type * as auth from "../auth.js";
import type * as crons from "../crons.js";
import type * as dbReset from "../dbReset.js";
import type * as dispatcher from "../dispatcher.js";
import type * as emails from "../emails.js";
import type * as http from "../http.js";
import type * as lib_async from "../lib/async.js";
import type * as lib_auth_utils from "../lib/auth_utils.js";
import type * as lib_cadence from "../lib/cadence.js";
import type * as lib_contactInference from "../lib/contactInference.js";
import type * as lib_discoveryCandidates from "../lib/discoveryCandidates.js";
import type * as lib_emailTemplates from "../lib/emailTemplates.js";
import type * as lib_googleCalendar from "../lib/googleCalendar.js";
import type * as lib_llm from "../lib/llm.js";
import type * as lib_models from "../lib/models.js";
import type * as lib_moduleRecommender from "../lib/moduleRecommender.js";
import type * as lib_phone from "../lib/phone.js";
import type * as lib_prompts from "../lib/prompts.js";
import type * as lib_proposalPdf from "../lib/proposalPdf.js";
import type * as lib_scoring from "../lib/scoring.js";
import type * as lib_scrapers from "../lib/scrapers.js";
import type * as lib_serperBudget from "../lib/serperBudget.js";
import type * as lib_stakeholderQuality from "../lib/stakeholderQuality.js";
import type * as lib_universityUtils from "../lib/universityUtils.js";
import type * as lib_utils from "../lib/utils.js";
import type * as llmBudget from "../llmBudget.js";
import type * as priorityScores from "../priorityScores.js";
import type * as proposals from "../proposals.js";
import type * as rateLimits from "../rateLimits.js";
import type * as removeDuplicates from "../removeDuplicates.js";
import type * as replies from "../replies.js";
import type * as sequences from "../sequences.js";
import type * as settings from "../settings.js";
import type * as signals from "../signals.js";
import type * as stakeholders from "../stakeholders.js";
import type * as test from "../test.js";
import type * as universities from "../universities.js";
import type * as users from "../users.js";
import type * as wipeAllData from "../wipeAllData.js";
import type * as wipeEnrichment from "../wipeEnrichment.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "actions/autoReply": typeof actions_autoReply;
  "actions/deepEnrichment": typeof actions_deepEnrichment;
  "actions/discovery": typeof actions_discovery;
  "actions/email": typeof actions_email;
  "actions/enrichGovernmentData": typeof actions_enrichGovernmentData;
  "actions/enrichment": typeof actions_enrichment;
  "actions/inferContacts": typeof actions_inferContacts;
  "actions/ingest": typeof actions_ingest;
  "actions/listUniversities": typeof actions_listUniversities;
  "actions/liveTest": typeof actions_liveTest;
  "actions/migrateEmbeddings": typeof actions_migrateEmbeddings;
  "actions/orchestrator": typeof actions_orchestrator;
  "actions/outreach": typeof actions_outreach;
  "actions/personalize": typeof actions_personalize;
  "actions/proposals": typeof actions_proposals;
  "actions/realWorldVerify": typeof actions_realWorldVerify;
  "actions/replyClassifier": typeof actions_replyClassifier;
  "actions/scoring": typeof actions_scoring;
  "actions/scrapeAntiRagging": typeof actions_scrapeAntiRagging;
  "actions/scraper": typeof actions_scraper;
  "actions/ugcSeed": typeof actions_ugcSeed;
  "actions/ugcSync": typeof actions_ugcSync;
  admin: typeof admin;
  auth: typeof auth;
  crons: typeof crons;
  dbReset: typeof dbReset;
  dispatcher: typeof dispatcher;
  emails: typeof emails;
  http: typeof http;
  "lib/async": typeof lib_async;
  "lib/auth_utils": typeof lib_auth_utils;
  "lib/cadence": typeof lib_cadence;
  "lib/contactInference": typeof lib_contactInference;
  "lib/discoveryCandidates": typeof lib_discoveryCandidates;
  "lib/emailTemplates": typeof lib_emailTemplates;
  "lib/googleCalendar": typeof lib_googleCalendar;
  "lib/llm": typeof lib_llm;
  "lib/models": typeof lib_models;
  "lib/moduleRecommender": typeof lib_moduleRecommender;
  "lib/phone": typeof lib_phone;
  "lib/prompts": typeof lib_prompts;
  "lib/proposalPdf": typeof lib_proposalPdf;
  "lib/scoring": typeof lib_scoring;
  "lib/scrapers": typeof lib_scrapers;
  "lib/serperBudget": typeof lib_serperBudget;
  "lib/stakeholderQuality": typeof lib_stakeholderQuality;
  "lib/universityUtils": typeof lib_universityUtils;
  "lib/utils": typeof lib_utils;
  llmBudget: typeof llmBudget;
  priorityScores: typeof priorityScores;
  proposals: typeof proposals;
  rateLimits: typeof rateLimits;
  removeDuplicates: typeof removeDuplicates;
  replies: typeof replies;
  sequences: typeof sequences;
  settings: typeof settings;
  signals: typeof signals;
  stakeholders: typeof stakeholders;
  test: typeof test;
  universities: typeof universities;
  users: typeof users;
  wipeAllData: typeof wipeAllData;
  wipeEnrichment: typeof wipeEnrichment;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
