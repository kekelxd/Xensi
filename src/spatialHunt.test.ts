import { describe, expect, it, vi } from 'vitest'
import { angularVectorError, circularAngleDifference, forwardDirection, generateSpatialDirections, isSpatialMetrics, SpatialHuntController, SPATIAL_SECTORS, summarizeSpatialRounds, verticalFov } from './spatialHunt'
import { makeSession, spatialMetrics } from './testFixtures/sessions'
import { derivePersonalBests, getPersonalBestValue } from './personalBests'
import { comparisonSignature, exerciseConfig } from './trainingSession'
import { parseCloudSession, sessionRow } from './sessionCloud'

function harness() {
  let audio = 0, yaw = 0, pitch = 0
  const ports = { audioTime: () => audio, cue: vi.fn(() => audio + .03), stopAudio: vi.fn(),
    orientation: () => ({yaw, pitch, forward: forwardDirection(yaw, pitch)}), reveal: vi.fn(), hideSource: vi.fn(),
    blackout: vi.fn(), changed: vi.fn(), sample: vi.fn(), completed: vi.fn() }
  const controller = new SpatialHuntController(42, ports)
  return { controller, ports, setAudio: (value: number) => { audio = value }, look: (y: number, p = 0) => { yaw = y; pitch = p } }
}

