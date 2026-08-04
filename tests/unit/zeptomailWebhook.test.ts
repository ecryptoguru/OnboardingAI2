"use node";

import { describe, it } from "node:test";
import assert from "node:assert";

interface WebhookMessage {
  email_info?: {
    email_reference?: string;
    client_reference?: string;
  };
  request_id?: string;
  [key: string]: unknown;
}

interface WebhookPayload {
  event_name?: string[];
  event_message?: WebhookMessage[];
  [key: string]: unknown;
}

/**
 * Mirror of the signature extraction regex from convex/http.ts
 * ZeptoMail producer-signature format: ts=...;s=...;s-algorithm=HmacSHA256
 */
function extractSignature(header: string): string {
  const sigMatch = header.match(/(?:^|;)s=([^;]+)/);
  return sigMatch ? decodeURIComponent(sigMatch[1]) : "";
}

/**
 * Mirror of email_reference → request_id conversion from convex/emails.ts
 * email_reference: "xxx.m1.UUID@domain" → request_id: "xxx.t1.UUID"
 */
function emailRefToRequestId(emailRef: string): string {
  return emailRef.replace(/\.m1\./, ".t1.").replace(/@[^@]+$/, "");
}

/**
 * Mirror of event name → status mapping from convex/http.ts
 */
function eventToStatus(eventName: string): string | null {
  if (eventName === "email_open") return "opened";
  if (eventName === "email_link_click") return "clicked";
  if (eventName === "email_delivered" || eventName === "delivered") return "delivered";
  if (eventName === "hardbounce" || eventName === "softbounce") return "bounced";
  return null;
}

/**
 * Mirror of ISO timestamp → Unix ms conversion from convex/http.ts
 */
function parseEventTime(timeStr: string | undefined): number | undefined {
  if (!timeStr) return undefined;
  return new Date(timeStr).getTime();
}

describe("ZeptoMail Webhook - Signature Extraction", () => {
  it("should extract s= parameter from ts=...;s=... format", () => {
    const header = "ts=1596109465823;s=dN0yVozgabP5NPlxMDfP1r5u65bVO9kTGEZMIQlqI2o%3D;s-algorithm=HmacSHA256";
    const sig = extractSignature(header);
    assert.strictEqual(sig, "dN0yVozgabP5NPlxMDfP1r5u65bVO9kTGEZMIQlqI2o=");
  });

  it("should NOT match s= inside ts=", () => {
    const header = "ts=1596109465823;s=abc123;s-algorithm=HmacSHA256";
    const sig = extractSignature(header);
    assert.strictEqual(sig, "abc123");
    assert.notStrictEqual(sig, "1596109465823");
  });

  it("should handle URL-encoded signature", () => {
    const header = "ts=123;s=abc%2Bdef%3D;s-algorithm=HmacSHA256";
    const sig = extractSignature(header);
    assert.strictEqual(sig, "abc+def=");
  });

  it("should return empty string when no s= parameter", () => {
    const header = "ts=123;s-algorithm=HmacSHA256";
    const sig = extractSignature(header);
    assert.strictEqual(sig, "");
  });

  it("should handle empty header", () => {
    const sig = extractSignature("");
    assert.strictEqual(sig, "");
  });

  it("should handle s= at start of string (no ts= prefix)", () => {
    const header = "s=abc123";
    const sig = extractSignature(header);
    assert.strictEqual(sig, "abc123");
  });
});

describe("ZeptoMail Webhook - Event Name Mapping", () => {
  it("should map email_open to opened", () => {
    assert.strictEqual(eventToStatus("email_open"), "opened");
  });

  it("should map email_link_click to clicked", () => {
    assert.strictEqual(eventToStatus("email_link_click"), "clicked");
  });

  it("should map email_delivered to delivered", () => {
    assert.strictEqual(eventToStatus("email_delivered"), "delivered");
  });

  it("should map delivered to delivered", () => {
    assert.strictEqual(eventToStatus("delivered"), "delivered");
  });

  it("should map hardbounce to bounced", () => {
    assert.strictEqual(eventToStatus("hardbounce"), "bounced");
  });

  it("should map softbounce to bounced", () => {
    assert.strictEqual(eventToStatus("softbounce"), "bounced");
  });

  it("should return null for unknown event", () => {
    assert.strictEqual(eventToStatus("unknown_event"), null);
  });

  it("should return null for empty string", () => {
    assert.strictEqual(eventToStatus(""), null);
  });

  it("should NOT map old incorrect event names", () => {
    assert.strictEqual(eventToStatus("open"), null);
    assert.strictEqual(eventToStatus("click"), null);
    assert.strictEqual(eventToStatus("hard_bounce"), null);
    assert.strictEqual(eventToStatus("soft_bounce"), null);
  });
});

