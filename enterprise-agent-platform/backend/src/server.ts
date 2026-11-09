import Fastify from 'fastify';
import cors from '@fastify/cors';
import { aiClient } from './ai/client.js';
import dotenv from 'dotenv';

dotenv.config();

const server = Fastify({
  logger: true // We will replace this with Pino structured logging in Phase 9
});

// Allow frontend to communicate with backend
server.register(cors, { 
  origin: 'http://localhost:5173' 
});

server.get('/api/health', async (request, reply) => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

server.post('/api/test-ai', async (request, reply) => {
  try {
    const response = await aiClient.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: 'You are an enterprise AI assistant. Reply with "Gemini API connection established successfully." and nothing else.',
    });
    
    return { success: true, message: response.text };
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