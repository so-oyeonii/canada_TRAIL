"use client";

/** The counter screen. Frame `-11`.
 *
 *  This is the one place in the app where offline is the *expected* state: the
 *  partner counter is in a basement mall and the traveller is standing at it with
 *  three bags. So the pass is issued at payment, cached under its own key, and
 *  rendered from that cache — `POST /pass` is only called when there is nothing
 *  cached or what is cached will not outlast the queue.
 *
 *  Four things this screen refuses to do:
 *  - It does not tell the traveller to read the reference code to staff. There is
 *    no lookup-by-code path in `POST /api/partner/scan`, so that instruction would
 *    be a lie told at the exact moment it cannot be checked.
 *  - It does not render an expired token. The counter would answer 410 and the
 *    traveller would find out from a stranger instead of from us.
 *  - It does not move custody. The button records the traveller's *claim*
 *    (`dropped_off`); collection is the partner's event and the server writes it.
 *  - It does not put the pass in the outbox. Issuing needs the network, so a
 *    queued entry would say "waiting to save" about a pass that does not exist. */

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Header } from "@/components/chrome";
import { IconAlert, IconArrow, IconCheck, IconCloud, IconQr, IconRetry } from "@/components/icons";
import { QrCode } from "@/components/qr";
import { passExpired } from "@/lib/transfers/pass-cache";
import { useTrip } from "../../app-state";
import { clockTime, etaLabel, sourceChip } from "../../view";

const HOW_IT_WORKS = [
  "Show this code at the drop-off counter.",
  "Staff scan it and open your delivery on their terminal.",
  "Each bag gets a Trail seal tag, scanned onto your delivery.",
  "Staff count the bags with you.",                                  // §2: the count is theirs, and it is what the hotel checks against
  "Trail carries the sealed bags and the front desk signs for them.",
];

const PASS_ERROR: Record<string, string> = {
  offline: "Trail could not issue your pass, and there is nothing saved on this phone. The counter can only take bags with a scanned pass — connect once before you go.",
  pass_unavailable: "Trail cannot issue passes right now. The counter can only take bags with a scanned pass; try again in a moment.",
  not_confirmed: "This delivery has not been confirmed yet, so there is no pass to show.",
  transfer_closed: "This delivery is finished. There is nothing to hand over.",
};

