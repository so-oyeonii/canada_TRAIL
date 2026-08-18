"use client";

/** The last boundary. It replaces the root layout, so it renders its own `<html>` and
 *  `<body>` — nothing above it survives to provide them.
 *
 *  Everything here is deliberately dependency-free: no stylesheet import, no icon module,
 *  no `view.ts`, no provider. Any of those could be what failed, and a boundary that
 *  imports its own cause renders nothing at all. That is why the colours are inline
 *  literals rather than the tokens the rest of the app uses.
 *
 *  Only reachable in a production build; the dev overlay takes this in `next dev`. */

const main: React.CSSProperties = { margin: 0, minHeight: "100dvh", display: "flex", flexDirection: "column", justifyContent: "center", gap: 12, padding: "24px max(16px, env(safe-area-inset-left)) 24px max(16px, env(safe-area-inset-right))", background: "#08121f", color: "#ede9e3", font: "400 16px/1.5 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" };
const title: React.CSSProperties = { margin: 0, fontSize: 24, lineHeight: 1.2, fontWeight: 700 };
const body: React.CSSProperties = { margin: 0, color: "#879fb4" };
const button: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center", width: "100%", minHeight: 44, padding: "8px 16px", border: "1px solid transparent", borderRadius: 10, background: "#e9a222", color: "#08121f", font: "inherit", fontWeight: 700, cursor: "pointer" };
const ghost: React.CSSProperties = { ...button, background: "transparent", borderColor: "#647b91", color: "#ede9e3", textDecoration: "none" };
const note: React.CSSProperties = { margin: 0, fontSize: 13, color: "#879fb4" };

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <html lang="en"><body style={{ margin: 0, background: "#08121f" }}>
    <main role="alert" style={main}>
      <h1 style={title}>Trail could not start.</h1>
      <p style={body}>The app failed before any screen loaded. Your trip, your purchases and anything waiting to save are still on this phone &mdash; none of it lives in this screen.</p>
      <button type="button" style={button} onClick={reset}>Reload Trail</button>
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- the router tree is gone with the root layout, and next/link is a dependency this file must not have. */}
      <a style={ghost} href="/">Open Trail from the start</a>
      {error.digest && <p style={note}>Error reference {error.digest}</p>}
    </main>
  </body></html>;
}
