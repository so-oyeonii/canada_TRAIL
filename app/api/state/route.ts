import { createClient, getTraveler } from "@/lib/supabase/server";
import { loadTrailState, StateLoadError } from "@/lib/state/load";

/** Hydration for every screen: one request, no array indices in the answer.
 *
 *  Identity comes from the session cookie via `getTraveler()`. `?tripId=` is the
 *  only parameter, and it still has to belong to the caller — the read goes
 *  through the session client so RLS filters it, not this file. */
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (body: unknown, status: number) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request) {
  const traveler = await getTraveler();
  if (!traveler) return json({ error: "unauthenticated" }, 401);

  const tripId = new URL(request.url).searchParams.get("tripId");
  if (tripId && !UUID.test(tripId)) return json({ error: "bad_trip_id" }, 400);

  try {
    // A traveler with no trips gets 200 and an empty state. A 404 here would read
    // as an error on screen when the honest answer is "nothing planned yet".
    const state = await loadTrailState(await createClient(), traveler.id, { tripId, email: traveler.email ?? "" });
    return json(state, 200);
  } catch (error) {
    const step = error instanceof StateLoadError ? error.step : "unknown";
    console.error("[api/state]", step, error);
    return json({ error: "state_unavailable", step }, 500);
  }
}
