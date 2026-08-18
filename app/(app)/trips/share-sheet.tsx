"use client";

/** `Share` — the owner's side of a read-only link.
 *
 *  The label is `Share` and not the wireframe's `+ Invite`, and that is a privacy control
 *  rather than a wording preference (FIGMA_ADOPTION §5). `Invite` makes people believe
 *  they are sending something to one named person, so they treat the URL as if it were
 *  addressed. `Share` sets the expectation that it spreads, which is the truth about a URL
 *  anybody can forward. Phase 2 adds real membership, and `+ Invite` comes back inside
 *  this sheet meaning what it says.
 *
 *  Three things this sheet refuses to be vague about:
 *
 *  1. **The link is shown once.** Trail stores sha256 of the token and never the token, so
 *     there is no screen that can show it again. The sheet says so beside the URL instead
 *     of letting someone find out by coming back.
 *  2. **The gift meant for the reader is in the list.** Spoiling a surprise is not our
 *     responsibility; letting it happen without a word is.
 *  3. **`41 opens` is on the row.** Sending a link to three people and watching it open
 *     forty times is the only warning a traveller gets that it left the group it was
 *     meant for.
 *
 *  Changing what a link shows is revoke-then-create. There is no edit, because editing in
 *  place would silently widen a URL that is already in somebody else's chat history. */

import { useCallback, useEffect, useRef, useState } from "react";
import { Toggle } from "@/components/chrome";
import { IconClose, IconSend } from "@/components/icons";
import { DEFAULT_SHARE_SCOPE, SHARE_LINK_LIMIT, SHARE_SCOPE_KEYS, SHARE_SCOPE_LABEL, SHARE_SCOPE_NOTE, type ShareScope, type TripShare } from "@/lib/share/scope";
import "./share-sheet.css";

const PROBLEM: Record<string, string> = {
  too_many_links: `You already have ${SHARE_LINK_LIMIT} links open on this trip. Switch one off first.`,
  trip_ended: "This trip is over, so a link would expire before anyone could open it.",
  share_unavailable: "Sharing is not switched on for this build yet. Nothing was created.",
  trip_not_found: "Trail could not find this trip on your account.",
  unauthenticated: "Sign in again to share this trip.",
};
const problemOf = (error: unknown) => PROBLEM[String(error)] ?? "Trail could not create the link. Nothing was shared.";

/** The owner's screen may say when a link dies; the guest's page may not. The expiry is
 *  derived from the trip's end date, so printing it on the shared page would hand over the
 *  dates that the `Trip dates` switch is there to withhold. */
function expiresIn(iso: string) {
  const ms = Date.parse(iso) - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return "Expired";
  const hours = Math.floor(ms / 3600_000);
  if (hours >= 24) return `Expires in ${Math.floor(hours / 24)} day${hours >= 48 ? "s" : ""}`;
  return hours >= 1 ? `Expires in ${hours} hour${hours === 1 ? "" : "s"}` : "Expires within the hour";
}

export function useShareSheet(trip: { id: string; city: string }) {
  const [isOpen, setOpen] = useState(false);
  const chipRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => { setOpen(false); chipRef.current?.focus(); }, []);
  const chip = <button ref={chipRef} type="button" className="chip-share" aria-haspopup="dialog" aria-expanded={isOpen} onClick={() => setOpen(true)}><IconSend /><span>Share</span></button>;
  return { chip, sheet: isOpen ? <ShareSheet trip={trip} onClose={close} /> : null };
}

