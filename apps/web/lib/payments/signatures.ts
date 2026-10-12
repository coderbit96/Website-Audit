import { createHmac, timingSafeEqual } from "node:crypto";

function matchesHexSignature(expected: string, received: string): boolean {
  if (!/^[a-f\d]{64}$/i.test(received)) return false;
  return timingSafeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(received, "hex"),
  );
}

export function verifyCheckoutSignature(input: {
  orderId: string;
  paymentId: string;
  signature: string;
  keySecret: string;
}): boolean {
  const expected = createHmac("sha256", input.keySecret)
    .update(`${input.orderId}|${input.paymentId}`)
    .digest("hex");
  return matchesHexSignature(expected, input.signature);
}

export function verifyWebhookSignature(input: {
  rawBody: string;
  signature: string;
  webhookSecret: string;
}): boolean {
  const expected = createHmac("sha256", input.webhookSecret)
    .update(input.rawBody)
    .digest("hex");
  return matchesHexSignature(expected, input.signature);
}

export function capturedPaymentMatchesOrder(
  payment: {
    id: string;
    order_id: string | null;
    amount: number;
    currency: string;
    status: string;
    captured: boolean;
  },
  expected: {
    paymentId: string;
    orderId: string;
    amountPaise: number;
  },
): boolean {
  return (
    payment.id === expected.paymentId &&
    payment.order_id === expected.orderId &&
    payment.amount === expected.amountPaise &&
    payment.currency === "INR" &&
    payment.status === "captured" &&
    payment.captured === true
  );
}
