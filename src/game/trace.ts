import type { RiteOutcome } from './rite'

/**
 * The verification trace's event shape, declared once.
 *
 * Three readers share it: the scene produces events, `scripts/record-rite-trace.mjs`
 * dumps them to the fixtures, and the Rite's tests replay them. It used to be
 * spelled out separately in the scene's record call, in the fixture JSON and in an
 * inline union in the test, so a field added to one could silently escape the other
 * two — the recorder is plain JS and cannot import this, but the two TypeScript
 * ends now cannot drift, and a missing field at a call site is a compile error.
 */

/** One processed frame: the elapsed time handed to `tick`, and the Resolve after it. */
export type TraceDrainEvent = {
  kind: 'drain'
  dt: number
  resolve: number
}

/**
 * One line clear. The first half is the descriptor the scene hands the Rite; the
 * second half is what the Rite was already holding and what it reported back.
 */
export type TraceClearEvent = {
  kind: 'clear'
  lines: number
  clusters: { color: number; size: number }[]
  maxClusterSize: number
  moveIndex: number
  combo: number
  timeRemaining: number
  level: number
  score: number
  levelScore: number
  moves: number
  refund: number
  resolve: number
  colorMult: number
  lineMult: number
  totalClusterPoints: number
}

/** One piece lock: the per-piece Resolve bleed has no other observable. */
export type TraceLockEvent = {
  kind: 'lock'
  resolve: number
}

/** The run ended. Exactly one of these closes a rules program. */
export type TraceOutcomeEvent = {
  kind: 'outcome'
  outcome: RiteOutcome
  level: number
  score: number
}

/**
 * One spawned piece, from the `pieces` program. Built by the recorder in the page
 * rather than by the scene, since what it pins is the Rng's draw order.
 */
export type TracePieceEvent = {
  kind: 'piece'
  index: number
  shape: number[][]
  colors: number[][]
}

export type TraceEvent =
  | TraceDrainEvent
  | TraceClearEvent
  | TraceLockEvent
  | TraceOutcomeEvent
  | TracePieceEvent

/**
 * What the scene records and the Rite replays: the whole trace minus the piece
 * stream, which is pinned by the browser gate instead because building a piece
 * from the stream is the scene's code.
 */
export type RiteTraceEvent = Exclude<TraceEvent, { kind: 'piece' }>
