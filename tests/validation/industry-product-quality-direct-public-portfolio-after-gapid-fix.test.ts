import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyGapCause,
  classifyProductQuality,
  auditNumbers,
  MODULES,
  SECTIONS,
} from "./industry-product-quality-direct-public-portfolio-after-gapid-fix.ts";

test("TEST-040 freezes the eight-module and sixteen-section contract", () => {
  assert.equal(MODULES.length, 8);
  assert.equal(SECTIONS.length, 16);
});
test("all five final classifications are reachable offline", () => {
  const base = {
    dimensions: [{ status: "USABLE" }],
    unsupportedNumericCount: 0,
  };
  assert.equal(classifyProductQuality(base), "PRODUCT_QUALITY_READY");
  assert.equal(
    classifyProductQuality({
      dimensions: [{ status: "THIN" }],
      unsupportedNumericCount: 0,
    }),
    "FUNCTIONAL_BUT_EVIDENCE_THIN",
  );
  assert.equal(
    classifyProductQuality({
      dimensions: [{ status: "USABLE" }],
      unsupportedNumericCount: 1,
    }),
    "PRODUCT_QUALITY_DEFECT",
  );
  assert.equal(
    classifyProductQuality({ liveInconclusive: true }),
    "PRODUCT_QUALITY_LIVE_INCONCLUSIVE",
  );
  assert.equal(
    classifyProductQuality({
      mandatoryIndustryDefinitionCleared: false,
      validModelSemantics: true,
      evidenceInsufficient: true,
      dimensions: [],
    }),
    "PRODUCT_QUALITY_BLOCKED_BY_EVIDENCE",
  );
});
test("one repaired Research Gap is not a defect", () => {
  assert.notEqual(
    classifyProductQuality({
      dimensions: [{ status: "USABLE" }],
      unsupportedNumericCount: 0,
      modelSemanticNonconformance: false,
    }),
    "PRODUCT_QUALITY_DEFECT",
  );
});
test("repeated live Research Gap invalidity is live inconclusive", () => {
  assert.equal(
    classifyProductQuality({
      dimensions: [],
      modelSemanticNonconformance: true,
    }),
    "PRODUCT_QUALITY_LIVE_INCONCLUSIVE",
  );
});
test("valid semantics plus insufficient qualified evidence blocks by evidence", () => {
  assert.equal(
    classifyProductQuality({
      mandatoryIndustryDefinitionCleared: false,
      validModelSemantics: true,
      evidenceInsufficient: true,
      dimensions: [],
    }),
    "PRODUCT_QUALITY_BLOCKED_BY_EVIDENCE",
  );
});
test("gap causes preserve deterministic precedence", () => {
  assert.equal(
    classifyGapCause({ modelSemanticNonconformance: true, evidenceCount: 1 }),
    "MODEL_SEMANTIC_NONCONFORMANCE",
  );
  assert.equal(
    classifyGapCause({ providerEmpty: true, evidenceCount: 0 }),
    "PROVIDER_EMPTY",
  );
  assert.equal(
    classifyGapCause({ providerFailed: true, evidenceCount: 1 }),
    "PROVIDER_EXTERNAL_FAILURE",
  );
  assert.equal(
    classifyGapCause({
      qualifiedEvidenceForModule: true,
      routedEvidenceCount: 0,
      evidenceCount: 1,
    }),
    "EVIDENCE_ROUTING_GAP",
  );
  assert.equal(
    classifyGapCause({ evidenceCount: 0 }),
    "NO_QUALIFIED_EVIDENCE_FOR_MODULE",
  );
});
test("numeric audit does not count formatting or unavailable numbers as unsupported investment assertions", () => {
  assert.equal(
    auditNumbers("Section 16: growth unavailable.", 0, 0)
      .unsupportedNumericCount,
    0,
  );
  assert.equal(
    auditNumbers("Growth was 12%.", 0, 0).unsupportedNumericCount,
    1,
  );
  assert.equal(
    auditNumbers("Growth was 12%.", 1, 0).unsupportedNumericCount,
    0,
  );
});
