import { db } from '../client.js';
import { type ExecutionPlan } from '../../ai/agents/SupervisorAgent.js';

export class TaskRepository {
  
  static async createTask(originalRequest: string): Promise<string> {
    const result = await db.query(
      `INSERT INTO tasks (original_request, status) VALUES ($1, $2) RETURNING id`,
      [originalRequest, 'planning']
    );
    return result.rows[0].id;
  }

  static async updateTaskStatus(taskId: string, status: string, error?: string): Promise<void> {
    await db.query(
      `UPDATE tasks SET status = $1, error = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
      [status, error || null, taskId]
    );
  }

  static async saveExecutionPlan(taskId: string, plan: ExecutionPlan): Promise<void> {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      
      // Save objective to audit log
      await client.query(
        `INSERT INTO audit_events (task_id, event_type, details) VALUES ($1, $2, $3)`,
        [taskId, 'PLAN_CREATED', JSON.stringify({ objective: plan.objective })]
      );

      // Save individual steps
      for (const step of plan.steps) {
        await client.query(
          `INSERT INTO task_steps (task_id, step_number, agent_role, instruction, reasoning) 
           VALUES ($1, $2, $3, $4, $5)`,
          [taskId, step.stepNumber, step.agentRole, step.instruction, step.reasoning]
        );
      }
      
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  static async saveAgentRun(taskId: string, agentRole: string, result: any): Promise<void> {
    await db.query(
      `INSERT INTO agent_runs (task_id, agent_role, result) VALUES ($1, $2, $3)`,
      [taskId, agentRole, JSON.stringify(result)]
    );
  }

  // Fetch full task history
  static async getTaskHistory(taskId: string): Promise<any> {
    const taskRes = await db.query(`SELECT * FROM tasks WHERE id = $1`, [taskId]);
    const stepsRes = await db.query(`SELECT * FROM task_steps WHERE task_id = $1 ORDER BY step_number ASC`, [taskId]);
    const runsRes = await db.query(`SELECT * FROM agent_runs WHERE task_id = $1 ORDER BY created_at ASC`, [taskId]);
    
    if (taskRes.rows.length === 0) return null;

    return {
      task: taskRes.rows[0],
      plan: stepsRes.rows,
      agentResults: runsRes.rows
    };
  }
}