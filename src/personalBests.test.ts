import { describe, expect, it } from 'vitest'
import { derivePersonalBests, didSessionSetPB, evaluatePersonalBest, formatPersonalBestValue, getPersonalBestValue } from './personalBests'
import { comparisonSignature, SESSION_EXERCISES, SESSION_REGISTRY } from './trainingSession'
import { makeSession, ownerA, ownerB } from './testFixtures/sessions'

describe('Personal Bests derived from Sessions', () => {
  it('has a real empty state and establishes the first valid result, including a genuine zero score', () => {
    expect(derivePersonalBests([], null)).toEqual([])
    const session = makeSession(0)
    expect(evaluatePersonalBest(session, [])).toMatchObject({ status: 'first', value: 0, previousValue: null })
    expect(derivePersonalBests([session], null)[0]).toMatchObject({ value: 0, sessionId: session.id, achievedAt: session.finishedAt })
  })
  it('uses the raw higher-is-better metric', () => {
    const previous = makeSession(10000)
    expect(evaluatePersonalBest(makeSession(9900, 2), [previous])?.status).toBe('none')
    expect(evaluatePersonalBest(makeSession(10200, 3), [previous])).toMatchObject({ status: 'new', previousValue: 10000, value: 10200, delta: 200 })
  })
  it('uses the actual minimum-hit-reaction field for lower-is-better', () => {
    const previous = makeSession(180, 1, { exerciseId: 'sniper-reaction' })
    expect(evaluatePersonalBest(makeSession(190, 2, { exerciseId: 'sniper-reaction' }), [previous])?.status).toBe('none')
    expect(evaluatePersonalBest(makeSession(175, 3, { exerciseId: 'sniper-reaction' }), [previous])).toMatchObject({ status: 'new', value: 175, delta: 5 })
  })
  it('compares full precision even when displayed values are identical', () => {
    const previous = makeSession(181.4, 1, { exerciseId: 'sniper-reaction' })
    const result = evaluatePersonalBest(makeSession(181.2, 2, { exerciseId: 'sniper-reaction' }), [previous])!
    expect(result.status).toBe('new'); expect(result.value).toBe(181.2)
    expect(formatPersonalBestValue(result)).toBe('181 ms')
    expect(formatPersonalBestValue({ definition: result.definition, value: result.previousValue! })).toBe('181 ms')
    expect(evaluatePersonalBest(makeSession(100.1, 2), [makeSession(100)])?.status).toBe('new')
  })
  it('keeps the original date and session on a tie, independent of fetch order', () => {
    const original = makeSession(100), equal = makeSession(100, 2)
    expect(didSessionSetPB(equal, [original, equal])).toBe(false)
    expect(derivePersonalBests([equal, original], null)[0]).toMatchObject({ sessionId: original.id, achievedAt: original.finishedAt })
  })
  it.each(['invalid', 'interrupted'] as const)('excludes %s even when it beats a valid record', status => {
    const valid = makeSession(100), invalid = makeSession(150, 2, { status, invalidReason: 'pointer_lock_lost' })
    expect(derivePersonalBests([invalid, valid], null)[0].value).toBe(100)
    expect(evaluatePersonalBest(invalid, [valid])).toBeNull()
    expect(didSessionSetPB(invalid, [valid])).toBe(false)
  })
  it.each([NaN, Infinity, -1])('does not invent a PB for an unusable metric %s', value => {
    expect(derivePersonalBests([makeSession(value)], null)).toEqual([])
  })
  it('does not fall back from a missing sniper best to mean reaction', () => {
    const session = makeSession(175, 1, { exerciseId: 'sniper-reaction' })
    if (session.exerciseId !== 'sniper-reaction' || !session.metrics) throw new Error('fixture')
    session.metrics.bestReactionMs = null
    expect(getPersonalBestValue(session)).toBeNull()
  })
  it('separates 30s/60s, exercises and versions, even when a version has a reused signature', () => {
    const original = makeSession(100, 1, { exerciseId: 'gridshot' })
    const short = makeSession(200, 2, { exerciseId: 'gridshot', config: { ...original.config!, durationSeconds: 30 } })
    const version = makeSession(90, 3, { exerciseId: 'gridshot', exerciseVersion: 2, comparisonSignature: original.comparisonSignature })
    const other = makeSession(900, 4, { exerciseId: 'switch' })
    const bests = derivePersonalBests([short, version, other, original], null)
    expect(bests).toHaveLength(4)
    expect(bests.find(best => best.sessionId === original.id)?.value).toBe(100)
  })
  it('uses input type in the Sessions comparison signature', () => {
    const mouse = makeSession(100), controller = makeSession(200, 2, { config: { ...mouse.config!, input: 'controller' } })
    expect(controller.comparisonSignature).not.toBe(mouse.comparisonSignature)
    expect(derivePersonalBests([mouse, controller], null)).toHaveLength(2)
  })
  it('keeps sensitivity, DPI, preset, game and routine context outside the PB key', () => {
    const first = makeSession(100)
    const routine = makeSession(120, 2, { context: { gameId: 'valorant', sensitivity: .3, dpi: 1600 },
      presetId: crypto.randomUUID(), routineRunId: crypto.randomUUID(), routineId: crypto.randomUUID() })
    expect(evaluatePersonalBest(routine, [first])?.status).toBe('new')
    expect(derivePersonalBests([first, routine], null)).toHaveLength(1)
  })
  it('recalculates 120 to 110 after deleting the winning session', () => {
    const history = [makeSession(100), makeSession(120, 2), makeSession(110, 3)]
    expect(derivePersonalBests(history, null)[0].value).toBe(120)
    expect(derivePersonalBests(history.filter(s => s.id !== history[1].id), null)[0].value).toBe(110)
  })
  it('derives 140 after importing guest sessions into a 120 account without importing PB rows', () => {
    const account = [makeSession(100, 1, { userId: ownerA }), makeSession(120, 2, { userId: ownerA })]
    const guest = makeSession(140, 3)
    expect(derivePersonalBests([...account, guest], ownerA)[0].value).toBe(120)
    expect(derivePersonalBests([...account, { ...guest, userId: ownerA }], ownerA)[0].value).toBe(140)
  })
  it('never mixes guest, account A or account B', () => {
    const rows = [makeSession(100), makeSession(200, 2, { userId: ownerA }), makeSession(300, 3, { userId: ownerB })]
    expect(derivePersonalBests(rows, null).map(s => s.value)).toEqual([100])
    expect(derivePersonalBests(rows, ownerA).map(s => s.value)).toEqual([200])
    expect(derivePersonalBests(rows, ownerB).map(s => s.value)).toEqual([300])
  })
  it('compares a completed session with the best that existed before it, excluding itself and later records', () => {
    const rows = [makeSession(100), makeSession(120, 2), makeSession(140, 3)]
    expect(evaluatePersonalBest(rows[1], rows)).toMatchObject({ status: 'new', previousValue: 100 })
    expect(evaluatePersonalBest(rows[0], rows)?.status).toBe('first')
  })
  it.each(SESSION_EXERCISES)('audits the real registry and formatter for %s', exerciseId => {
    const session = makeSession(50, 1, { exerciseId })
    const definition = SESSION_REGISTRY[exerciseId]
    expect(getPersonalBestValue(session)).toBe(50)
    expect(definition.pbSupported).toBe(true)
    expect(derivePersonalBests([session], null)[0].metricKey).toBe(definition.primaryMetric)
    expect(formatPersonalBestValue({ definition, value: 50 }, 'pt')).toBe(
      definition.unit === 'percent' ? '50,0%' : definition.unit === 'milliseconds' ? '50 ms' : '50')
    expect(comparisonSignature(exerciseId, session.config!)).toBe(session.comparisonSignature)
  })
})