describe('Spatial Hunt geometry and balanced distribution', () => {
  it.each([[351,6,15], [6,351,15], [10,20,10], [0,180,180]])('wraps %s and %s to %s degrees', (a,b,result) => expect(circularAngleDifference(a,b)).toBe(result))
  it('uses normalized 3D camera vectors including pitch', () => {
    expect(angularVectorError(forwardDirection(0), forwardDirection(Math.PI))).toBe(180)
    expect(angularVectorError(forwardDirection(0, Math.PI/4), forwardDirection(0))).toBeCloseTo(45)
    expect(angularVectorError({x:0,y:0,z:-5}, forwardDirection(0))).toBe(0)
    expect(() => angularVectorError({x:0,y:0,z:0}, forwardDirection(0))).toThrow()
  })
  it('preserves horizontal FOV across desktop and portrait aspect ratios', () => {
    for (const aspect of [1920/1080,1440/900,1366/768,393/851]) expect(2*Math.atan(Math.tan(verticalFov(103,aspect)*Math.PI/360)*aspect)*180/Math.PI).toBeCloseTo(103)
  })
  it('covers eight unique shuffled sectors deterministically with bounded jitter', () => {
    const first = generateSpatialDirections(42)
    expect(first).toEqual(generateSpatialDirections(42)); expect(first).not.toEqual(generateSpatialDirections(43))
    expect(first.map(d=>d.sector)).not.toEqual(SPATIAL_SECTORS)
    for (let seed=0;seed<100;seed++) {
      const directions=generateSpatialDirections(seed)
      expect(new Set(directions.map(d=>d.sector)).size).toBe(8)
      for (const d of directions) expect(circularAngleDifference(d.azimuth,SPATIAL_SECTORS.indexOf(d.sector)*45)).toBeLessThanOrEqual(12)
    }
  })
})
describe('Spatial Hunt lifecycle and audio clock', () => {
  it('captures orientation only at full blackout and rejects early or duplicate clicks', () => {
    const f=harness(); f.controller.start(0); f.look(.2); f.controller.tick(3000); f.look(1); f.controller.tick(3400)
    expect(f.controller.fullyBlack).toBe(true); expect(f.ports.blackout).toHaveBeenLastCalledWith(1)
    expect(f.controller.respond(3401)).toBe(false)
    f.setAudio(.23); f.look(1.2,.2); expect(f.controller.respond(3600)).toBe(true)
    expect(f.controller.rounds[0].referenceYaw).toBeCloseTo(180/Math.PI)
    expect(f.controller.rounds[0].localizationTimeMs).toBeCloseTo(200)
    expect(f.controller.rounds[0].responsePitch).toBeCloseTo(.2*180/Math.PI)
    expect(f.controller.respond(3601)).toBe(false); expect(f.ports.stopAudio).toHaveBeenCalledTimes(1)
  })
  it('enforces timeout even if a click arrives before the next RAF', () => {
    const f=harness(); f.controller.start(0); f.controller.tick(3000); f.controller.tick(3400); f.setAudio(5.03)
    f.controller.respond(8400)
    expect(f.controller.rounds[0]).toMatchObject({timedOut:true, angularErrorDeg:180, localizationTimeMs:5000, responseAzimuth:null})
  })
  it('completes exactly eight rounds, stops pulses and never resumes a terminal session', () => {
    const f=harness(); f.controller.start(0)
    let now=0, audio=0
    for(let i=0;i<8;i++) {
      f.controller.tick(now+3000); f.controller.tick(now+3400); audio+=.23; f.setAudio(audio)
      f.controller.respond(now+3600); f.controller.tick(now+5200)
      if(i<7) f.controller.tick(now+5500)
      now+=5500
    }
    expect(f.controller.phase).toBe('completed'); expect(f.ports.completed).toHaveBeenCalledTimes(1)
    expect(isSpatialMetrics(f.ports.completed.mock.calls[0][0])).toBe(true)
    f.controller.start(now); f.controller.tick(now+9000); expect(f.controller.rounds).toHaveLength(8)
  })
  it('interrupts blackout, stops audio and makes further answers impossible', () => {
    const f=harness(); f.controller.start(0); f.controller.tick(3000); f.controller.tick(3400)
    f.controller.interrupt(3500); f.setAudio(1); f.controller.tick(9000)
    expect(f.controller.phase).toBe('interrupted'); expect(f.controller.respond(9001)).toBe(false)
    expect(f.ports.completed).not.toHaveBeenCalled(); expect(f.ports.stopAudio).toHaveBeenCalledTimes(1)
    expect(f.ports.blackout).toHaveBeenLastCalledWith(0)
  })
})
describe('Spatial Hunt persistence and PB contract', () => {
  it('selects 9.8 from 12.4 / 9.8 / 11.1 and accepts genuine zero error', () => {
    const sessions=[12.4,9.8,11.1].map((v,i)=>makeSession(v,i+1,{exerciseId:'spatial_hunt'}))
    expect(derivePersonalBests(sessions,null)[0].value).toBeCloseTo(9.8)
    expect(getPersonalBestValue(makeSession(0,4,{exerciseId:'spatial_hunt'}))).toBe(0)
  })
  it('rejects incomplete, timed out, corrupted or interrupted results for PB', () => {
    const full=spatialMetrics(10), timeout={...full.rounds[0],timedOut:true,angularErrorDeg:180,localizationTimeMs:5000,responseAzimuth:null,responsePitch:null}
    for(const metrics of [summarizeSpatialRounds(full.rounds.slice(1)),summarizeSpatialRounds([timeout,...full.rounds.slice(1)]),{...full,mean_angular_error_deg:0}]) {
      expect(getPersonalBestValue(makeSession(10,1,{exerciseId:'spatial_hunt',metrics}))).toBeNull()
    }
    expect(getPersonalBestValue(makeSession(10,1,{exerciseId:'spatial_hunt',status:'interrupted'}))).toBeNull()
  })
  it('roundtrips nested metrics without accepting another owner or malformed rounds', () => {
    const owner=crypto.randomUUID(), session=makeSession(10,1,{exerciseId:'spatial_hunt',userId:owner}), row=sessionRow(session)
    expect(parseCloudSession(row,owner)).toEqual(session)
    expect(()=>parseCloudSession(row,crypto.randomUUID())).toThrow()
    expect(()=>parseCloudSession({...row,metrics:{...spatialMetrics(10),rounds:[]}},owner)).toThrow()
  })
  it('excludes seed, viewport, sensitivity and preset from comparability but separates versions', () => {
    const cfg=exerciseConfig('spatial_hunt','medium','medium',0,1440,900,'classic')
    const signature=comparisonSignature('spatial_hunt',cfg)
    expect(comparisonSignature('spatial_hunt',{...cfg,arenaWidth:1920,arenaHeight:1080,spatial:{...cfg.spatial!,seed:987}})).toBe(signature)
    expect(comparisonSignature('spatial_hunt',cfg,2)).not.toBe(signature)
  })
})
