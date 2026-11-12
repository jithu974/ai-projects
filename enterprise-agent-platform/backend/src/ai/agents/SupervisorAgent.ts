import { aiClient } from '../client.js';
import { z } from 'zod';
import { Type, type Schema } from '@google/genai';

// 1. Define strict Enums for our specialist agents
export const AgentRoleSchema = z.enum(['RESEARCH', 'ANALYSIS', 'PROPOSAL', 'QUALITY']);
export type AgentRole = z.infer<typeof AgentRoleSchema>;

// 2. Define the schema for a single step in the plan
export const PlanStepSchema = z.object({
  stepNumber: z.number(),
  agentRole: AgentRoleSchema,
  instruction: z.string(),
  reasoning: z.string(),
});

// 3. Define the full Execution Plan schema
export const ExecutionPlanSchema = z.object({
  objective: z.string(),
  steps: z.array(PlanStepSchema),
});

export type ExecutionPlan = z.infer<typeof ExecutionPlanSchema>;

// 4. Gemini Schema definition
const geminiPlanSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    objective: { 
      type: Type.STRING, 
      description: "A clear, concise statement of the overall business goal." 
    },
    steps: {
      type: Type.ARRAY,
      description: "The sequential list of tasks required to achieve the objective.",
      items: {
        type: Type.OBJECT,
        properties: {
          stepNumber: { type: Type.INTEGER },
          agentRole: { 
            type: Type.STRING,
            enum: ['RESEARCH', 'ANALYSIS', 'PROPOSAL', 'QUALITY'],
            description: "The specific specialist agent assigned to this task."
          },
          instruction: { 
            type: Type.STRING,
            description: "The precise, detailed instruction given to the specialist agent."
          },
          reasoning: {
            type: Type.STRING,
            description: "Why this step and agent were chosen."
          }
        },
        required: ["stepNumber", "agentRole", "instruction", "reasoning"]
      }
    }
  },
  required: ["objective", "steps"]
};

export class SupervisorAgent {
  static async createPlan(request: string): Promise<ExecutionPlan> {
    const systemInstruction = `You are a Senior AI Agent Orchestrator for an enterprise automation platform.
Your job is to receive a natural language business request and decompose it into a structured, sequential execution plan.

Available Agents:
- RESEARCH: Retrieves facts, history, and documents.
- ANALYSIS: Evaluates facts, assesses risks, and identifies opportunities.
- PROPOSAL: Drafts communications and recommends next steps based on analysis.
- QUALITY: Reviews outputs for compliance and accuracy.

Rules:
1. Break the request down logically.
2. Agents must execute sequentially. For example, ANALYSIS cannot occur before RESEARCH.
3. Keep instructions precise and self-contained.`;

    const response = await aiClient.models.generateContent({
      model: process.env.MODEL || 'gemini-3.5-flash',
      contents: `Business Request: ${request}`,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: geminiPlanSchema,        
      }
    });

    if (!response.text) {
      throw new Error("Received empty response from Gemini API");
    }

    const rawData = JSON.parse(response.text);
    return ExecutionPlanSchema.parse(rawData);
  }
}