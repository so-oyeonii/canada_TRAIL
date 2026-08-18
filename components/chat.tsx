"use client";

/** The two shapes both conversations are made of: `/ask` and the chip onboarding.
 *
 *  They are shared so a bubble cannot look like an answer in one place and like a note in the
 *  other. Nothing here fetches, and nothing here knows what a `ChatReply` is. */

import type { Chip } from "@/app/ask-chips";
import { IconSpark } from "@/components/icons";

export function Bubble({ role, children }: { role: "ai" | "user"; children: React.ReactNode }) {
  return <div className={`message ${role}`}>{role === "ai" && <i><IconSpark /></i>}<p>{children}</p></div>;
}

export function Typing() {
  return <div className="message ai typing"><i><IconSpark /></i><p><span /><span /><span /></p></div>;
}

/** A tap sends the chip's sentence down the same path as typing it. `aria-disabled` rather than
 *  `disabled` while the model is thinking: a control that vanishes from the tab order mid-turn
 *  moves focus somewhere the traveller did not ask to be. */
export function ChipRow({ chips, onPick, busy, label }: { chips: Chip[]; onPick: (chip: Chip) => void; busy?: boolean; label: string }) {
  if (!chips.length) return null;
  return <div className="chip-row" role="group" aria-label={label}>
    {chips.map((chip) => <button type="button" key={chip.label} className="chip--button" aria-disabled={busy || undefined} onClick={() => { if (!busy) onPick(chip); }}>{chip.label}</button>)}
  </div>;
}
