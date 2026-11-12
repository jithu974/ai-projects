// Gemini Chat Service with Function Calling Loop

import { GoogleGenAI } from '@google/genai';
import { SYSTEM_INSTRUCTION } from '../prompts/systemInstructions.js';
import { calculatorToolDeclaration, docsLookupToolDeclaration, executeTool } from '../tools/index.js';

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export const processChatMessage = async (
  message: string,
  history: ChatMessage[] = [],
  mode?: 'json' | 'default'
) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is missing. Set it in server/.env and restart the backend.');
  }
  const ai = new GoogleGenAI({ apiKey });
  const modelName = 'gemini-3.5-flash-lite-lite';//'gemini-3.8-flash';

  const contents = [
    ...history.map((msg) => ({
      role: msg.role,
      parts: [{ text: msg.text }]
    })),
    {
      role: 'user',
      parts: [{ text: message }]
    }
  ];

  const config: any = {
    systemInstruction: SYSTEM_INSTRUCTION    
  };

  if (mode === 'json') {
    config.responseMimeType = 'application/json';
  } else {
    config.tools = [{ functionDeclarations: [calculatorToolDeclaration, docsLookupToolDeclaration] }];
  }

  // Initial call to Gemini
  let response = await ai.models.generateContent({
    model: modelName,
    contents,
    config
  });

  // Handle iterative function calling
  while (response.functionCalls && response.functionCalls.length > 0) {
    const call = response.functionCalls[0];
    if (!call.name || !call.args) {
      throw new Error('Function call is missing name or arguments.');
    }
    const toolResult = await executeTool(call.name, call.args);

    // Append function call and function response into conversation turns
    contents.push({
      role: 'model',
      parts: [{ functionCall: call }]
    } as any);

    contents.push({
      role: 'user',
      parts: [
        {
          functionResponse: {
            name: call.name,
            response: toolResult
          }
        }
      ]
    } as any);

    response = await ai.models.generateContent({
      model: modelName,
      contents,
      config
    });
  }

  return response.text;
};