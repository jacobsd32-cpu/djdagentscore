import { describe, expect, it } from 'vitest'
import { calcBehavior } from '../src/scoring/behavior.js'

describe('calcBehavior', () => {
  it('returns insufficient_data for < 10 transactions', () => {
    const timestamps = ['2026-01-01T10:00:00Z', '2026-01-01T14:00:00Z', '2026-01-02T09:00:00Z']
    const result = calcBehavior(timestamps)
    expect(result.score).toBe(50)
    expect(result.data.classification).toBe('insufficient_data')
  })

  it('scores organic behavior high (varied times, spread hours, gaps)', () => {
    // Simulate organic human-like agent: irregular intervals across many hours
    // with multi-day gaps for downtime
    const timestamps: string[] = [
      '2026-01-01T08:15:00Z',
      '2026-01-01T14:42:00Z',
      '2026-01-02T03:11:00Z',
      '2026-01-02T19:55:00Z',
      // 3-day gap (downtime)
      '2026-01-05T22:03:00Z',
      '2026-01-06T07:30:00Z',
      '2026-01-06T16:18:00Z',
      '2026-01-07T11:44:00Z',
      '2026-01-08T01:02:00Z',
      '2026-01-08T20:37:00Z',
      // another gap
      '2026-01-11T05:22:00Z',
      '2026-01-11T17:58:00Z',
      '2026-01-12T09:14:00Z',
      '2026-01-13T02:45:00Z',
      '2026-01-13T23:11:00Z',
    ]
    const result = calcBehavior(timestamps)
    expect(result.score).toBeGreaterThanOrEqual(70)
    expect(result.data.classification).toBe('organic')
  })

  it('scores robotic behavior low (fixed interval, single hour)', () => {
    // Simulate bot: exactly every 60 seconds, same hour
    const timestamps: string[] = []
    const base = new Date('2026-01-01T12:00:00Z')
    for (let i = 0; i < 30; i++) {
      const d = new Date(base.getTime() + i * 60_000)
      timestamps.push(d.toISOString())
    }
    const result = calcBehavior(timestamps)
    expect(result.score).toBeLessThan(40)
    expect(['automated', 'suspicious']).toContain(result.data.classification)
  })

  it('returns signals record with three keys', () => {
    const timestamps: string[] = []
    const base = new Date('2026-01-01T00:00:00Z')
    for (let i = 0; i < 15; i++) {
      const d = new Date(base.getTime() + i * 3_600_000 * (1 + Math.random()))
      timestamps.push(d.toISOString())
    }
    const result = calcBehavior(timestamps)
    expect(result.signals).toBeDefined()
    expect(Object.keys(result.signals)).toEqual(
      expect.arrayContaining(['interArrivalCV', 'hourlyEntropy', 'maxGapHours']),
    )
  })
})
