import { permanentRedirect } from "next/navigation";

/** The People lens is now Gifts ▸ Split. The route stays as a 308 because tab memory,
 *  bookmarks and any link Trail has ever sent still point at it — and `isStale` refuses
 *  to restore it too, so this is the second belt rather than the only one. */
export default function PeopleMoved() { permanentRedirect("/trail/plan/gifts/split"); }
