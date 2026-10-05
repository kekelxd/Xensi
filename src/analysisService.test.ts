import { describe, expect, it } from 'vitest'
import { buildAnalysis, comparePeriods, getPresetChanges, splitPeriods, summarizeValues, variantKey } from './analysisService'
import { getAnalysisMetrics } from './analysisMetrics'
import { makeSession, ownerA } from './testFixtures/sessions'
const now = Date.parse('2026-10-05T12:00:00Z'), day = 86400000
const session = (value: number, days: number, patch: Parameters<typeof makeSession>[2] = {}) => makeSession(value, days+1, { ...patch, finishedAt: new Date(now-days*day).toISOString() })
describe('Analysis transparent statistics', () => {
  it('splits adjacent UTC windows without overlap, excludes future, and has no previous all-time window', () => {
    const rows = [0,7,14,15,-1].map(d=>session(10,d))
    expect(splitPeriods(rows,'7d',now).current).toHaveLength(2)
    expect(splitPeriods(rows,'7d',now).previous).toHaveLength(1)
    expect(splitPeriods(rows,'all',now).previous).toEqual([])
  })
  it('aggregates mean/median, population deviation and CV without a subjective consistency score', () => {
    expect(summarizeValues([1,2,3,100])).toMatchObject({count:4,mean:26.5,median:2.5})
    expect(summarizeValues([10,10,10]).variation).toBe(0)
    expect(summarizeValues([0,0]).variation).toBeNull()
    expect(summarizeValues([1]).variation).toBeNull()
    expect(summarizeValues([NaN,Infinity])).toMatchObject({count:0,mean:null})
    expect(summarizeValues([1e308,1e308]).mean).toBe(1e308)
  })
  it('respects direction, ties, insufficient data, zero baseline and all-time', () => {
    const higher=getAnalysisMetrics('gridshot')[0], lower=getAnalysisMetrics('micro_flick')[0]
    expect(comparePeriods(summarizeValues([9900,9900,9900]),summarizeValues([9000,9000,9000]),higher,'30d')).toBeCloseTo(10)
    expect(comparePeriods(summarizeValues([180,180,180]),summarizeValues([200,200,200]),lower,'30d')).toBeCloseTo(10)
    expect(comparePeriods(summarizeValues([200,200,200]),summarizeValues([200,200,200]),lower,'30d')).toBe(0)
    expect(comparePeriods(summarizeValues([180]),summarizeValues([200,200,200]),lower,'30d')).toBeNull()
    expect(comparePeriods(summarizeValues([1,1,1]),summarizeValues([0,0,0]),higher,'30d')).toBeNull()
    expect(comparePeriods(summarizeValues([180,180,180]),summarizeValues([200,200,200]),lower,'all')).toBeNull()
  })
  it('isolates signatures, version, input, owner and invalid/interrupted sessions', () => {
    const a=session(90,1), b=session(999,2,{comparisonSignature:'30s'}), c=session(888,3,{exerciseVersion:2}), d=session(777,4,{userId:ownerA}), e=session(666,5,{status:'interrupted'})
    const result=buildAnalysis([a,b,c,d,e],null,{period:'30d',exercise:'flick',variant:variantKey(a),metric:'score',now})
    expect(result.current).toMatchObject({count:1,mean:90}); expect(result.recent).toHaveLength(1)
    expect(result.variants).toHaveLength(3)
  })
  it('detects one change for repeated presets and records DPI/game changes without equivalence guesses', () => {
    const rows=[.27,.27,.27,.24,.24].map((s,i)=>session(100,5-i,{context:{gameId:'cs2',sensitivity:s,dpi:800}}))
    expect(getPresetChanges(rows)).toHaveLength(1)
    rows[4]={...rows[4],context:{gameId:'cs2',sensitivity:.12,dpi:1600}}
    expect(getPresetChanges(rows)).toHaveLength(2)
    expect(getPresetChanges(rows).at(-1)!.session.context!.dpi).toBe(1600)
  })
  it('limits graph/recent rows but computes statistics on full retained history', () => {
    const rows=Array.from({length:351},(_,i)=>session(i===0?200:100,1,{id:crypto.randomUUID()}))
    const result=buildAnalysis(rows,null,{period:'all',exercise:'flick',variant:null,metric:'score',now})
    expect(result.current.count).toBe(351); expect(result.points).toHaveLength(300); expect(result.recent).toHaveLength(20)
  })
})
