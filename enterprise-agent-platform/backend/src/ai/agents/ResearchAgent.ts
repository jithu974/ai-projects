import { aiClient } from '../client.js';
import { z } from 'zod';
import { Type, type Schema, type Content, type Part } from '@google/genai';
import { crmToolsDeclaration, toolRegistry } from '../../tools/crmTools.js';

// 1. Zod Schema
export const ResearchOutputSchema = z.object({
  customerName: z.string(),
  foundInformation: z.array(z.string()),
  missingInformation: z.array(z.string()),
  summary: z.string(),
});
export type ResearchOutput = z.infer<typeof ResearchOutputSchema>;

// 2. Gemini Schema
const geminiResearchSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    customerName: { type: Type.STRING },
    foundInformation: { type: Type.ARRAY, items: { type: Type.STRING } },
    missingInformation: { type: Type.ARRAY, items: { type: Type.STRING } },
    summary: { type: Type.STRING }
  },
  required: ["customerName", "foundInformation", "missingInformation", "summary"]
};

export class ResearchAgent {
  static async execute(instruction: string, context: any): Promise<ResearchOutput> {
    const systemInstruction = `You are a Senior Enterprise Customer Research Specialist. 
Use the provided tools to gather facts about the customer. 
You MUST call getCustomerByName first to get the customerId, then use that ID to fetch contracts and tickets.
Extract facts carefully.`;

    // To use tools, we must maintain conversational history.
    const history: Content[] = [
      { role: 'user', parts: [{ text: `Instruction: ${instruction}\n\nContext:\n${JSON.stringify(context, null, 2)}` }] }
    ];

    const modelName = process.env.MODEL || 'gemini-3.5-flash-lite';
    let maxLoops = 5; // Safety circuit breaker

    while (maxLoops > 0) {
      maxLoops--;
      
      const response = await aiClient.models.generateContent({
        model: modelName,
        contents: history,
        config: {
          systemInstruction,
          tools: [crmToolsDeclaration], // Give the model the tools          
          // IMPORTANT: If we want JSON output at the end, we can only enforce it when NOT calling a tool.
          // For simplicity in this manual loop, we let the model respond naturally until it stops calling tools.
        }
      });

      const candidateContent = response.candidates?.[0]?.content;
      if (!candidateContent) {
        throw new Error("Invalid response candidate from model.");
      }

      const functionCalls = response.functionCalls;

      // If the model called tools, execute them and continue the loop
      if (functionCalls && functionCalls.length > 0) {
        // Keep tool-call and tool-response turns paired in history.
        history.push(candidateContent);
        const functionResponses: Part[] = [];

        for (const call of functionCalls) {
          const fnName = call.name;
          const fnArgs = call.args;

          if (!fnName) {
            throw new Error("Model returned a function call without a name.");
          }

          if (toolRegistry[fnName]) {
            try {
              const result = await toolRegistry[fnName](fnArgs);
              functionResponses.push({
                functionResponse: {
                  name: fnName,
                  response: { result }
                }
              });
            } catch (err: any) {
               functionResponses.push({
                functionResponse: {
                  name: fnName,
                  response: { error: err.message }
                }
              });
            }
          } else {
             functionResponses.push({
                functionResponse: {
                  name: fnName,
                  response: { error: "Function not found in registry" }
                }
              });
          }
        }

        // Pass the execution results back to the model as the 'user'
        history.push({ role: 'user', parts: functionResponses });
        continue; // Loop again so the model can evaluate the tool results
      }

      // If we reach here, the model did not call any tools. It is ready to give the final answer.
      // We do one final generation, forcing the JSON schema now that the model has all the data in its history.
      const finalResponse = await aiClient.models.generateContent({
        model: modelName,
        contents: history,
        config: {
          systemInstruction,
          responseMimeType: 'application/json', // Force structured output
          responseSchema: geminiResearchSchema,
        }
      });

      if (!finalResponse.text) throw new Error("Empty final response");
      return ResearchOutputSchema.parse(JSON.parse(finalResponse.text));
    }

    throw new Error("Research Agent exceeded maximum tool calling loops.");
  }
}