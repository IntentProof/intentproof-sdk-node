/** Correlated multi-step flows — shape of events a verifier would ingest. */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HttpExporter,
  MemoryExporter,
  createIntentProofClient,
  runWithCorrelationId,
} from "./index.js";
import { createExporterErrorSink } from "./exporters.test-helpers.js";
import {
  mockPostRefundToSlack,
  mockSendRefundReceiptEmail,
  mockStripeCreateRefund,
  type CreateRefundInput,
  type OpsRefundSlackInput,
  type RefundReceiptEmailInput,
} from "./execution-events.scenarios.js";

describe("execution-events: correlated refund saga", () => {
  const memory = new MemoryExporter();
  const exporterSink = createExporterErrorSink();
  const v = createIntentProofClient({
    exporters: [memory],
    defaultAttributes: { service: "billing-api", env: "test" },
    onExporterError: exporterSink.onExporterError,
  });

  afterEach(() => {
    memory.clear();
    exporterSink.assertEmpty();
  });

  it("records refund → customer email → ops slack under one correlation id", async () => {
    const createRefund = v.wrap(
      {
        intent: "Return captured funds to the customer's original card network",
        action: "stripe.refund.create",
        attributes: { vendor: "stripe", step: "refund_money" },
        captureInput: (args) => {
          const [input] = args as [CreateRefundInput];
          return {
            paymentIntentId: input.paymentIntentId,
            amountCents: input.amountCents,
            reason: input.reason,
          };
        },
        captureOutput: (result) => {
          const r = result as ReturnType<typeof mockStripeCreateRefund>;
          return {
            refundId: r.id,
            status: r.status,
            amountCents: r.amountCents,
          };
        },
      },
      (input: CreateRefundInput) => mockStripeCreateRefund(input),
    );

    const sendRefundReceipt = v.wrap(
      {
        intent: "Deliver a customer-visible refund confirmation for the ledger entry",
        action: "email.customer.refund_receipt",
        attributes: { channel: "email", step: "notify_customer" },
        captureInput: (args) => {
          const [p] = args as [RefundReceiptEmailInput];
          return {
            customerId: p.customerId,
            orderId: p.orderId,
            refundId: p.refundId,
            amountCents: p.amountCents,
          };
        },
        captureOutput: (result) => {
          const r = result as ReturnType<typeof mockSendRefundReceiptEmail>;
          return { messageId: r.messageId, status: r.status };
        },
      },
      (p: RefundReceiptEmailInput) => mockSendRefundReceiptEmail(p),
    );

    const notifyOpsRefund = v.wrap(
      {
        intent: "Surface the completed refund to billing operations for review",
        action: "slack.operations.refund_posted",
        attributes: { channel: "slack", step: "notify_ops" },
        captureInput: (args) => {
          const [p] = args as [OpsRefundSlackInput];
          return {
            refundId: p.refundId,
            orderId: p.orderId,
            amountCents: p.amountCents,
          };
        },
        captureOutput: (result) => {
          const r = result as ReturnType<typeof mockPostRefundToSlack>;
          return { ok: r.ok, channel: r.channel, ts: r.ts };
        },
      },
      (p: OpsRefundSlackInput) => mockPostRefundToSlack(p),
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
      await Promise.resolve(
        notifyOpsRefund({
          refundId: refund.id,
          orderId: "ORD-1042",
          amountCents: refund.amountCents,
        }),
      );
    });

    const events = memory.getEvents();
    expect(events).toHaveLength(3);

    const [e1, e2, e3] = events;
    expect(e1!.correlationId).toBe("req_refund_ord_1042");
    expect(e2!.correlationId).toBe("req_refund_ord_1042");
    expect(e3!.correlationId).toBe("req_refund_ord_1042");

    expect(e1!.intent).toBe(
      "Return captured funds to the customer's original card network",
    );
    expect(e2!.intent).toBe(
      "Deliver a customer-visible refund confirmation for the ledger entry",
    );
    expect(e3!.intent).toBe(
      "Surface the completed refund to billing operations for review",
    );

    expect(e1!.action).toBe("stripe.refund.create");
    expect(e1!.status).toBe("ok");
    expect(e1!.inputs).toEqual({
      paymentIntentId: "pi_3SAMPLEabcdefghijklmnop",
      amountCents: 4999,
      reason: "requested_by_customer",
    });
    expect(e1!.output).toEqual({
      refundId: "re_3SAMPLEabcdefghijklmnop",
      status: "succeeded",
      amountCents: 4999,
    });
    expect(e1!.attributes).toMatchObject({
      service: "billing-api",
      env: "test",
      vendor: "stripe",
      step: "refund_money",
    });

    expect(e2!.action).toBe("email.customer.refund_receipt");
    expect(e2!.inputs).toEqual({
      customerId: "cus_SAMPLEabcdefghijkl",
      orderId: "ORD-1042",
      refundId: "re_3SAMPLEabcdefghijklmnop",
      amountCents: 4999,
    });
    expect(e2!.output).toEqual({
      messageId: "msg_49401_sample",
      status: "queued",
    });
    expect(e2!.attributes).toMatchObject({
      channel: "email",
      step: "notify_customer",
    });

    expect(e3!.action).toBe("slack.operations.refund_posted");
    expect(e3!.inputs).toEqual({
      refundId: "re_3SAMPLEabcdefghijklmnop",
      orderId: "ORD-1042",
      amountCents: 4999,
    });
    expect(e3!.output).toEqual({
      ok: true,
      channel: "#billing-alerts",
      ts: "1714648800.000100",
    });
    expect(e3!.attributes).toMatchObject({
      channel: "slack",
      step: "notify_ops",
    });
  });
});

describe("execution-events: error path with operator metadata", () => {
  it("records captureError output alongside the thrown error", async () => {
    const memory = new MemoryExporter();
    const sink = createExporterErrorSink();
    const v = createIntentProofClient({
      exporters: [memory],
      onExporterError: sink.onExporterError,
    });

    const capturePayment = v.wrap(
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

    await expect(
      capturePayment({ paymentIntentId: "pi_3SAMPLEabcdefghijklmnop" }),
    ).rejects.toThrow("declined");

    const e = memory.getEvents()[0]!;
    expect(e.status).toBe("error");
    expect(e.error?.message).toBe("Your card was declined.");
    expect(e.output).toEqual({ code: "card_declined", retryable: false });
    sink.assertEmpty();
  });
});

describe("execution-events: HttpExporter envelope", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs JSON with credentials omitted", async () => {
    const calls: RequestInit[] = [];
    const fetchMock = vi.fn(
      async (_url: string, init: RequestInit): Promise<Response> => {
        calls.push(init);
        return new Response("ok", { status: 200 });
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const memory = new MemoryExporter();
    const http = new HttpExporter({
      url: "https://collector.example/v1/events",
      awaitEach: true,
    });
    const sink = createExporterErrorSink();
    const v = createIntentProofClient({
      exporters: [memory, http],
      onExporterError: sink.onExporterError,
    });

    v.wrap({ intent: "HTTP test", action: "test.http" }, () => 42)();

    expect(fetchMock).toHaveBeenCalledOnce();
    const init = calls[0]!;
    expect(init.credentials).toBe("omit");
    expect(init.method).toBe("POST");
    const body = JSON.parse(String(init.body)) as { event: { action: string } };
    expect(body.event.action).toBe("test.http");

    sink.assertEmpty();
  });
});