function ShareSheet({ trip, onClose }: { trip: { id: string; city: string }; onClose: () => void }) {
  const dialog = useRef<HTMLDivElement>(null);
  const [links, setLinks] = useState<TripShare[] | null>(null);
  const [scope, setScope] = useState<ShareScope>(DEFAULT_SHARE_SCOPE);
  const [label, setLabel] = useState("");
  const [fresh, setFresh] = useState<{ id: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  useEffect(() => {
    dialog.current?.querySelector<HTMLElement>("button")?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let live = true;
    void (async () => {
      const reply = await fetch(`/api/trips/${trip.id}/share`).catch(() => null);
      const data = reply ? await reply.json().catch(() => ({})) : {};
      if (!live) return;
      if (!reply?.ok) { setProblem(problemOf(data.error)); setLinks([]); return; }
      setLinks(data.shares ?? []);
    })();
    return () => { live = false; };
  }, [trip.id]);

  const create = async () => {
    setBusy(true); setProblem(""); setCopied(false);
    const reply = await fetch(`/api/trips/${trip.id}/share`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope, label }) }).catch(() => null);
    const data = reply ? await reply.json().catch(() => ({})) : {};
    setBusy(false);
    if (!reply?.ok) { setProblem(problemOf(data.error)); return; }
    setFresh({ id: data.share.id, url: data.url });
    setLinks((current) => [data.share, ...(current ?? [])]);
    setLabel("");
  };

  const revoke = async (id: string) => {
    setBusy(true); setProblem("");
    const reply = await fetch(`/api/trips/${trip.id}/share/${id}`, { method: "DELETE" }).catch(() => null);
    setBusy(false);
    if (!reply?.ok) { setProblem("Trail could not switch that link off. It is still working."); return; }
    setLinks((current) => (current ?? []).filter((link) => link.id !== id));
    if (fresh?.id === id) setFresh(null);
  };

  const copy = async () => {
    if (!fresh) return;
    try { await navigator.clipboard.writeText(fresh.url); setCopied(true); }
    catch { setCopied(false); setProblem("Copying is blocked in this browser — select the link above and copy it by hand."); }
  };

  return <div className="sheet-scrim" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="trip-sheet share-sheet" role="dialog" aria-modal="true" aria-label={`Share ${trip.city}`} ref={dialog}>
      <header><b>Share this trip</b><button type="button" className="round-button" onClick={onClose} aria-label="Close sharing"><IconClose /></button></header>
      <p className="share-sheet-lead">View-only. People with the link can read the list — they can&rsquo;t change anything.</p>

      <fieldset className="share-sheet-scope">
        <legend>What the link shows</legend>
        {SHARE_SCOPE_KEYS.map((key) => <div key={key}>
          <span><b>{SHARE_SCOPE_LABEL[key]}</b><small>{SHARE_SCOPE_NOTE[key]}</small></span>
          <Toggle on={scope[key]} onChange={(on) => setScope((current) => ({ ...current, [key]: on }))} label={SHARE_SCOPE_LABEL[key]} />
        </div>)}
      </fieldset>

      <label className="share-sheet-name"><span>Name this link (optional)</span><input value={label} onChange={(event) => setLabel(event.target.value.slice(0, 40))} placeholder="Family" /></label>

      <p className="share-sheet-warn">Anyone with this link sees the whole gift list, including the gift meant for them.</p>
      {problem && <p className="form-error" role="alert">{problem}</p>}

      <button type="button" className="share-sheet-make" disabled={busy} onClick={create}>{busy ? "Creating…" : "Create a link"}</button>

      {fresh && <div className="share-sheet-fresh">
        <input readOnly value={fresh.url} aria-label="Your share link" onFocus={(event) => event.currentTarget.select()} />
        <button type="button" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
        <small>Copy it now — Trail keeps only a fingerprint of this link and can never show it again.</small>
      </div>}

      <div className="share-sheet-live">
        <p>Links you have open</p>
        {links === null
          ? <small>Checking&hellip;</small>
          : links.length
            ? <ul>{links.map((link) => <li key={link.id}>
                <span><b>{link.label || "Untitled link"}</b><small>{expiresIn(link.expiresAt)} · {link.viewCount} open{link.viewCount === 1 ? "" : "s"}</small></span>
                <button type="button" disabled={busy} onClick={() => revoke(link.id)}>Revoke</button>
              </li>)}</ul>
            : <small>None. Nothing about this trip is readable outside your account.</small>}
      </div>
    </div>
  </div>;
}
