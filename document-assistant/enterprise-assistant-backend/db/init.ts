import pg = require('pg');
import dotenv = require('dotenv');
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function initDB() {
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS vector;

    CREATE TABLE IF NOT EXISTS documents (
      id SERIAL PRIMARY KEY,
      filename TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS document_chunks (
      id SERIAL PRIMARY KEY,
      document_id INT REFERENCES documents(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      metadata JSONB,
      embedding vector(1536) -- OpenAI text-embedding-3-small dimension
    );
  `);
  console.log("Database initialized");
  process.exit(0);
}
initDB();