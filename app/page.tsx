import { redirect } from "next/navigation";

/** The nine-screen state machine that used to live here is now the `(app)` route
 *  group. This is the landing rule: today it always resolves to the Trail
 *  dashboard, and it is the single place the signed-out and no-trip branches get
 *  added once the screens read the server. */
export default function Landing() { redirect("/trail"); }
