/**
 * Worker adapter for webhook queue operations.
 *
 * The orchestration and state transitions live in `services/webhookQueueService.ts`.
 * This module preserves the existing import path used by the worker runtime and callers.
 */

export {
  checkScoreThresholds,
  processWebhookQueue,
  queueWebhookEvent,
} from '../services/webhookQueueService.js'
