"use client";

import { FormEvent, useState } from "react";
import { createClient } from "../../lib/supabase/client";
import "./login.css";

type Stage = "idle" | "sending" | "sent" | "error";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [detail, setDetail] = useState("");

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
    <div className="login-brand"><span>T</span><b>TRAIL</b></div>
    <div className="login-intro">
      <p>SHOP LOCAL · TRAVEL LIGHT</p>
      <h1>Your trips,<br />saved and synced.</h1>
      <small>Sign in to keep your plan, purchases and bag transfers on every device.</small>
    </div>

    {stage === "sent" ? (
      <section className="login-sent">
        <i>✦</i>
        <b>Check your inbox</b>
        <small>We sent a sign-in link to {email}. Open it on this device to continue.</small>
        <button className="text-action" onClick={() => { setStage("idle"); setDetail(""); }}>Use a different email</button>
      </section>
    ) : (
      <form className="login-form" onSubmit={submit}>
        <label>
          <small>EMAIL</small>
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" required aria-label="Email address" />
        </label>
        <button className="main-button" type="submit" disabled={!email.trim() || stage === "sending"}>
          <span>{stage === "sending" ? "Sending link…" : "Email me a sign-in link"}<small>No password to remember</small></span><i>→</i>
        </button>
        {stage === "error" && <p className="form-error">{detail}</p>}
      </form>
    )}

    <p className="login-note">Trail stores your trip, purchases and bag transfers so a lost phone does not lose your record. Nothing is shared with the stores you visit.</p>
  </main></div>;
}