describe("ZeptoMail Webhook - email_reference to request_id Conversion", () => {
  it("should convert .m1. to .t1. and strip @domain", () => {
    const emailRef = "ea36f19a.737a00c139129ee5.m1.464e7de0-ecbc-11ee-90a5-525400256d50.18e835544be@zylkertech.in";
    const requestId = emailRefToRequestId(emailRef);
    assert.ok(requestId.includes(".t1."), "should contain .t1.");
    assert.ok(!requestId.includes(".m1."), "should not contain .m1.");
    assert.ok(!requestId.includes("@"), "should not contain @");
  });

  it("should be idempotent for already-converted request_id", () => {
    const requestId = "ea36f19a.737a00c139129ee5.t1.464e7de0-ecbc-11ee-90a5-525400256d50.18e835544be";
    const result = emailRefToRequestId(requestId);
    assert.strictEqual(result, requestId);
  });

  it("should handle email_reference without @domain", () => {
    const emailRef = "abc.m1.uuid123";
    const result = emailRefToRequestId(emailRef);
    assert.strictEqual(result, "abc.t1.uuid123");
  });

  it("should handle string with no .m1. (no-op)", () => {
    const input = "some-random-id";
    const result = emailRefToRequestId(input);
    assert.strictEqual(result, input);
  });

  it("should handle empty string", () => {
    const result = emailRefToRequestId("");
    assert.strictEqual(result, "");
  });
});

describe("ZeptoMail Webhook - Timestamp Parsing", () => {
  it("should parse ISO 8601 timestamp to Unix ms", () => {
    const ts = parseEventTime("2024-10-29T09:26:21Z");
    assert.strictEqual(ts, 1730193981000);
  });

  it("should parse ISO with timezone offset", () => {
    const ts = parseEventTime("2024-10-29T14:56:21+05:30");
    assert.strictEqual(ts, 1730193981000);
  });

  it("should return undefined for undefined input", () => {
    assert.strictEqual(parseEventTime(undefined), undefined);
  });

  it("should return NaN for invalid date string", () => {
    const ts = parseEventTime("not-a-date");
    assert.ok(Number.isNaN(ts), "should be NaN");
  });
});

describe("ZeptoMail Webhook - Payload Structure", () => {
  it("should parse single-object payload (not array)", () => {
    const rawBody = JSON.stringify({
      event_name: ["email_open"],
      event_message: [{
        email_info: {
          email_reference: "test-ref",
          client_reference: "test-client-ref",
        },
        event_data: [{
          details: [{ time: "2024-10-29T09:26:21Z" }],
          object: "email_open",
        }],
        request_id: "test-req",
      }],
    });

    const payload = JSON.parse(rawBody) as WebhookPayload;
    assert.ok(!Array.isArray(payload), "payload should be a single object, not array");
    assert.ok(Array.isArray(payload.event_name), "event_name should be an array");
    assert.ok(Array.isArray(payload.event_message), "event_message should be an array");
    assert.strictEqual(payload.event_name?.[0], "email_open");
    assert.strictEqual(payload.event_message?.[0].email_info?.email_reference, "test-ref");
    assert.strictEqual(payload.event_message?.[0].email_info?.client_reference, "test-client-ref");
  });

  it("should handle multiple events in a single payload", () => {
    const payload = {
      event_name: ["email_open", "email_link_click"],
      event_message: [
        { email_info: { email_reference: "ref1" }, event_data: [{ details: [{ time: "2024-10-29T09:00:00Z" }] }] },
        { email_info: { email_reference: "ref2" }, event_data: [{ details: [{ time: "2024-10-29T09:05:00Z" }] }] },
      ],
    } as WebhookPayload;

    assert.strictEqual(payload.event_name?.length, 2);
    assert.strictEqual(payload.event_message?.length, 2);
    assert.strictEqual(payload.event_name?.[0], "email_open");
    assert.strictEqual(payload.event_name?.[1], "email_link_click");
  });

  it("should handle empty event arrays", () => {
    const payload = { event_name: [], event_message: [] } as WebhookPayload;
    assert.strictEqual(payload.event_name?.length, 0);
    assert.strictEqual(payload.event_message?.length, 0);
  });

  it("should handle missing event_name gracefully", () => {
    const payload = { event_message: [{ email_info: { email_reference: "ref1" } }] } as WebhookPayload;
    const eventNames = payload.event_name ?? [];
    assert.strictEqual(eventNames.length, 0);
  });

  it("should handle missing event_message gracefully", () => {
    const payload = { event_name: ["email_open"] } as WebhookPayload;
    const messages = payload.event_message ?? [];
    assert.strictEqual(messages.length, 0);
  });
});

describe("ZeptoMail Webhook - Message ID Correlation", () => {
  it("should prefer email_reference over request_id", () => {
    const msg = {
      email_info: { email_reference: "email-ref-123" },
      request_id: "req-123",
    } as WebhookMessage;
    const messageId = msg.email_info?.email_reference || msg.request_id;
    assert.strictEqual(messageId, "email-ref-123");
  });

  it("should fall back to request_id when email_reference missing", () => {
    const msg = {
      email_info: {},
      request_id: "req-123",
    } as WebhookMessage;
    const messageId = msg.email_info?.email_reference || msg.request_id;
    assert.strictEqual(messageId, "req-123");
  });

  it("should use client_reference when both email_reference and request_id missing", () => {
    const msg = {
      email_info: { client_reference: "client-ref-123" },
    } as WebhookMessage;
    const messageId = msg.email_info?.email_reference || msg.request_id;
    const clientRef = msg.email_info?.client_reference;
    assert.ok(!messageId, "email_reference and request_id should be absent");
    assert.strictEqual(clientRef, "client-ref-123");
  });

  it("should skip event when no correlation ID present", () => {
    const msg = {
      email_info: {},
    } as WebhookMessage;
    const messageId = msg.email_info?.email_reference || msg.request_id;
    const clientRef = msg.email_info?.client_reference;
    assert.ok(!messageId && !clientRef, "should have no correlation ID");
  });
});
