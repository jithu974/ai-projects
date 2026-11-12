import { aiClient } from '../client.js';
import { z } from 'zod';
import { Type, type Schema } from '@google/genai';

export const AnalysisOutputSchema = z.object({
  riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  identifiedIssues: z.array(z.string()),
  renewalRecommendation: z.string()
});
export type AnalysisOutput = z.infer<typeof AnalysisOutputSchema>;

const geminiAnalysisSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    riskLevel: { type: Type.STRING, enum: ['LOW', 'MEDIUM', 'HIGH'] },
    identifiedIssues: { type: Type.ARRAY, items: { type: Type.STRING } },
    renewalRecommendation: { type: Type.STRING }
  },
  required: ["riskLevel", "identifiedIssues", "renewalRecommendation"]
};

export class AnalysisAgent {
  static async execute(instruction: string, context: any): Promise<AnalysisOutput> {
    const response = await aiClient.models.generateContent({
      model: process.env.MODEL || 'gemini-3.5-flash',
      contents: `Instruction: ${instruction}\n\nContext:\n${JSON.stringify(context, null, 2)}`,
      config: {
        systemInstruction: "You are a Senior Customer Success Analyst. Assess risks based ONLY on the provided context.",
        responseMimeType: 'application/json',
        responseSchema: geminiAnalysisSchema,        
      }
    });
    return AnalysisOutputSchema.parse(JSON.parse(response.text!));
  }
}