import Fastify from 'fastify';
import cors from '@fastify/cors';
import { aiClient } from './ai/client.js';
import dotenv from 'dotenv';
import { Orchestrator } from './ai/Orchestrator.js';
import { initializeDatabase } from './db/client.js';
import { TaskRepository } from './db/repositories/TaskRepository.js';

dotenv.config();

const server = Fastify({
  logger: true // We will replace this with Pino structured logging in Phase 9
});

// Allow frontend to communicate with backend
server.register(cors, { 
  origin: 'http://localhost:5173' 
});

server.get('/api/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

server.post('/api/test-ai', async (request, reply) => {
  try {
    const response = await aiClient.models.generateContent({
      model: process.env.MODEL || 'gemini-3.5-flash-lite',
      contents: 'You are an enterprise AI assistant. Reply with "Gemini API connection established successfully." and nothing else.',
    });
    
    return { success: true, message: response.text };
  } catch (error: any) {
    server.log.error(error);
    return reply.status(500).send({ success: false, error: error.message });
  }
});

// Run the full orchestrated workflow
server.post('/api/run-workflow', async (request, reply) => {
  try {
    const mockRequest = "Investigate customer ABC Ltd. Retrieve their account information, contract details and support ticket history. Identify unresolved issues and renewal risks. Prepare a renewal recommendation and draft a professional customer email. Show me the results for approval before making any changes.";
    
    // This will take 10-20 seconds to run through all 4 models sequentially
    const finalState = await Orchestrator.runWorkflow(mockRequest);
    
    return { success: true, data: finalState };
  } catch (error: any) {
    server.log.error(error);
    return reply.status(500).send({ success: false, error: error.message });
  }
});

// NEW ENDPOINT: Fetch a task by ID from PostgreSQL
server.get('/api/tasks/:id', async (request: any, reply) => {
  try {
    const taskId = request.params.id;
    const history = await TaskRepository.getTaskHistory(taskId);
    if (!history) {
      return reply.status(404).send({ success: false, error: "Task not found" });
    }
    return { success: true, data: history };
  } catch (error: any) {
    server.log.error(error);
    return reply.status(500).send({ success: false, error: error.message });
  }
});

const start = async () => {
  try {
    // Wait for the database schema to be created before starting the server
    await initializeDatabase();
    
    const port = parseInt(process.env.PORT || '3000');
    await server.listen({ port, host: '0.0.0.0' });
    console.log(`Backend running on http://localhost:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();