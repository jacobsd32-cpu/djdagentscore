/**
 * Shared in-memory job statistics.
 * Each background job updates its entry when it runs.
 * The /health endpoint reads from this object.
 */
export const jobStats = {
  hourlyRefresh: { lastRun: '', walletsRefreshed: 0 },
  intentMatcher: { lastRun: '', queriesProcessed: 0 },
  outcomeMatcher: { lastRun: '', outcomesRecorded: 0 },
  anomalyDetector: { lastRun: '', anomaliesFound: 0 },
  dailyAggregator: { lastRun: '' },
}
