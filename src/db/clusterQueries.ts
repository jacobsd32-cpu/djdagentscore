import { db } from './connection.js'

export interface ClusterAssignmentRow {
  id: number
  wallet: string
  cluster_id: string
  cluster_name: string
  confidence: number
  assigned_at: string
}

export interface ClusterMemberRow {
  wallet: string
  cluster_name: string
  confidence: number
  assigned_at: string
  current_score: number | null
  current_tier: string | null
}

const stmtGetClusterAssignmentByWallet = db.prepare<[string], ClusterAssignmentRow>(`
  SELECT id, wallet, cluster_id, cluster_name, confidence, assigned_at
  FROM cluster_assignments
  WHERE wallet = ?
  LIMIT 1
`)

const stmtInsertClusterAssignment = db.prepare(`
  INSERT INTO cluster_assignments (
    wallet,
    cluster_id,
    cluster_name,
    confidence,
    assigned_at
  ) VALUES (
    @wallet,
    @cluster_id,
    @cluster_name,
    @confidence,
    @assigned_at
  )
`)

const stmtUpdateClusterAssignment = db.prepare(`
  UPDATE cluster_assignments
  SET
    cluster_id = @cluster_id,
    cluster_name = @cluster_name,
    confidence = @confidence,
    assigned_at = @assigned_at
  WHERE wallet = @wallet
`)

const txUpsertClusterAssignment = db.transaction(
  (input: { wallet: string; cluster_id: string; cluster_name: string; confidence: number; assigned_at: string }) => {
    const result = stmtUpdateClusterAssignment.run(input)
    if (result.changes > 0) return
    stmtInsertClusterAssignment.run(input)
  },
)

export function getClusterAssignmentByWallet(wallet: string): ClusterAssignmentRow | undefined {
  return stmtGetClusterAssignmentByWallet.get(wallet)
}

export function upsertClusterAssignment(input: {
  wallet: string
  cluster_id: string
  cluster_name: string
  confidence: number
  assigned_at: string
}): void {
  txUpsertClusterAssignment(input)
}

export function listClusterMembers(
  clusterId: string,
  options: {
    limit: number
    excludeWallet?: string
  },
): ClusterMemberRow[] {
  let sql = `
    SELECT
      ca.wallet,
      ca.cluster_name,
      ca.confidence,
      ca.assigned_at,
      s.composite_score as current_score,
      s.tier as current_tier
    FROM cluster_assignments ca
    LEFT JOIN scores s ON s.wallet = ca.wallet
    WHERE ca.cluster_id = ?
  `
  const args: Array<string | number> = [clusterId]

  if (options.excludeWallet) {
    sql += ' AND ca.wallet != ?'
    args.push(options.excludeWallet)
  }

  sql += ' ORDER BY ca.confidence DESC, ca.assigned_at DESC LIMIT ?'
  args.push(options.limit)

  return db.prepare(sql).all(...args) as ClusterMemberRow[]
}

export function countClusterMembers(clusterId: string): number {
  return (
    db
      .prepare<[string], { count: number }>('SELECT COUNT(*) as count FROM cluster_assignments WHERE cluster_id = ?')
      .get(clusterId)?.count ?? 0
  )
}
