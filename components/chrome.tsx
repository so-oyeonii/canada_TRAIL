"use client";

/** `Brand`, `Header` and `Toggle` moved out of `app/page.tsx` unchanged apart from
 *  the icons. `Toggle` already carried `role="switch"` + `aria-checked`; it is
 *  copied character for character so the routes inherit no new behaviour. */

import Image from "next/image";
import Link from "next/link";
import { IconBack } from "./icons";

/** The pin is drawn with a transparent sky, so it sits on the paper and on the
 *  navy tracking screen without a second asset. `alt` is empty on purpose: the
 *  wordmark beside it already carries the name. */
export function Brand() { return <div className="brand"><Image src="/logo-mark.png" alt="" width={32} height={32} /><b>TRAIL</b></div>; }
/** `subtitle` is the second line G5 asked for (`Tracking ID`, `Day 2 of 5`). It is mono
 *  and muted, so the hierarchy is weight and colour rather than a smaller size — the
 *  scale bottoms out at 11px on purpose. */
export function Header({ title, subtitle, back, action }: { title?: string; subtitle?: string; back?: () => void; action?: React.ReactNode }) { return <header className="app-header">{back ? <button className="round-button" onClick={back} aria-label="Go back"><IconBack /></button> : <Brand />}{title && (subtitle ? <span className="header-titles"><b className="header-title">{title}</b><small className="header-subtitle">{subtitle}</small></span> : <b className="header-title">{title}</b>)}<div className="header-action">{action}</div></header>; }
/** Top-right on every frame from -2 onward. It goes to the account, not to Trips —
 *  Trips is a tab now, and an avatar that opened a tab was the header disagreeing
 *  with the tab bar about where the traveler already is. */
export function Avatar({ city }: { city: string }) { return <Link className="avatar" href="/account/memory" aria-label="Open account">{(city.trim()[0] ?? "T").toUpperCase()}</Link>; }
export function Toggle({ on, onChange, label }: { on: boolean; onChange: (value: boolean) => void; label: string }) { return <button className={on ? "toggle on" : "toggle"} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}><i /></button>; }
