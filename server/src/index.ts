// Express API server for Syntax AI backend

import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { processChatMessage } from './services/chatService.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 5001;

app.use(cors({ origin: process.env.CLIENT_URL || '*' }));
app.use(express.json());

app.post('/api/chat', async (req: Request, res: Response) => {
  try {
    const { message, history, mode } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message payload is required.' });
    }

    const reply = await processChatMessage(message, history || [], mode);
    return res.json({ reply });
  } catch (error: any) {
    console.error('API Error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.listen(port, () => {
  console.log(`Syntax AI backend listening on port ${port}`);
});