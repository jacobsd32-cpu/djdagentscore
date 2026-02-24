import { describe, expect, it } from 'vitest'
import type { BehaviorData, ScoreDimensions } from '../src/types.js'

describe('BehaviorData type', () => {
  it('accepts valid behavior data', () => {
    const data: BehaviorData = {
      interArrivalCV: 1.2,
      hourlyEntropy: 3.1,
      maxGapHours: 72,
      classification: 'organic',
      txCount: 45,
    }
    expect(data.classification).toBe('organic')
  })

  it('behavior dimension fits in ScoreDimensions', () => {
    const dims: ScoreDimensions = {
      reliability: { score: 70, data: {} as any },
      viability: { score: 60, data: {} as any },
      identity: { score: 50, data: {} as any },
      capability: { score: 40, data: {} as any },
      behavior: {
        score: 65,
        data: {
          interArrivalCV: 1.2,
          hourlyEntropy: 3.1,
          maxGapHours: 72,
          classification: 'organic',
          txCount: 45,
        },
      },
    }
    expect(dims.behavior?.score).toBe(65)
  })
})
