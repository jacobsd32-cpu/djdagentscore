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
      reliability: { score: 70, data: {} as ScoreDimensions['reliability']['data'] },
      viability: { score: 60, data: {} as ScoreDimensions['viability']['data'] },
      identity: { score: 50, data: {} as ScoreDimensions['identity']['data'] },
      capability: { score: 40, data: {} as ScoreDimensions['capability']['data'] },
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
