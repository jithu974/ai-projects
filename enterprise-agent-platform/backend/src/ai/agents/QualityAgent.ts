import { aiClient } from '../client.js';
import { z } from 'zod';
import { Type, type Schema } from '@google/genai';

export const QualityOutputSchema = z.object({
  status: z.enum(['approved', 'needs_revision', 'rejected']),
  feedback: z.string()
});
export type QualityOutput = z.infer<typeof QualityOutputSchema>;

const geminiQualitySchema: Schema = {
  type: Type.OBJECT,
  properties: {
    status: { type: Type.STRING, enum: ['approved', 'needs_revision', 'rejected'] },
    feedback: { type: Type.STRING }
  },
  required: ["status", "feedback"]
};

export class QualityAgent {
  static async execute(instruction: string, context: any): Promise<QualityOutput> {
    const response = await aiClient.models.generateContent({
      model: process.env.MODEL || 'gemini-3.5-flash-lite',
      contents: `Instruction: ${instruction}\n\nContext to review:\n${JSON.stringify(context, null, 2)}`,
      config: {
        systemInstruction: "You are a strict Quality and Compliance Reviewer. Ensure the proposed actions align with the research facts.",
        responseMimeType: 'application/json',
        responseSchema: geminiQualitySchema,
        temperature: 0.1,
      }
    });
    return QualityOutputSchema.parse(JSON.parse(response.text!));
  }
}