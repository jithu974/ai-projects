import { db } from '../db/client.js';
import { sendCustomerEmail } from '../tools/writeTools.js';

export class ApprovalService {
  
  static async createApprovalRequest(taskId: string, action: string, payload: any): Promise<string> {
    const result = await db.query(
      `INSERT INTO approvals (task_id, proposed_action, payload, status) 
       VALUES ($1, $2, $3, 'pending') RETURNING id`,
      [taskId, action, JSON.stringify(payload)]
    );
    return result.rows[0].id;
  }

  static async getPendingApprovals(taskId: string): Promise<any[]> {
    const result = await db.query(
      `SELECT * FROM approvals WHERE task_id = $1 ORDER BY created_at DESC`,
      [taskId]
    );
    return result.rows;
  }

  static async approveAndExecute(approvalId: string): Promise<any> {
    const client = await db.connect();
    
    try {
      await client.query('BEGIN');
      
      // 1. Idempotency Lock: We only update if it's currently 'pending'.
      // The FOR UPDATE clause locks the row against concurrent requests.
      const approvalRes = await client.query(
        `SELECT * FROM approvals WHERE id = $1 AND status = 'pending' FOR UPDATE`,
        [approvalId]
      );

      if (approvalRes.rows.length === 0) {
        throw new Error("Approval record not found or already processed.");
      }

      const approval = approvalRes.rows[0];

      // 2. Mark as executing so it can't be picked up again
      await client.query(
        `UPDATE approvals SET status = 'executing' WHERE id = $1`,
        [approvalId]
      );

      // 3. Execute the actual external system tool based on the proposed action
      let executionResult;
      if (approval.proposed_action === 'SEND_EMAIL') {
        // payload expects { customerId: string, content: string }
        executionResult = await sendCustomerEmail(approval.payload.customerId, approval.payload.content);
      } else {
        throw new Error(`Unsupported action type: ${approval.proposed_action}`);
      }

      // 4. Mark completed and audit
      await client.query(
        `UPDATE approvals SET status = 'approved', resolved_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [approvalId]
      );

      await client.query(
        `INSERT INTO audit_events (task_id, event_type, details) VALUES ($1, $2, $3)`,
        [approval.task_id, 'ACTION_EXECUTED', JSON.stringify({ action: approval.proposed_action, executionResult })]
      );

      await client.query('COMMIT');
      return executionResult;

    } catch (e) {
      await client.query('ROLLBACK');
      
      // If the actual execution failed (e.g., SendGrid is down), mark it failed so a human can retry later
      await db.query(
        `UPDATE approvals SET status = 'failed', resolved_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [approvalId]
      );
      
      throw e;
    } finally {
      client.release();
    }
  }

  static async reject(approvalId: string): Promise<void> {
    const result = await db.query(
      `UPDATE approvals SET status = 'rejected', resolved_at = CURRENT_TIMESTAMP 
       WHERE id = $1 AND status = 'pending' RETURNING id`,
      [approvalId]
    );

    if (result.rows.length === 0) {
      throw new Error("Approval record not found or already processed.");
    }
  }
}