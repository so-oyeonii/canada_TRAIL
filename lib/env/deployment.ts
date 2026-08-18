/** "Is this a deployed build" is decided in exactly one place.
 *
 *  `NODE_ENV` alone is not enough: `next build && next start` on a laptop is production too,
 *  and a Vercel preview has a public URL with no auth in front of it. Every environment that
 *  runs on Vercel — production, preview, development — has a value in `VERCEL_ENV`, so the
 *  mere presence of that value closes the door. */
export type DeployEnv = { NODE_ENV?: string; VERCEL?: string; VERCEL_ENV?: string; TRAIL_DEV_LOGIN?: string; TRAIL_DEV_LOGIN_EMAIL?: string };
export const isDeployed = (env: DeployEnv = process.env) => env.NODE_ENV === "production" || Boolean(env.VERCEL_ENV) || env.VERCEL === "1";

/** Three locks on the developer sign-in, all of which have to be open. The fourth — never
 *  shipping the file at all — is `.vercelignore`. */
export function devLoginAllowed(asked: string, env: DeployEnv = process.env) {
  if (isDeployed(env)) return false;                                   // 1. not a deployed build
  if (env.TRAIL_DEV_LOGIN !== "on") return false;                      // 2. switched on deliberately
  const allowed = (env.TRAIL_DEV_LOGIN_EMAIL ?? "").trim().toLowerCase();
  return allowed !== "" && asked.trim().toLowerCase() === allowed;     // 3. that one account, exactly
}
