import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error("CRITICAL: GEMINI_API_KEY is not set in backend/.env");
  process.exit(1);
}

// Initialize the official Google Gen AI SDK
export const aiClient = new GoogleGenAI({ apiKey });