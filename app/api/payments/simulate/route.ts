import { getTraveler } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

/** Simulated card processing for the delivery fee.
 *
 *  No money moves and no card details are accepted — the traveler picks a stored
 *  method by name only. The shape mirrors a real processor (reserve → authorize →
 *  capture, with a failure code) so swapping in Stripe later touches this file
 *  and nothing else.
 */

const FAILURE_CODES = ["card_declined", "insufficient_funds", "expired_card", "processing_error"] as const;
export type SimulatedFailure = (typeof FAILURE_CODES)[number];

type PaymentPayload = { amountCents?: number; method?: string; outcome?: "succeed" | "fail" };

const MAX_AMOUNT_CENTS = 50_000;

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "bad_origin" }, { status: 403 });
  if (!(await getTraveler())) return Response.json({ error: "unauthenticated" }, { status: 401 });

  let payload: PaymentPayload;
  try {
    payload = (await request.json()) as PaymentPayload;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const amountCents = Math.round(Number(payload.amountCents));
  if (!Number.isFinite(amountCents) || amountCents <= 0 || amountCents > MAX_AMOUNT_CENTS) {
    return Response.json({ error: "amountCents out of range" }, { status: 400 });
  }

  const method = typeof payload.method === "string" ? payload.method.slice(0, 40) : "card";
  // The traveler chooses the outcome from the payment sheet so both branches are
  // reachable while the flow is still a simulation.
  const failed = payload.outcome === "fail";


  const reference = `TRL-PAY-${(amountCents * 7919 + method.length).toString(36).toUpperCase().slice(-6)}`;

  if (failed) {
    const code: SimulatedFailure = FAILURE_CODES[amountCents % FAILURE_CODES.length];
    return Response.json({ status: "failed", failureCode: code, amountCents, method, simulated: true });
  }

  return Response.json({
    status: "captured",
    paymentReference: reference,
    amountCents,
    method,
    capturedAt: new Date().toISOString(),
    simulated: true,
  });
}