export default function DropPage() {
  const router = useRouter();
  const app = useTrip();
  const { trip, transfer, pass, passError, issuePass, reportEvent, deliveryStep, offline, notify } = app;
  const [busy, setBusy] = useState("");
  const [reissued, setReissued] = useState(false);
  const transferId = transfer?.id ?? null;
  const collected = deliveryStep >= 1;
  const closed = transfer ? ["delivered", "cancelled", "failed"].includes(transfer.status) : false;
  const expired = passExpired(pass);
  const paid = transfer?.payment?.status === "captured";

  useEffect(() => { if (!transferId) return; void issuePass(transferId).then((reply) => setReissued(reply.reissued)); }, [transferId, issuePass]);

  /** Standing in a queue with the screen off is the commonest way this fails.
   *  Unsupported browsers and refused permissions are both fine — it is a
   *  convenience, and nothing on this screen depends on it. */
  useEffect(() => {
    const api = (navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock;
    if (!api) return;
    let lock: { release: () => Promise<void> } | null = null, gone = false;
    const take = async () => { try { const next = await api.request("screen"); if (gone) void next.release().catch(() => {}); else lock = next; } catch { /* denied is not an error here */ } };
    const onVisible = () => { if (document.visibilityState === "visible" && !lock) void take(); };
    void take();
    document.addEventListener("visibilitychange", onVisible);
    return () => { gone = true; document.removeEventListener("visibilitychange", onVisible); void lock?.release().catch(() => {}); };
  }, []);

  const retry = async () => { if (!transferId) return; setBusy("pass"); const reply = await issuePass(transferId, true); setBusy(""); setReissued(reply.reissued); };
  const handOver = async () => {
    if (!transfer) return;
    setBusy("claim");
    const reply = await reportEvent(transfer.id, "dropped_off");
    setBusy("");
    notify(reply.ok ? "Drop-off recorded" : "Trail refused that update");
    if (reply.ok) router.push("/bags/track");
  };

  if (!transfer) return <div className="screen"><Header title="Drop your bags" back={() => router.push("/bags/track")} />
    <h1 className="drop-head">No delivery to drop off.</h1>
    <p className="lede">Choose the bags you want carried and pay for the delivery first — the pass is issued when you do.</p>
    <button className="btn btn--primary btn--block" onClick={() => router.push("/bags")}>Set up a delivery<IconArrow /></button>
  </div>;

  return <div className="screen drop-pass-screen">
    <Header title="Drop your bags" subtitle={transfer.dropoffStore?.name ?? "Drop-off counter"} back={() => router.push("/bags/track")} action={sourceChip(transfer.source) ? <span className={`badge badge--${transfer.source}`}>{sourceChip(transfer.source)} TRANSFER</span> : null} />
    <h1 className="visually-hidden">Drop your bags at {transfer.dropoffStore?.name ?? "the counter"}</h1>

    <ul className="drop-chips">
      <li className={paid ? "is-paid" : "is-unpaid"}>{paid ? <IconCheck /> : <IconAlert />}{paid ? "Delivery paid" : "Not paid yet"}</li>
      <li>{transfer.bagCount} {transfer.bagCount === 1 ? "bag" : "bags"}</li>
      <li>{transfer.hotelName || trip.hotelName || "No hotel set"}</li>
      <li>{etaLabel(transfer.etaStart, transfer.etaEnd)}</li>
    </ul>

    {closed || collected ? <section className="notice notice--warn"><IconAlert /><b>{collected && !closed ? "These bags are already with the partner" : "This delivery is closed"}</b><p>{collected && !closed ? "The counter has scanned them onto the run, so the pass is spent. Follow the rest on tracking." : "There is nothing left to hand over."}</p><div className="notice-actions"><button className="btn btn--ghost" onClick={() => router.push("/bags/track")}>Open tracking<IconArrow /></button></div></section>
      : pass && !expired ? <>
        {offline && <section className="notice notice--offline"><IconCloud /><b>Offline · showing the saved pass</b><p>Issued {clockTime(pass.issuedAt)} · valid until {clockTime(pass.expiresAt)}. The counter scans it without a connection.</p></section>}
        {reissued && <section className="notice"><IconQr /><b>This is a new pass</b><p>Any QR you screenshotted earlier no longer works. Show this one.</p></section>}
        <div className="qr-card">
          <header><span className="section-label">DROP-OFF PASS</span><span className="section-label">VALID TO {clockTime(pass.expiresAt)}</span></header>
          <QrCode value={pass.token} label={`Drop-off pass for delivery ${transfer.referenceCode}`} />
          <b>{transfer.referenceCode}</b>
          <small>Staff scan this code. It carries no name, hotel or amount — only this delivery&rsquo;s id.</small>
        </div>
      </> : pass && expired ? <>
        <div className="qr-card is-expired"><header><span className="section-label">DROP-OFF PASS</span><span className="section-label">EXPIRED</span></header><IconQr /><b>{transfer.referenceCode}</b><small>This pass expired at {clockTime(pass.expiresAt)} and the counter would refuse it. Issue a new one before you queue.</small></div>
        <button className="btn btn--primary btn--block" disabled={busy === "pass" || offline} onClick={() => void retry()}>{busy === "pass" ? "Issuing a new pass…" : offline ? "Offline — connect to issue a new pass" : "Issue a new pass"}<IconRetry /></button>
      </> : <>
        <section className="notice notice--danger" role="alert"><IconAlert /><b>No pass on this phone</b><p>{PASS_ERROR[passError] ?? PASS_ERROR.pass_unavailable}</p><div className="notice-actions"><button className="btn btn--ghost" disabled={busy === "pass"} onClick={() => void retry()}>{busy === "pass" ? "Trying…" : "Try again"}<IconRetry /></button></div></section>
      </>}

    <section className="howto"><h2 className="section-title">How it works</h2><ol>{HOW_IT_WORKS.map((step) => <li key={step}>{step}</li>)}</ol></section>

    <div className="ownership-note">Trail carries bags you already paid the store for. Handing them over is a claim you make here; the counter&rsquo;s scan is what actually moves custody.</div>
    <button className="btn btn--primary btn--block" disabled={Boolean(busy) || closed || collected} onClick={() => void handOver()}>{busy === "claim" ? "Recording…" : "I handed the bags over"}<IconArrow /></button>
  </div>;
}
