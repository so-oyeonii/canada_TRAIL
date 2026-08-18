import { createClient, getTraveler } from "@/lib/supabase/server";
import { json } from "@/lib/api/http";
import { RECOMMENDATION_SELECT } from "@/lib/state/queries";
import { shapeRecommendation } from "@/lib/state/shape";
import { resolveTripId } from "@/lib/transfers/context";
import type { ProductRow } from "@/lib/state/rows";

/** The catalogue for one city.
 *
 *  **No coordinates go in.** The parameter is a city name; the answer carries each shop's
 *  own `lat`/`lng` and the browser does the subtraction (`lib/discovery/distance.ts`).
 *  A position that never reaches the server is a position there is nothing to store,
 *  nothing to leak and nothing to delete later — the same rule `memory_constraints`
 *  follows by taking consent one row at a time.
 *
 *  With no `city` the server reads the open trip's. A client has no reason to browse an
 *  arbitrary city, and letting it would make this the one route whose answer does not
 *  depend on the session.
 *
 *  Cacheable, and the only route here that is: the catalogue is the same for everybody, so
 *  `private, max-age=300` cannot leak one traveller's answer to another. The service
 *  worker must keep this in its own cache name and never blanket-cache `/api/*` — a cached
 *  `/api/state` is a cached session. */
export const dynamic = "force-dynamic";

const MAX_LIMIT = 24;

export async function GET(request: Request) {
  const traveler = await getTraveler();
  if (!traveler) return json({ error: "unauthenticated" }, 401);

  const params = new URL(request.url).searchParams;
  const asked = (params.get("city") ?? "").slice(0, 80).trim();
  const limitRaw = Number(params.get("limit") ?? "12");
  const limit = Number.isFinite(limitRaw) ? Math.min(MAX_LIMIT, Math.max(1, Math.floor(limitRaw))) : 12;

  const db = await createClient();
  let city = asked;
  if (!city) {
    const tripId = await resolveTripId(db, null);
    const trip = tripId ? await db.from("trips").select("city").eq("id", tripId).maybeSingle() : null;
    city = ((trip?.data as { city: string } | null)?.city ?? "").trim();
  }
  if (!city) return json({ error: "no_city" }, 404);

  const rows = await db.from("products").select(RECOMMENDATION_SELECT).eq("city", city).eq("active", true).order("sort_order", { ascending: true }).limit(limit);
  // A catalogue that is not on this database yet is an empty feed, not a broken screen.
  if (rows.error) {
    if (/(does not exist|could not find)/i.test(rows.error.message)) return json({ city, products: [], catalogue: "unavailable" }, 200);
    return json({ error: "catalogue_unavailable", detail: rows.error.message }, 500);
  }

  const products = ((rows.data ?? []) as unknown as ProductRow[]).map(shapeRecommendation);
  return Response.json({ city, products }, { status: 200, headers: { "Cache-Control": "private, max-age=300" } });
}
