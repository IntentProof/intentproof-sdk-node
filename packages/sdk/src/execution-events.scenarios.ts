/** Shapes and mocks for `execution-events.test.ts` — vendor-style APIs without network. */

export interface CreateRefundInput {
  paymentIntentId: string;
  amountCents: number;
  reason?: "requested_by_customer" | "duplicate";
}

export interface CreateRefundResult {
  id: string;
  status: "succeeded" | "pending" | "failed";
  amountCents: number;
}

export function mockStripeCreateRefund(input: CreateRefundInput): CreateRefundResult {
  return {
    id: "re_3SAMPLEabcdefghijklmnop",
    status: "succeeded",
    amountCents: input.amountCents,
  };
}

export interface RefundReceiptEmailInput {
  customerId: string;
  orderId: string;
  refundId: string;
  amountCents: number;
}

export function mockSendRefundReceiptEmail(_input: RefundReceiptEmailInput): {
  messageId: string;
  status: "queued";
} {
  return { messageId: "msg_49401_sample", status: "queued" };
}

export interface OpsRefundSlackInput {
  refundId: string;
  orderId: string;
  amountCents: number;
}

export function mockPostRefundToSlack(_input: OpsRefundSlackInput): {
  ok: boolean;
  channel: string;
  ts: string;
} {
  return {
    ok: true,
    channel: "#billing-alerts",
    ts: "1714648800.000100",
  };
}
