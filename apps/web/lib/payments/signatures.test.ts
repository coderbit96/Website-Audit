import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import {
  capturedPaymentMatchesOrder,
  verifyCheckoutSignature,
  verifyWebhookSignature,
} from "./signatures.js";

test("checkout signatures require the stored order and matching payment", () => {
  const keySecret = "test-secret-never-used-in-production";
  const signature = createHmac("sha256", keySecret)
    .update("order_abc|pay_xyz")
    .digest("hex");
  assert.equal(
    verifyCheckoutSignature({
      orderId: "order_abc",
      paymentId: "pay_xyz",
      signature,
      keySecret,
    }),
    true,
  );
  assert.equal(
    verifyCheckoutSignature({
      orderId: "order_other",
      paymentId: "pay_xyz",
      signature,
      keySecret,
    }),
    false,
  );
  assert.equal(
    verifyCheckoutSignature({
      orderId: "order_abc",
      paymentId: "pay_xyz",
      signature: "invalid",
      keySecret,
    }),
    false,
  );
});

test("webhook signatures cover the exact raw request body", () => {
  const webhookSecret = "another-test-secret";
  const rawBody = '{"event":"payment.captured"}';
  const signature = createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("hex");
  assert.equal(
    verifyWebhookSignature({ rawBody, signature, webhookSecret }),
    true,
  );
  assert.equal(
    verifyWebhookSignature({
      rawBody: `${rawBody} `,
      signature,
      webhookSecret,
    }),
    false,
  );
});

test("only the exact captured INR payment can activate a priced order", () => {
  const payment = {
    id: "pay_xyz",
    order_id: "order_abc",
    amount: 99_900,
    currency: "INR",
    status: "captured",
    captured: true,
  };
  const expected = {
    paymentId: "pay_xyz",
    orderId: "order_abc",
    amountPaise: 99_900,
  };
  assert.equal(capturedPaymentMatchesOrder(payment, expected), true);
  assert.equal(
    capturedPaymentMatchesOrder({ ...payment, amount: 999 }, expected),
    false,
  );
  assert.equal(
    capturedPaymentMatchesOrder({ ...payment, status: "authorized" }, expected),
    false,
  );
  assert.equal(
    capturedPaymentMatchesOrder(
      { ...payment, order_id: "order_other" },
      expected,
    ),
    false,
  );
});
