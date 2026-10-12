"use client";

import { useRouter } from "next/navigation";
import Script from "next/script";
import { useRef, useState } from "react";
import type { PlanTier } from "@website-audit/shared";

type CheckoutResult = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

type CheckoutOptions = {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  prefill: { name: string; email: string };
  handler: (result: CheckoutResult) => void;
  modal: { ondismiss: () => void };
};

declare global {
  interface Window {
    Razorpay?: new (options: CheckoutOptions) => {
      open: () => void;
      on: (event: string, callback: () => void) => void;
    };
  }
}

export function RazorpayCheckoutButton({
  planTier,
  planName,
  accountName,
  accountEmail,
  renewing,
}: {
  planTier: Exclude<PlanTier, "FREE">;
  planName: string;
  accountName: string;
  accountEmail: string;
  renewing: boolean;
}) {
  const router = useRouter();
  const [scriptReady, setScriptReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const confirming = useRef(false);

  async function pay() {
    if (!window.Razorpay || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/payments/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planTier }),
      });
      const result = (await response.json()) as {
        data?: {
          keyId: string;
          orderId: string;
          amountPaise: number;
          currency: string;
        };
        error?: string;
      };
      if (!response.ok || !result.data) {
        setMessage(
          result.error ?? "Checkout could not start. Please try again.",
        );
        setBusy(false);
        return;
      }
      const order = result.data;
      const checkout = new window.Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amountPaise,
        currency: order.currency,
        name: "SiteSignal",
        description: `${planName} · one month, no auto-renewal`,
        prefill: { name: accountName, email: accountEmail },
        handler: (paid) => {
          confirming.current = true;
          void (async () => {
            try {
              const confirmation = await fetch("/api/payments/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  orderId: paid.razorpay_order_id,
                  paymentId: paid.razorpay_payment_id,
                  signature: paid.razorpay_signature,
                }),
              });
              const outcome = (await confirmation.json()) as {
                data?: { periodEnd: string };
                error?: string;
              };
              if (!confirmation.ok || !outcome.data) {
                setMessage(
                  outcome.error ??
                    "Payment is being confirmed. Check your plan shortly; do not pay again yet.",
                );
                return;
              }
              setMessage(
                "Payment captured and plan activated. Your account is updating.",
              );
              router.refresh();
            } catch {
              setMessage(
                "Payment confirmation is pending. Check your plan shortly; do not pay again yet.",
              );
            } finally {
              confirming.current = false;
              setBusy(false);
            }
          })();
        },
        modal: {
          ondismiss: () => {
            if (!confirming.current) setBusy(false);
          },
        },
      });
      checkout.on("payment.failed", () => {
        setMessage("Payment did not complete. No plan change was made.");
        setBusy(false);
      });
      checkout.open();
    } catch {
      setMessage("Checkout is temporarily unavailable. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="mt-5">
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        strategy="afterInteractive"
        onLoad={() => setScriptReady(true)}
        onError={() =>
          setMessage("Secure checkout could not load. Please try again.")
        }
      />
      <button
        type="button"
        disabled={!scriptReady || busy}
        onClick={() => void pay()}
        className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-cyan-300 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy
          ? "Opening secure checkout…"
          : renewing
            ? "Extend plan for one month"
            : "Buy one month with Razorpay"}
      </button>
      {message ? (
        <p className="mt-2 text-xs leading-5 text-slate-200" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
