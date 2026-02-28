/**
 * Trajectory Analysis Tests
 *
 * Verifies computeTrajectory() — a pure function that computes velocity,
 * momentum, direction, volatility, streak, and a ±5 composite modifier
 * from score history entries.
 *
 * No DB needed: all inputs are plain arrays of { score, calculatedAt }.
 */
import { describe, expect, it } from 'vitest'
import { computeTrajectory, type TrajectoryInput } from '../src/scoring/trajectory.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a score entry N days ago from a reference date. */
function entry(score: number, daysAgo: number): { score: number; calculatedAt: string } {
  const d = new Date('2025-06-15T00:00:00Z')
  d.setDate(d.getDate() - daysAgo)
  return { score, calculatedAt: d.toISOString() }
}

/** Generate N monotonically increasing scores, 1 day apart. */
function risingScores(n: number, startScore = 50, increment = 2): TrajectoryInput['scores'] {
  return Array.from({ length: n }, (_, i) => entry(startScore + i * increment, n - 1 - i))
}

/** Generate N monotonically decreasing scores, 1 day apart. */
function fallingScores(n: number, startScore = 80, decrement = 2): TrajectoryInput['scores'] {
  return Array.from({ length: n }, (_, i) => entry(startScore - i * decrement, n - 1 - i))
}

// ---------------------------------------------------------------------------
// Empty / insufficient data
// ---------------------------------------------------------------------------

