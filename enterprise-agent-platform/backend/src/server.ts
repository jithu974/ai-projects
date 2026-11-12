import Fastify from 'fastify';
import cors from '@fastify/cors';
import { aiClient } from './ai/client.js';
import dotenv from 'dotenv';
import { ResearchAgent } from './ai/agents/ResearchAgent.js';
import { SupervisorAgent } from './ai/agents/SupervisorAgent.js';

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
      model: process.env.MODEL || 'gemini-3.5-flash',
      contents: 'You are an enterprise AI assistant. Reply with "Gemini API connection established successfully." and nothing else.',
    });
    
    return { success: true, message: response.text };
  } catch (error: any) {
    server.log.error(error);
    return reply.status(500).send({ success: false, error: error.message });
  }
});

// Test the Supervisor Agent
server.post('/api/test-supervisor', async (request, reply) => {
  try {
    // The exact use case from your business context
    const mockRequest = "Investigate customer ABC Ltd. Retrieve their account information, contract details and support ticket history. Identify unresolved issues and renewal risks. Prepare a renewal recommendation and draft a professional customer email. Show me the results for approval before making any changes.";
    
    const plan = await SupervisorAgent.createPlan(mockRequest);
    return { success: true, data: plan };
  } catch (error: any) {
    server.log.error(error);
    return reply.status(500).send({ success: false, error: error.message });
  }
});

// Test the structured Research Agent
server.post('/api/test-research', async (request, reply) => {
  try {
    // Mock user input for this phase
    const mockQuery = "Investigate customer ABC Ltd. We know their Enterprise plan expires in 30 days. We need their support ticket history and account manager details, but I don't have that right now.";
    
    const result = await ResearchAgent.execute(mockQuery);
    return { success: true, data: result };
  } catch (error: any) {
      server.log.error(error);
      return reply.status(500).send({ success: false, error: error.message });
  }
});

const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '3000');
    await server.listen({ port, host: '0.0.0.0' });
    console.log(`Backend running on http://localhost:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();