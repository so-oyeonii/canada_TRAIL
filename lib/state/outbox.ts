/** Writes that were attempted while the shop had no signal.
 *
 *  `shop` is used in an underground mall, so a failed write is a normal path, not
 *  an error path. Two rules make replay safe:
 *
 *  1. Every op carries `opId`, which the server stores in a `client_op_id` unique
 *     index. Pressing Confirm twice in a store charges once.
 *  2. A 4xx is never retried. If the server says a late `planned` would overwrite
 *     a purchase that is already `bought` (409 stale_planned_overwrite), retrying
 *     would erase a spend record — the worst failure this app has. The op is
 *     dropped and surfaced to the traveler instead of being retried into silence. */

export type OutboxMethod = "POST" | "PUT" | "PATCH" | "DELETE";
export type OutboxOp = { opId: string; method: OutboxMethod; path: string; body: unknown; createdAt: string; tries: number };
export type OpVerdict = "done" | "drop" | "retry";
export type SendResult = { status: number; body?: unknown };
export type FlushOutcome = { done: OutboxOp[]; dropped: { op: OutboxOp; status: number; body?: unknown }[]; pending: OutboxOp[] };

export const MAX_TRIES = 6;

/** 408 and 429 are the server asking for a wait, not a refusal. Everything else
 *  in 4xx is a decision, and the client is not entitled to argue with it. */
export function classify(status: number, tries = 0): OpVerdict {
  if (status >= 200 && status < 300) return "done";
  if (status === 408 || status === 429) return tries + 1 >= MAX_TRIES ? "drop" : "retry";
  if (status >= 400 && status < 500) return "drop";
  return tries + 1 >= MAX_TRIES ? "drop" : "retry";     // 5xx and status 0 (offline)
}

export function newOp(method: OutboxMethod, path: string, body: unknown, opId: string, now = new Date().toISOString()): OutboxOp {
  return { opId, method, path, body, createdAt: now, tries: 0 };
}

/** Later ops for the same path replace earlier ones — the purchase routes are
 *  whole-record replacements (`PUT /api/purchases/{stopId}`), so replaying an
 *  older body would undo a newer edit. Order is otherwise preserved. */
export function enqueue(queue: OutboxOp[], op: OutboxOp): OutboxOp[] {
  const collapsible = op.method === "PUT";
  const kept = queue.filter((q) => q.opId !== op.opId && !(collapsible && q.method === "PUT" && q.path === op.path));
  return [...kept, op];
}

export async function flush(queue: OutboxOp[], send: (op: OutboxOp) => Promise<SendResult>): Promise<FlushOutcome> {
  const done: OutboxOp[] = [], dropped: FlushOutcome["dropped"] = [], pending: OutboxOp[] = [];
  for (const op of queue) {
    if (pending.length) { pending.push(op); continue; }   // keep order: stop at the first op that must be retried
    let result: SendResult;
    try { result = await send(op); } catch { result = { status: 0 }; }
    const verdict = classify(result.status, op.tries);
    if (verdict === "done") done.push(op);
    else if (verdict === "drop") dropped.push({ op, status: result.status, body: result.body });
    else pending.push({ ...op, tries: op.tries + 1 });
  }
  return { done, dropped, pending };
}
