/** The 18 unicode glyphs the prototype drew icons with, as inline SVG.
 *
 *  `❄ ◇ ▣ ⌂ ✦ ⌁ ◎ ⌖` were read aloud by screen readers as "snowflake", "white
 *  diamond", "black square" — the chilled/fragile handling labels were literally
 *  announced as shapes. Every icon here is decorative and hidden; the meaning is
 *  in the text beside it. Sizing is `1em` so the existing `font-size` rules on
 *  the `<i>` chips keep working unchanged. */

type IconProps = { className?: string };
const line = { width: "1em", height: "1em", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, focusable: "false" as const };
const solid = { width: "1em", height: "1em", viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": true, focusable: "false" as const };

export function IconSpark(p: IconProps) { return <svg {...solid} {...p}><path d="M12 2 14.1 8.6 20.5 11 14.1 13.4 12 20 9.9 13.4 3.5 11 9.9 8.6Z" /></svg>; }
export function IconRoute(p: IconProps) { return <svg {...line} {...p}><circle cx="5.5" cy="5.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /><path d="M8 5.5h6a4 4 0 0 1 0 8h-4a4 4 0 0 0 0 8h6" /></svg>; }
export function IconBag(p: IconProps) { return <svg {...line} {...p}><path d="M5 8h14l-1 12H6Z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></svg>; }
export function IconHome(p: IconProps) { return <svg {...line} {...p}><path d="M4 10.5 12 4l8 6.5V20H4Z" /><path d="M10 20v-5h4v5" /></svg>; }
export function IconTrips(p: IconProps) { return <svg {...line} {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5c2.5 2.4 3.8 5.3 3.8 8.5s-1.3 6.1-3.8 8.5c-2.5-2.4-3.8-5.3-3.8-8.5S9.5 5.9 12 3.5Z" /><path d="M3.5 12h17" /></svg>; }
export function IconShop(p: IconProps) { return <svg {...line} {...p}><path d="M4 9h16l-1.2 11H5.2Z" /><path d="M4 9 6 4h12l2 5" /><path d="M9.5 13h5" /></svg>; }
export function IconAsk(p: IconProps) { return <svg {...line} {...p}><path d="M4 5h16v11H9l-5 4Z" /><path d="M9 10.5h6" /></svg>; }
export function IconChilled(p: IconProps) { return <svg {...line} {...p}><path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5 4.2 16.5" /><path d="M12 6.6 9.8 4.6M12 6.6l2.2-2M12 17.4l-2.2 2M12 17.4l2.2 2" /></svg>; }
export function IconFragile(p: IconProps) { return <svg {...line} {...p}><path d="M12 3.2 20.8 12 12 20.8 3.2 12Z" /><path d="M12 8v4.5" /><path d="M12 15.6h.01" /></svg>; }
export function IconCheck(p: IconProps) { return <svg {...line} {...p} strokeWidth={2.4}><path d="M4.5 12.5 9.5 17.5 19.5 6.5" /></svg>; }
export function IconClose(p: IconProps) { return <svg {...line} {...p} strokeWidth={2.2}><path d="M6 6l12 12M18 6 6 18" /></svg>; }
export function IconBack(p: IconProps) { return <svg {...line} {...p}><path d="M19 12H5" /><path d="M11 6 5 12l6 6" /></svg>; }
export function IconArrow(p: IconProps) { return <svg {...line} {...p}><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></svg>; }
export function IconSend(p: IconProps) { return <svg {...line} {...p}><path d="M12 19V5" /><path d="M6 11l6-6 6 6" /></svg>; }
export function IconPlus(p: IconProps) { return <svg {...line} {...p} strokeWidth={2.2}><path d="M12 5v14M5 12h14" /></svg>; }
export function IconChevronRight(p: IconProps) { return <svg {...line} {...p}><path d="M9 5l7 7-7 7" /></svg>; }
export function IconChevronDown(p: IconProps) { return <svg {...line} {...p}><path d="M5 9l7 7 7-7" /></svg>; }
export function IconChevronUp(p: IconProps) { return <svg {...line} {...p}><path d="M5 15l7-7 7 7" /></svg>; }
export function IconRetry(p: IconProps) { return <svg {...line} {...p}><path d="M20 5v5h-5" /><path d="M19.5 10a8 8 0 1 0-1.1 6.3" /></svg>; }
export function IconPin(p: IconProps) { return <svg {...line} {...p}><path d="M12 21s6.5-6 6.5-10.5a6.5 6.5 0 1 0-13 0C5.5 15 12 21 12 21Z" /><circle cx="12" cy="10.5" r="2.4" /></svg>; }
export function IconAlert(p: IconProps) { return <svg {...line} {...p}><path d="M12 4.5 21 19.5H3Z" /><path d="M12 10v4" /><path d="M12 17h.01" /></svg>; }
export function IconHotel(p: IconProps) { return <svg {...line} {...p}><path d="M4 20V5h16v15" /><path d="M3 20h18" /><path d="M8 9h3M13 9h3M8 13h3M13 13h3" /><path d="M10 20v-3.5h4V20" /></svg>; }
export function IconPeople(p: IconProps) { return <svg {...line} {...p}><circle cx="9" cy="8.5" r="3.2" /><path d="M3.5 19.5c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6" /><path d="M16 5.6a3.2 3.2 0 0 1 0 5.8" /><path d="M17.4 15.4c1.7.6 2.8 2 3.1 4.1" /></svg>; }
export function IconEdit(p: IconProps) { return <svg {...line} {...p}><path d="M4 20h4L19 9l-4-4L4 16Z" /><path d="M14.5 5.5 18.5 9.5" /></svg>; }
export function IconClock(p: IconProps) { return <svg {...line} {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5.4l3.4 2" /></svg>; }
export function IconCloud(p: IconProps) { return <svg {...line} {...p}><path d="M7 18.5a4 4 0 0 1-.4-8A5.5 5.5 0 0 1 17.3 10a3.9 3.9 0 0 1 .5 8.5Z" /></svg>; }
