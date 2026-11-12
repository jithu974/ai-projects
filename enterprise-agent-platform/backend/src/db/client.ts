import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Initialize the PostgreSQL connection pool
export const db = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// A simple script to initialize our tables automatically on startup
export const initializeDatabase = async () => {
  const client = await db.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        original_request TEXT NOT NULL,
        status VARCHAR(50) NOT NULL,
        error TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS task_steps (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
        step_number INT NOT NULL,
        agent_role VARCHAR(50) NOT NULL,
        instruction TEXT NOT NULL,
        reasoning TEXT
      );

      CREATE TABLE IF NOT EXISTS agent_runs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
        agent_role VARCHAR(50) NOT NULL,
        result JSONB NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- We create the approvals and audit_events tables now for Phase 7
      CREATE TABLE IF NOT EXISTS approvals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
        proposed_action TEXT NOT NULL,
        payload JSONB,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        resolved_at TIMESTAMP WITH TIME ZONE
      );

      CREATE TABLE IF NOT EXISTS audit_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
        event_type VARCHAR(100) NOT NULL,
        details JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("Database tables initialized successfully.");
  } finally {
    client.release();
  }
};