describe('computeTrajectory — insufficient data', () => {
  it('returns direction "new" and modifier 0 for empty input', () => {
    const result = computeTrajectory({ scores: [] })
    expect(result.direction).toBe('new')
    expect(result.modifier).toBe(0)
    expect(result.velocity).toBeNull()
    expect(result.momentum).toBeNull()
    expect(result.volatility).toBe(0)
    expect(result.dataPoints).toBe(0)
    expect(result.spanDays).toBe(0)
  })

  it('returns direction "new" and modifier 0 for single entry', () => {
    const result = computeTrajectory({ scores: [entry(65, 0)] })
    expect(result.direction).toBe('new')
    expect(result.modifier).toBe(0)
    expect(result.velocity).toBeNull()
    expect(result.dataPoints).toBe(1)
  })

  it('returns direction "new" with velocity for 2 entries (below MIN_DATA_POINTS)', () => {
    const result = computeTrajectory({ scores: [entry(60, 2), entry(70, 0)] })
    expect(result.direction).toBe('new')
    expect(result.modifier).toBe(0)
    expect(result.velocity).not.toBeNull()
    expect(result.velocity).toBe(5) // (70-60) / 2 days = 5 pts/day
    expect(result.dataPoints).toBe(2)
    expect(result.spanDays).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// Velocity (OLS linear regression)
// ---------------------------------------------------------------------------

describe('computeTrajectory — velocity', () => {
  it('computes positive velocity for rising scores', () => {
    // 5 scores: 50, 52, 54, 56, 58 over 4 days -> slope = 2 pts/day
    const result = computeTrajectory({ scores: risingScores(5) })
    expect(result.velocity).toBe(2)
  })

  it('computes negative velocity for falling scores', () => {
    // 5 scores: 80, 78, 76, 74, 72 over 4 days -> slope = -2 pts/day
    const result = computeTrajectory({ scores: fallingScores(5) })
    expect(result.velocity).toBe(-2)
  })

  it('computes zero velocity for flat scores', () => {
    const flat = Array.from({ length: 5 }, (_, i) => entry(65, 4 - i))
    const result = computeTrajectory({ scores: flat })
    expect(result.velocity).toBe(0)
  })

  it('handles unsorted input (sorts internally)', () => {
    // Provide scores out of chronological order
    const shuffled = [entry(58, 0), entry(50, 4), entry(54, 2), entry(52, 3), entry(56, 1)]
    const result = computeTrajectory({ scores: shuffled })
    expect(result.velocity).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// Momentum (acceleration)
// ---------------------------------------------------------------------------

describe('computeTrajectory — momentum', () => {
  it('returns null momentum for fewer than 6 data points', () => {
    const result = computeTrajectory({ scores: risingScores(5) })
    expect(result.momentum).toBeNull()
  })

  it('computes positive momentum when second half accelerates', () => {
    // First half: slow rise (1 pt/day), second half: fast rise (3 pts/day)
    const scores = [
      entry(50, 7),
      entry(51, 6),
      entry(52, 5),
      entry(53, 4),
      entry(56, 3),
      entry(59, 2),
      entry(62, 1),
      entry(65, 0),
    ]
    const result = computeTrajectory({ scores })
    expect(result.momentum).not.toBeNull()
    expect(result.momentum!).toBeGreaterThan(0)
  })

  it('computes negative momentum when second half decelerates', () => {
    // First half: fast rise (3 pts/day), second half: slow rise (1 pt/day)
    const scores = [
      entry(50, 7),
      entry(53, 6),
      entry(56, 5),
      entry(59, 4),
      entry(60, 3),
      entry(61, 2),
      entry(62, 1),
      entry(63, 0),
    ]
    const result = computeTrajectory({ scores })
    expect(result.momentum).not.toBeNull()
    expect(result.momentum!).toBeLessThan(0)
  })
})

// ---------------------------------------------------------------------------
// Direction classification
// ---------------------------------------------------------------------------

describe('computeTrajectory — direction', () => {
  it('classifies improving when velocity > 0.5', () => {
    const result = computeTrajectory({ scores: risingScores(5) })
    expect(result.direction).toBe('improving')
  })

  it('classifies declining when velocity < -0.5', () => {
    const result = computeTrajectory({ scores: fallingScores(5) })
    expect(result.direction).toBe('declining')
  })

  it('classifies stable for flat scores with low volatility', () => {
    const flat = Array.from({ length: 5 }, (_, i) => entry(65, 4 - i))
    const result = computeTrajectory({ scores: flat })
    expect(result.direction).toBe('stable')
  })

  it('classifies volatile when standard deviation >= 15', () => {
    // Erratic scores with high stdev
    const erratic = [entry(30, 4), entry(80, 3), entry(20, 2), entry(90, 1), entry(40, 0)]
    const result = computeTrajectory({ scores: erratic })
    expect(result.direction).toBe('volatile')
    expect(result.volatility).toBeGreaterThanOrEqual(15)
  })
})

// ---------------------------------------------------------------------------
// Modifier logic (the key feedback mechanism)
// ---------------------------------------------------------------------------

describe('computeTrajectory — modifier', () => {
  it('returns +5 for 10+ consecutive improvements AND velocity > 1.0', () => {
    // 11 scores rising 2pts/day -> streak=10, velocity=2
    const result = computeTrajectory({ scores: risingScores(11) })
    expect(result.modifier).toBe(5)
  })

  it('returns -5 for 10+ consecutive declines AND velocity < -1.0', () => {
    const result = computeTrajectory({ scores: fallingScores(11) })
    expect(result.modifier).toBe(-5)
  })

  it('returns +3 for 5+ consecutive improvements', () => {
    // 5 scores rising: streak=4 (only 4 improvements in 5 entries), but velocity > 0.5
    // Need exactly 6 entries for streak=5
    const result = computeTrajectory({ scores: risingScores(6) })
    expect(result.modifier).toBe(3)
  })

  it('returns +3 for velocity > 0.5 even without long streak', () => {
    // High velocity but short history (3 entries, streak = 2)
    const scores = [entry(50, 2), entry(55, 1), entry(60, 0)]
    const result = computeTrajectory({ scores })
    expect(result.modifier).toBe(3) // velocity = 5, streak = 2
  })

  it('returns -3 for 5+ consecutive declines', () => {
    const result = computeTrajectory({ scores: fallingScores(6) })
    expect(result.modifier).toBe(-3)
  })

  it('returns -3 for velocity < -0.5 even without long streak', () => {
    const scores = [entry(60, 2), entry(55, 1), entry(50, 0)]
    const result = computeTrajectory({ scores })
    expect(result.modifier).toBe(-3) // velocity = -5, streak = -2
  })

  it('returns +1 for stable scores (low volatility, 5+ data points)', () => {
    // All same score -> velocity = 0, volatility = 0, streak = 0
    const flat = Array.from({ length: 5 }, (_, i) => entry(65, 4 - i))
    const result = computeTrajectory({ scores: flat })
    expect(result.modifier).toBe(1)
  })

  it('returns 0 for volatile/erratic scores', () => {
    const erratic = [entry(30, 4), entry(80, 3), entry(20, 2), entry(90, 1), entry(40, 0)]
    const result = computeTrajectory({ scores: erratic })
    expect(result.modifier).toBe(0)
  })

  it('modifier never exceeds ±5', () => {
    // Even with extremely strong trends, capped at ±5
    const extreme = risingScores(10, 10, 10) // 10 pts/day for 10 entries
    const result = computeTrajectory({ scores: extreme })
    expect(result.modifier).toBeGreaterThanOrEqual(-5)
    expect(result.modifier).toBeLessThanOrEqual(5)
  })
})

// ---------------------------------------------------------------------------
// Volatility
// ---------------------------------------------------------------------------

describe('computeTrajectory — volatility', () => {
  it('returns 0 for single entry', () => {
    const result = computeTrajectory({ scores: [entry(65, 0)] })
    expect(result.volatility).toBe(0)
  })

  it('returns 0 for identical scores', () => {
    const flat = Array.from({ length: 5 }, (_, i) => entry(65, 4 - i))
    const result = computeTrajectory({ scores: flat })
    expect(result.volatility).toBe(0)
  })

  it('computes correct stdev for known values', () => {
    // Scores: 60, 70 -> mean=65, variance=25, stdev=5.0
    const result = computeTrajectory({ scores: [entry(60, 1), entry(70, 0)] })
    expect(result.volatility).toBe(5)
  })
})

// ---------------------------------------------------------------------------
// Span days
// ---------------------------------------------------------------------------

describe('computeTrajectory — spanDays', () => {
  it('returns correct span for entries across multiple days', () => {
    const scores = [entry(50, 10), entry(55, 5), entry(60, 0)]
    const result = computeTrajectory({ scores })
    expect(result.spanDays).toBe(10)
  })

  it('returns 0 for entries at same timestamp', () => {
    const same = [
      { score: 50, calculatedAt: '2025-06-15T00:00:00Z' },
      { score: 55, calculatedAt: '2025-06-15T00:00:00Z' },
      { score: 60, calculatedAt: '2025-06-15T00:00:00Z' },
    ]
    const result = computeTrajectory({ scores: same })
    expect(result.spanDays).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Streak calculation
// ---------------------------------------------------------------------------

describe('computeTrajectory — streak behavior', () => {
  it('counts positive streak from end of series', () => {
    // flat, flat, rise, rise, rise -> streak = 3
    const scores = [entry(50, 4), entry(50, 3), entry(55, 2), entry(60, 1), entry(65, 0)]
    const result = computeTrajectory({ scores })
    // streak starts from the end: 65>60>55>50 = 3 consecutive rises
    // but the pair at indices 0,1 (50,50) breaks it
    // Walking backward: 65-60=+5 (streak=1), 60-55=+5 (streak=2), 55-50=+5 (streak=3), 50-50=0 (break)
    expect(result.modifier).toBe(3) // streak=3, velocity positive
  })

  it('counts negative streak from end of series', () => {
    const scores = [entry(50, 4), entry(50, 3), entry(45, 2), entry(40, 1), entry(35, 0)]
    const result = computeTrajectory({ scores })
    expect(result.modifier).toBe(-3) // negative streak + negative velocity
  })
})
