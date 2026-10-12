import { describe, expect, it } from 'vitest'
import { ragdollPose, RAGDOLL_SETTLE_SECONDS, regionForHit } from './sniperRagdoll'

describe('Sniper ragdoll pose', () => {
  it('maps the hit height to a region', () => {
    expect(regionForHit('head', .9)).toBe('head')
    expect(regionForHit('body', .8)).toBe('chest')
    expect(regionForHit('body', .3)).toBe('legs')
  })
  it('starts upright and ends lying down', () => {
    for (const region of ['head', 'chest', 'legs'] as const) {
      const start = ragdollPose(region, 0), end = ragdollPose(region, RAGDOLL_SETTLE_SECONDS)
      expect(start.fall).toBe(0)
      expect(start.slide).toBe(0)
      expect(end.fall).toBeGreaterThan(1.3)
      expect(end.fall).toBeLessThan(1.7)
    }
  })
  it('reacts differently by region: head whips back, chest doubles over, legs buckle', () => {
    expect(ragdollPose('head', .08).head).toBeLessThan(0)
    expect(ragdollPose('chest', .2).bend).toBeGreaterThan(ragdollPose('head', .2).bend)
    expect(ragdollPose('legs', .2).leg).toBeGreaterThan(ragdollPose('chest', .2).leg)
    expect(ragdollPose('legs', .5).fall).toBeGreaterThan(ragdollPose('chest', .5).fall)
  })
  it('is deterministic and clamps time outside the animation', () => {
    expect(ragdollPose('chest', .3)).toEqual(ragdollPose('chest', .3))
    expect(ragdollPose('chest', 99)).toEqual(ragdollPose('chest', RAGDOLL_SETTLE_SECONDS))
    expect(ragdollPose('chest', -1)).toEqual(ragdollPose('chest', 0))
  })
})
