import { aiClient } from '../client.js';
import { z } from 'zod';
import { Type, type Schema } from '@google/genai';

export const ProposalOutputSchema = z.object({
  proposedActions: z.array(z.string()),
  draftEmailContent: z.string(),
  isReadyForApproval: z.boolean()
});
export type ProposalOutput = z.infer<typeof ProposalOutputSchema>;

const geminiProposalSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    proposedActions: { type: Type.ARRAY, items: { type: Type.STRING } },
    draftEmailContent: { type: Type.STRING },
    isReadyForApproval: { type: Type.BOOLEAN }
  },
  required: ["proposedActions", "draftEmailContent", "isReadyForApproval"]
};

export class ProposalAgent {
  static async execute(instruction: string, context: any): Promise<ProposalOutput> {
    const response = await aiClient.models.generateContent({
      model: process.env.MODEL || 'gemini-3.5-flash',
      contents: `Instruction: ${instruction}\n\nContext:\n${JSON.stringify(context, null, 2)}`,
      config: {
        systemInstruction: "You are an Enterprise Account Manager. Draft professional communications based on the analysis context.",
        responseMimeType: 'application/json',
        responseSchema: geminiProposalSchema,        
      }
    });
    return ProposalOutputSchema.parse(JSON.parse(response.text!));
  }
}