/** The wireframe's `🇨🇦 Toronto ▾` uses an emoji flag. Windows Chrome has no colour
 *  glyph for regional-indicator pairs, so it renders as the letters "CA" — and a screen
 *  reader announces "Canada" where the design meant nothing at all. These are 3:2 inline
 *  SVGs, `aria-hidden`, and the city name beside them carries the meaning. Only the six
 *  countries the seed data can produce are drawn; anything else gets a neutral tile. */

type FlagProps = { className?: string };
const box = { viewBox: "0 0 30 20", width: "1.5em", height: "1em", "aria-hidden": true, focusable: "false" as const, role: "presentation" as const };

const CA = (p: FlagProps) => <svg {...box} {...p}><rect width="30" height="20" fill="#fff" /><rect width="7.5" height="20" fill="#d52b1e" /><rect x="22.5" width="7.5" height="20" fill="#d52b1e" /><path d="M15 5.2l1.1 2.6 2.3-1.1-.9 2.7 2.1.4-2.1 1.7.5 1.2-2.4-.5.2 2.6h-1.6l.2-2.6-2.4.5.5-1.2-2.1-1.7 2.1-.4-.9-2.7 2.3 1.1Z" fill="#d52b1e" /></svg>;
const US = (p: FlagProps) => <svg {...box} {...p}><rect width="30" height="20" fill="#fff" /><g fill="#b22234"><rect width="30" height="1.54" /><rect y="3.08" width="30" height="1.54" /><rect y="6.15" width="30" height="1.54" /><rect y="9.23" width="30" height="1.54" /><rect y="12.31" width="30" height="1.54" /><rect y="15.38" width="30" height="1.54" /><rect y="18.46" width="30" height="1.54" /></g><rect width="12" height="10.77" fill="#3c3b6e" /></svg>;
const GB = (p: FlagProps) => <svg {...box} {...p}><rect width="30" height="20" fill="#012169" /><path d="M0 0l30 20M30 0L0 20" stroke="#fff" strokeWidth="4" /><path d="M0 0l30 20M30 0L0 20" stroke="#c8102e" strokeWidth="2" /><path d="M15 0v20M0 10h30" stroke="#fff" strokeWidth="6.5" /><path d="M15 0v20M0 10h30" stroke="#c8102e" strokeWidth="3.5" /></svg>;
const FR = (p: FlagProps) => <svg {...box} {...p}><rect width="10" height="20" fill="#002395" /><rect x="10" width="10" height="20" fill="#fff" /><rect x="20" width="10" height="20" fill="#ed2939" /></svg>;
const JP = (p: FlagProps) => <svg {...box} {...p}><rect width="30" height="20" fill="#fff" /><circle cx="15" cy="10" r="6" fill="#bc002d" /></svg>;
const KR = (p: FlagProps) => <svg {...box} {...p}><rect width="30" height="20" fill="#fff" /><path d="M15 4.5a5.5 5.5 0 0 1 0 11 2.75 2.75 0 0 0 0-5.5 2.75 2.75 0 0 1 0-5.5Z" fill="#cd2e3a" /><path d="M15 4.5a5.5 5.5 0 0 0 0 11 2.75 2.75 0 0 1 0-5.5 2.75 2.75 0 0 0 0-5.5Z" fill="#0047a0" /><g stroke="#000" strokeWidth="1"><path d="M5 4.4l2.6 3.9M8.2 2.2l2.6 3.9M21.8 13.8l2.6 3.9M25 11.6l2.6 3.9" /></g></svg>;
const UNKNOWN = (p: FlagProps) => <svg {...box} {...p}><rect width="30" height="20" rx="2" fill="#2b3d52" /></svg>;

const FLAGS: Record<string, (p: FlagProps) => React.JSX.Element> = { CA, US, GB, FR, JP, KR };

/** `country` is an ISO 3166-1 alpha-2 code. Unknown codes draw a neutral tile rather than nothing, so the chip does not change width when data arrives. */
export function Flag({ country, className }: { country?: string | null; className?: string }) { const Drawn = FLAGS[(country ?? "").toUpperCase()] ?? UNKNOWN; return <Drawn className={className ?? "flag"} />; }
export const hasFlag = (country?: string | null) => Boolean(FLAGS[(country ?? "").toUpperCase()]);
