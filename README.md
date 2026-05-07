## **Logs narrate; IntentProof gives you proof.**

[![CI](https://github.com/IntentProof/intentproof-sdk-node/actions/workflows/ci.yml/badge.svg)](https://github.com/IntentProof/intentproof-sdk-node/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@intentproof/sdk)](https://www.npmjs.com/package/@intentproof/sdk)
<a href="https://github.com/IntentProof/intentproof-sdk-node/raw/main/conformance-certificate.json" target="_blank" rel="noopener noreferrer"><img src="https://img.shields.io/badge/conformance_certificate-view-0366d6" alt="Conformance Certificate" /></a>

**IntentProof** is **auditable execution records** for actions that must be defensible—**intent** tied to what actually ran.

**Wrap** the calls that matter; each invocation emits one **verifiable** **`ExecutionEvent`**, structured so intent and outcome can be **reconciled** with reality—not only observed.

Observability captures what happened. **IntentProof** tells you whether it matched what was **meant to happen**.

Every **`ExecutionEvent`** contains:

- **`intent`**: what this invocation was meant to prove
- **`action`**: the stable operation id for this step
- **`status`**: success or error
- **`inputs`** and **`output`**: what the runtime saw going in and coming out

## Why this matters

Modern systems—especially AI agents—do not only compute; they act:
issuing refunds, sending emails, updating databases.

When something goes wrong, logs tell you what ran.
They don't tell you:

- what was supposed to happen
- whether all steps completed
- whether systems ended up in a consistent state

**IntentProof** exists to bridge that gap.

It records intent alongside execution so systems can be verified, not just observed.

### Picture this:

It's 4:47 on a Friday. A customer insists the critical action never happened. Support sees scattered traces; engineering sees green checks; finance asks for **one** clean chain: what was **supposed** to occur, what **did** occur, and whether the outcome is **complete**.

Ordinary telemetry shows that *something ran*. It rarely ships an **auditable story** you can hand to someone who doesn't read your codebase. **IntentProof** exists for when the question stops being "what was logged?" and starts being **"prove it."**

## Requirements

- **Node.js** 22 or newer

## Install

**Package:** `@intentproof/sdk`.

Replace **`x.y.z`** with the package version you intend to pin.

```bash
npm install @intentproof/sdk@x.y.z
```

## Quick start

```ts
import { client } from "@intentproof/sdk";

const refund = client.wrap(
  { intent: "Initiate refund", action: "stripe.refunds.create" },
  async (input) => stripe.refunds.create(input),
);
```

Each refund call emits one **`ExecutionEvent`** with the **`intent`** and **`action`** you chose, the **`inputs`** and **`output`** (or **`error`** + **`status: "error"`**), and timing fields—an execution record you can inspect, export, or verify later.

## Reference

Detailed tables for the client API, emitted events, configuration, and related exports.

### `IntentProofClient` API

| Member | Description |
| ------ | ----------- |
| **`constructor(config?)`** | Creates a client. Default exporters: a single **`MemoryExporter`** if you omit **`config.exporters`**. |
| **`configure(config)`** | Re-applies **`IntentProofConfig`** fields (exporters, error hook, defaults, stack policy). |
| **`wrap(options, fn)`** | Returns a function that records one **`ExecutionEvent`** per call (sync or async). **`options`** must satisfy **`assertWrapOptionsShape`** (`intent` / `action` non-empty strings, etc.). |
| **`flush()`** | Awaits **`flush()`** on every **`Exporter`** that implements it, in parallel. |
| **`shutdown()`** | For each **`Exporter`**, awaits **`shutdown()`** if implemented, otherwise **`flush()`** if implemented. |
| **`getCorrelationId()`** | Returns the correlation ID from **`AsyncLocalStorage`**, if any. |
| **`withCorrelation(fn)`** | Runs **`fn`** with a **fresh UUID** as correlation ID for nested wraps. |
| **`withCorrelation(id, fn)`** | Runs **`fn`** with **`id`** trimmed; blank / whitespace-only **`id`** falls back to a UUID. |

#### Module-level helpers (same module as the client)

These use the same async correlation store as **`IntentProofClient`** instances:

| Export | Description |
| ------ | ----------- |
| **`createIntentProofClient(config?)`** | New isolated client (tests, workers, multi-tenant). |
| **`getIntentProofClient()`** | Lazy singleton used by **`client`**. |
| **`client`** | Default singleton instance. |
| **`getCorrelationId()`** | Same behavior as the instance method. |
| **`runWithCorrelationId(id, fn)`** | Requires a **non-empty** correlation ID after trim; throws if invalid. |
| **`assertCorrelationId(id)`** | Runtime assertion for correlation ID shape. |
| **`assertWrapOptionsShape(options)`** | Runtime validation for **`WrapOptions`**. |

### `ExecutionEvent` fields

| Field | Description |
| ----- | ----------- |
| **`id`** | Unique event id (UUID). |
| **`correlationId`** | Request or trace correlation ID when present—usually from context or **`WrapOptions`**. |
| **`intent`** | Human-readable label for what this invocation is meant to prove (outcome, policy goal, or domain). |
| **`action`** | Stable operation id for this step (often dotted or namespaced). |
| **`inputs`** | JSON-safe snapshot of call arguments (default) or **`captureInput`** result. |
| **`output`** | JSON-safe return value or **`captureOutput`** result on success. When **`status`** is **`"error"`**, set only if **`captureError`** returned a value. |
| **`error`** | On failure: **`name`**, **`message`**, and optional **`stack`** (see **`includeErrorStack`**). |
| **`status`** | **`"ok"`** if the wrapped call completed normally; **`"error"`** if it threw. |
| **`startedAt`** | Start time (ISO 8601). |
| **`completedAt`** | Completion time (ISO 8601). |
| **`durationMs`** | Wall time between start and completion, in milliseconds. |
| **`attributes`** | Optional plain record (string / number / boolean values only), merged from client defaults and wrap options. |

### `WrapOptions` and `IntentProofConfig`

#### `WrapOptions` (passed to **`wrap`**)

| Field | Description |
| ----- | ----------- |
| **`intent`**, **`action`** | Required, non-empty after trim. |
| **`correlationId`** | Optional; when set, non-empty after trim. Otherwise the active correlation ID from context is used, if any. |
| **`attributes`** | Per-invocation dimensions merged over **`defaultAttributes`**. |
| **`captureInput`**, **`captureOutput`**, **`captureError`** | Optional hooks to replace default **`snapshot`** behavior for inputs, success output, or error-side extra **`output`**. |
| **`includeErrorStack`** | When `false`, omit **`error.stack`** for this wrap (overrides client default). |
| **`maxDepth`**, **`maxKeys`**, **`redactKeys`**, **`maxStringLength`** | Forwarded to **`snapshot`** for inputs and outputs (see **`SerializeOptions`** in types). |

#### `IntentProofConfig` (constructor / **`configure`**)

| Field | Description |
| ----- | ----------- |
| **`exporters`** | Ordered list of **`Exporter`** instances; each receives every **`ExecutionEvent`**. |
| **`onExporterError`** | Called when any exporter’s **`export()`** throws or returns a rejected promise. Defaults to **`console.error`**. |
| **`defaultAttributes`** | Merged into every event’s **`attributes`** (wrap-specific attributes win on key collision). |
| **`includeErrorStack`** | Default `true`; set `false` in production if stacks must not leave the trust zone. |

### Related exports

- **`MemoryExporter`**, **`HttpExporter`**, **`BoundedQueueExporter`** — Delivery implementations; each implements **`Exporter`**.
- **`snapshot`** — Same JSON-safe serializer the client uses internally, if you build custom tooling.
- **`VERSION`** — Package version string injected at build time.

---

## Examples

### 1 — Refund and customer receipt

Support approves **order `ORD-1042`**. Your service creates the **Stripe refund**, then emails the customer a receipt. **`runWithCorrelationId`** ties both calls to **`req_refund_ord_1042`**. Each **`wrap`** defines its own **`intent`** (the outcome you are proving for that step) and **`action`** (how it is done); **`correlationId`** is what stitches them together.

**`captureInput`** / **`captureOutput`** trim each record to the fields you want in proof (refund id, amounts, message id)—not full vendor payloads.

JSON on the wire uses **camelCase**; TypeScript **`WrapOptions`** use the same camelCase names (e.g. **`captureInput`**).

```ts
const createRefund = client.wrap(
  {
    intent: "Return captured funds to the customer's original card network",
    action: "stripe.refund.create",
    attributes: { vendor: "stripe", step: "refund_money" },
    captureInput: (args) => {
      const [input] = args as [
        {
          paymentIntentId: string;
          amountCents: number;
          reason?: "requested_by_customer" | "duplicate";
        },
      ];
      return {
        paymentIntentId: input.paymentIntentId,
        amountCents: input.amountCents,
        reason: input.reason,
      };
    },
    captureOutput: (result) => {
      const r = result as {
        id: string;
        status: "succeeded";
        amountCents: number;
      };
      return {
        refundId: r.id,
        status: r.status,
        amountCents: r.amountCents,
      };
    },
  },
  (input: {
    paymentIntentId: string;
    amountCents: number;
    reason?: "requested_by_customer" | "duplicate";
  }) => ({
    id: "re_3SAMPLEabcdefghijklmnop",
    status: "succeeded" as const,
    amountCents: input.amountCents,
  }),
);

const sendRefundReceipt = client.wrap(
  {
    intent: "Deliver a customer-visible refund confirmation for the ledger entry",
    action: "email.customer.refund_receipt",
    attributes: { channel: "email", step: "notify_customer" },
    captureInput: (args) => {
      const [p] = args as [
        {
          customerId: string;
          orderId: string;
          refundId: string;
          amountCents: number;
        },
      ];
      return {
        customerId: p.customerId,
        orderId: p.orderId,
        refundId: p.refundId,
        amountCents: p.amountCents,
      };
    },
    captureOutput: (result) => {
      const r = result as { messageId: string; status: "queued" };
      return { messageId: r.messageId, status: r.status };
    },
  },
  (p: {
    customerId: string;
    orderId: string;
    refundId: string;
    amountCents: number;
  }) => ({ messageId: "msg_49401_sample", status: "queued" as const }),
);

await runWithCorrelationId("req_refund_ord_1042", async () => {
  const refund = createRefund({
    paymentIntentId: "pi_3SAMPLEabcdefghijklmnop",
    amountCents: 4999,
    reason: "requested_by_customer",
  });
  await Promise.resolve(
    sendRefundReceipt({
      customerId: "cus_SAMPLEabcdefghijkl",
      orderId: "ORD-1042",
      refundId: refund.id,
      amountCents: refund.amountCents,
    }),
  );
});
```

Emitted **`ExecutionEvent`** values (same **`correlationId`** on each; distinct **`intent`** per step; **`id`** / timestamps omitted):

```json
[
  {
    "correlationId": "req_refund_ord_1042",
    "intent": "Return captured funds to the customer's original card network",
    "action": "stripe.refund.create",
    "inputs": {
      "paymentIntentId": "pi_3SAMPLEabcdefghijklmnop",
      "amountCents": 4999,
      "reason": "requested_by_customer"
    },
    "status": "ok",
    "output": {
      "refundId": "re_3SAMPLEabcdefghijklmnop",
      "status": "succeeded",
      "amountCents": 4999
    },
    "attributes": {
      "service": "billing-api",
      "env": "test",
      "vendor": "stripe",
      "step": "refund_money"
    }
  },
  {
    "correlationId": "req_refund_ord_1042",
    "intent": "Deliver a customer-visible refund confirmation for the ledger entry",
    "action": "email.customer.refund_receipt",
    "inputs": {
      "customerId": "cus_SAMPLEabcdefghijkl",
      "orderId": "ORD-1042",
      "refundId": "re_3SAMPLEabcdefghijklmnop",
      "amountCents": 4999
    },
    "status": "ok",
    "output": { "messageId": "msg_49401_sample", "status": "queued" },
    "attributes": {
      "service": "billing-api",
      "env": "test",
      "channel": "email",
      "step": "notify_customer"
    }
  }
]
```

### 2 — Payment failure with operator metadata (`captureError`)

When a capture **throws**, the record still carries **`status: "error"`** and **`error.message`** for proof of failure. **`captureError`** adds a small, JSON-safe **`output`** for dashboards (e.g. decline code) without pretending the business call succeeded.

```ts
const capturePayment = client.wrap(
  {
    intent: "Capture authorized funds",
    action: "stripe.payment_intent.capture",
    captureInput: (args) => {
      const [{ paymentIntentId }] = args as [{ paymentIntentId: string }];
      return { paymentIntentId };
    },
    captureError: () => ({ code: "card_declined", retryable: false }),
  },
  async (_input: { paymentIntentId: string }) => {
    throw new Error("Your card was declined.");
  },
);

try {
  await capturePayment({ paymentIntentId: "pi_3SAMPLEabcdefghijklmnop" });
} catch {
  /* card declined — expected */
}
```

```json
{
  "intent": "Capture authorized funds",
  "action": "stripe.payment_intent.capture",
  "inputs": { "paymentIntentId": "pi_3SAMPLEabcdefghijklmnop" },
  "status": "error",
  "error": {
    "name": "Error",
    "message": "Your card was declined."
  },
  "output": { "code": "card_declined", "retryable": false }
}
```

### 3 — Proof delivery over HTTP (same **`ExecutionEvent`** shape)

**`HttpExporter`** POSTs the same **`ExecutionEvent`** your verifiers see in memory—here alongside **`MemoryExporter`** so tests can assert the wire without a real collector. The request omits ambient credentials; the body is **`{ "intentproof": "1", "event": … }`** (see exporter implementation). For authenticated collectors, pass **`headers`** (e.g. **`Authorization`**, API keys) — see the Security section above.

```ts
const runProbe = client.wrap({ intent: "HTTP test", action: "test.http" }, () => 42);
runProbe();
```

```json
{
  "intent": "HTTP test",
  "action": "test.http",
  "inputs": [],
  "status": "ok",
  "output": 42
}
```

---

## Security

For **vulnerability reporting**, use this repository’s Security tab (private advisories).

Every **`ExecutionEvent`** you emit is data you may ship off-process. Treat them like audit-grade execution records: they can include PII, secrets, stack traces, and business identifiers depending on your **`snapshot`** / **`capture*`** hooks.

- **Minimize payload:** Use **`redactKeys`**, **`maxDepth`** / **`maxKeys`** / **`maxStringLength`**, and narrow **`captureInput`** / **`captureOutput`** / **`captureError`** so proof records contain only what verifiers need.
- **Stacks:** Set **`includeErrorStack: false`** on the client (or per wrap) when traces must not leave your trust zone.
- **HTTP ingest:** Keep collector **`url`** and any redirect behavior under **trusted configuration** (avoid SSRF if URLs were ever influenced by untrusted input). Prefer **HTTPS** and **short-lived credentials** end-to-end.
- **`HttpExporter` auth:** Pass credentials in **`headers`** (for example **`Authorization: Bearer …`**, **`x-api-key`**, or whatever your collector expects). The SDK does **not** log header values; use short-lived tokens and scope them to ingest only.
- **Runtime surface:** This package targets **Node**; if you wrap code in a browser, treat the ingest endpoint and headers as you would any cross-origin credential (CORS, CSP, token storage policies are your app’s responsibility).
- **Delivery semantics:** Exporter failures invoke **`onExporterError`** and do **not** roll back the wrapped function’s side effects—design compensating controls if you need strict “delivered exactly once” guarantees.

Custom **`body`** serializers: if **`body(event)`** throws, **`HttpExporter`** notifies **`onError`** and falls back to the same **JSON envelope** path as the default serializer (full event, then a partial envelope, then a minimal `eventSerializeFailed` payload) so **`export()`** still completes and **`fetch`** runs when possible.

---

## Canonical specification (`intentproof-spec`)

**Shared pins and terminology** (`INTENTPROOF_SPEC_ROOT`, **`intentproofSpecCommit`**, script names) are documented in the **`intentproof-spec`** repository (`CONTRIBUTING.md`, Terminology).

Schemas, golden oracles, and the **Vitest conformance oracle** live in the **`intentproof-spec`** repository.

- **Version pin:** **`intentproofSpecVersion`** and **`intentproofSpecCommit`** in the root **`package.json`** and **`packages/sdk/package.json`** match **`spec.json`** and the spec **`HEAD`** checkout; **`scripts/check-sdk-spec-pin.sh`** enforces this before conformance.

- **CI:** every push/PR checks out this SDK plus **`intentproof-spec`** and runs **`scripts/spec-conformance.sh`** (pin check + full oracle; see `.github/workflows/ci.yml`). The **`sdk`** job sets **`INTENTPROOF_SPEC_ROOT`** so **`packages/sdk`** Vitest also imports the spec **`sdk_test_harness`**—golden **`execution_event_cases.jsonl`** oracle plus a **`MemoryExporter`** **`validateExecutionEvent`** smoke (`spec_conformance.integration.test.ts`).
- **Conformance certificate and report:** CI uploads workflow artifacts for each run and, on trusted pushes to the default branch, commits **`conformance-certificate.json`** and **`conformance-report.json`** at this repository root so they stay inspectable on every revision (including before and after spec adoption bumps).
- **Local:** clone `intentproof-spec` **next to** this repository (`../intentproof-spec`), then:

  ```bash
  npm run spec:conformance
  ```

  Or set `INTENTPROOF_SPEC_ROOT` to your spec checkout and run `bash scripts/spec-conformance.sh`.

- **Generated fingerprint metadata:** schema codegen writes **`packages/sdk/src/generated/spec_fingerprint.json`** (spec version, generator version, per-schema SHA-256, aggregate hash). Validate/update generated artifacts with:

  ```bash
  bash scripts/verify-generated-types.sh
  ```

- **No handwritten model types:** **`scripts/check-no-handwritten-model-types.sh`** delegates to the shared **`intentproof-spec`** checker. It is wired into **`npm run ci`**, CI, and release, and fails if schema model/type declarations appear outside **`packages/sdk/src/generated`** or if the bridge aliases in **`packages/sdk/src/types.ts`** stop mapping to generated types.

---

## Project development

Contributing and shared **`intentproof-spec`** terminology: see **`CONTRIBUTING.md`**.

Layout: **npm workspace** (`package.json` **`workspaces`**, publishable package **`packages/sdk`**). Requires **Node.js** 22 or newer (see `.nvmrc` and workspace **`engines`**). Release history: **`CHANGELOG.md`**.

```bash
npm ci
npm run ci
```

## License

Apache-2.0 (see **`LICENSE`** at the repository root).