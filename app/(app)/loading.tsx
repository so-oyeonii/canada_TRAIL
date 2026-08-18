/** Shown while a screen under `(app)` is still on the wire. It says `Opening…` and not
 *  what is being opened: this fires before any read has come back, so naming the trip or
 *  the delivery would be the boundary asserting something it has not been told. */

export default function AppLoading() { return <p className="quiet-note" role="status">Opening&hellip;</p>; }
