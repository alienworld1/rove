import assert from "node:assert/strict";
import test from "node:test";
import {
  docsTopics,
  eventDocsPath,
  publicOrigin,
  reasonDocsPath,
} from "./docs-links.ts";

test("public documentation links never include unknown identifiers or operational context", () => {
  assert.equal(
    reasonDocsPath("EVIDENCE_SIGNATURE_INVALID"),
    "/docs/reference/reason-codes#evidence-signature-invalid",
  );
  assert.equal(reasonDocsPath("unknown?lane=private"), docsTopics.reasons);
  assert.equal(reasonDocsPath(null), docsTopics.reasons);
});
test("origins require explicit deployment settings and reject redirect components", () => {
  assert.equal(
    publicOrigin(undefined, "DOCS", "http://localhost:3001", true),
    "http://localhost:3001",
  );
  assert.throws(
    () => publicOrigin(undefined, "DOCS", "http://localhost:3001", false),
    /DOCS/,
  );
  for (const value of [
    "https://user:secret@example.com",
    "https://example.com/docs",
    "https://example.com?q=1",
    "https://example.com#fragment",
    "javascript:alert(1)",
  ]) {
    assert.throws(() =>
      publicOrigin(value, "DOCS", "http://localhost:3001", true),
    );
  }
});

test("known payment events explain the right lifecycle and unknown events use the index", () => {
  assert.equal(eventDocsPath("payment.top_up_requested"), docsTopics.topUps);
  assert.equal(eventDocsPath("payment.channel_closed"), docsTopics.close);
  assert.equal(eventDocsPath("tempo.topup_confirmed"), docsTopics.events);
  assert.equal(eventDocsPath("__proto__"), docsTopics.events);
});
