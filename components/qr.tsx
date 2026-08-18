/** The drop-off pass as a QR symbol.
 *
 *  `uqr` is a static import on purpose. The counter is in a basement, so the
 *  encoder has to be in the route's own JS chunk — anything fetched at render
 *  time (a canvas worker, a server-rendered image, a CDN generator) is a network
 *  request in the one place this app is guaranteed not to have a network.
 *
 *  The matrix is all we take. The markup is ours so the quiet zone (4 modules,
 *  the spec's minimum), the literal black-on-white — `.qr-card` never inverts,
 *  because a scanner needs a light field — and the `role="img"` label cannot be
 *  themed away by a later design pass.
 *
 *  Dark modules are emitted as horizontal runs rather than one rect per module:
 *  a version 11 symbol is 3,721 modules and roughly 600 runs. */

import { encode } from "uqr";

export function QrCode({ value, label }: { value: string; label: string }) {
  const { size, data } = encode(value, { ecc: "M", border: 4 });
  const runs: React.ReactElement[] = [];
  for (let y = 0; y < size; y += 1) {
    let x = 0;
    while (x < size) {
      if (!data[y][x]) { x += 1; continue; }
      let width = 1;
      while (x + width < size && data[y][x + width]) width += 1;
      runs.push(<rect key={`${y}-${x}`} x={x} y={y} width={width} height={1} />);
      x += width;
    }
  }
  return <svg className="qr" viewBox={`0 0 ${size} ${size}`} shapeRendering="crispEdges" role="img" aria-label={label}>{runs}</svg>;
}
