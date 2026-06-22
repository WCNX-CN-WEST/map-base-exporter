// A named export region. Multiple frames can be placed on the map at once and
// exported simultaneously, each becoming its own image file. Bounds are stored
// in geographic coordinates [west, south, east, north] so a frame stays locked
// to the ground as the map pans and zooms.
import type { Bounds } from '../print/viewportUtils'

export interface Frame {
  id: string
  bounds: Bounds
  /** Optional human label; flows into the exported filename. */
  name: string
}

/** Collision-resistant id for a new frame. */
export function makeFrameId(): string {
  return `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}
