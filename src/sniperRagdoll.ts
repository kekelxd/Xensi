// Lightweight procedural ragdoll: joint angles as closed-form damped springs of the time since the hit.
// No physics engine and no per-frame state, so it costs almost nothing and replays identically.
export type HitRegion = 'head' | 'chest' | 'legs'

// fall: whole body about the feet (forward = +). bend: torso at the hip. whip/droop: head at the neck.
// arm: shoulders (+ = hands thrown backwards). leg: hips.
const REACTION = {
  head: { fallTime: .5, fall: 1.5, bend: .12, whip: -.95, droop: .5, arm: 1.1, leg: .15, slide: .5 },
  chest: { fallTime: .64, fall: 1.45, bend: .6, whip: -.4, droop: .55, arm: 2.1, leg: .35, slide: .38 },
  legs: { fallTime: .42, fall: 1.5, bend: .2, whip: -.15, droop: .25, arm: 1.4, leg: 1.0, slide: .65 },
} as const

export const RAGDOLL_SETTLE_SECONDS = 1.3

export function regionForHit(zone: 'head' | 'body', heightFraction: number): HitRegion {
  if (zone === 'head') return 'head'
  return heightFraction < .5 ? 'legs' : 'chest'
}

export function ragdollPose(region: HitRegion, seconds: number) {
  const r = REACTION[region], t = Math.max(0, Math.min(seconds, RAGDOLL_SETTLE_SECONDS))
  const spring = 1 - Math.exp(-t / .09) * Math.cos(t * 16)
  const settle = t - r.fallTime
  return {
    // Accelerates like a fall, then bounces slightly off the ground.
    fall: settle < 0 ? r.fall * (t / r.fallTime) ** 2 : r.fall * (1 + .05 * Math.exp(-settle * 12) * Math.cos(settle * 38)),
    bend: r.bend * spring,
    head: r.whip * Math.exp(-t / .14) + r.droop * (1 - Math.exp(-t / .4)),
    arm: r.arm * Math.exp(-t / .35) + .35 * (1 - Math.exp(-t / .35)),
    leg: r.leg * spring,
    // Momentum carries the body along its run direction before it stops.
    slide: r.slide * (1 - Math.exp(-t / .22)),
  }
}
