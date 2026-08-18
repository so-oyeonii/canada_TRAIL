"use client";

import Image from "next/image";
import { FormEvent, useState, useSyncExternalStore } from "react";
import { FALLBACK_LINK_FAILURE, linkFailureMessage } from "../../lib/auth/link-failure";
import { createClient } from "../../lib/supabase/client";
import { IconArrow, IconSpark } from "@/components/icons";
import "./login.css";

type Stage = "idle" | "sending" | "sent" | "error";

/** A failed link comes back as a query param from our own callback, or as a URL
 *  fragment straight from Supabase — which never reaches the server, so it has
 *  to be read here. The diagnostic the link carried is developer information, not
 *  traveler information: it goes to the console, never into our alert box. */
let logged = false;      // getSnapshot runs on every render; the diagnostic is worth saying once
const readLinkFailure = () => {
  const message = linkFailureMessage(window.location.search, window.location.hash);
  if (message === FALLBACK_LINK_FAILURE && !logged) { logged = true; console.debug("[login] unmapped link failure", window.location.hash); }
  return message;
};
const neverChanges = () => () => {};

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [detail, setDetail] = useState("");
  // Read through a store, not an effect: the server render cannot see the URL, and
  // this is the hook that renders its empty snapshot without a hydration mismatch.
  const linkFailure = useSyncExternalStore(neverChanges, readLinkFailure, () => "");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const address = email.trim();
    if (!address || stage === "sending") return;
    setStage("sending");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({ email: address, options: { emailRedirectTo: `${window.location.origin}/auth/callback` } });
      if (error) { setStage("error"); setDetail(error.message); return; }
      setStage("sent");
    } catch {
      setStage("error"); setDetail("Could not reach the sign-in service.");
    }
  };

  return <div className="app-shell"><main className="app-main login-screen">
    <div className="login-brand"><Image src="/logo-mark.png" alt="" width={44} height={44} priority /><b>TRAIL</b></div>
    <div className="login-intro">
      <p>SHOP LOCAL · TRAVEL LIGHT</p>
      <h1>Your trips,<br />saved and synced.</h1>
      <small>Sign in to keep your plan, purchases and bag transfers on every device.</small>
    </div>

    {stage === "sent" ? (
      <section className="login-sent">
        <IconSpark />
        <b>Check your inbox</b>
        <small>We sent a sign-in link to {email}. Open it on this device to continue.</small>
        <button className="text-action" onClick={() => { setStage("idle"); setDetail(""); }}>Use a different email</button>
      </section>
    ) : (
      <form className="login-form" onSubmit={submit}>
        {linkFailure && <p className="form-error" role="alert">{linkFailure}</p>}
        <label>
          <small>EMAIL</small>
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" required aria-label="Email address" />
        </label>
        <button className="main-button" type="submit" disabled={!email.trim() || stage === "sending"}>
          <span>{stage === "sending" ? "Sending link…" : "Email me a sign-in link"}<small>No password to remember</small></span><IconArrow />
        </button>
        {stage === "error" && <p className="form-error">{detail}</p>}
      </form>
    )}

    <p className="login-note">Trail stores your trip, purchases and bag transfers so a lost phone does not lose your record. Nothing is shared with the stores you visit.</p>
  </main></div>;
}
