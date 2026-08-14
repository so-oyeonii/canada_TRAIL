"use client";

/** `Brand`, `Header` and `Toggle` moved out of `app/page.tsx` unchanged apart from
 *  the icons. `Toggle` already carried `role="switch"` + `aria-checked`; it is
 *  copied character for character so the routes inherit no new behaviour. */

import { IconBack } from "./icons";

export function Brand() { return <div className="brand"><span>T</span><b>TRAIL</b></div>; }
export function Header({ title, back, action }: { title?: string; back?: () => void; action?: React.ReactNode }) { return <header className="app-header">{back ? <button className="round-button" onClick={back} aria-label="Go back"><IconBack /></button> : <Brand />}{title && <b className="header-title">{title}</b>}<div className="header-action">{action}</div></header>; }
export function Toggle({ on, onChange, label }: { on: boolean; onChange: (value: boolean) => void; label: string }) { return <button className={on ? "toggle on" : "toggle"} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}><i /></button>; }
