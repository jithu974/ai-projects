import { aiClient } from '../client.js';
import { z } from 'zod';
import { Type } from '@google/genai';
// 1. Define the Zod schema for strict runtime validation
export const ResearchOutputSchema = z.object({
    customerName: z.string(),
    foundInformation: z.array(z.string()),
    missingInformation: z.array(z.string()),
    summary: z.string(),
});
// 2. Define the equivalent Gemini Schema to guide the model's output
const geminiResearchSchema = {
    type: Type.OBJECT,
    properties: {
        customerName: {
            type: Type.STRING,
            description: "Name of the customer being researched. Default to 'Unknown' if not found."
        },
        foundInformation: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Specific facts, contract details, or history extracted from the query."
        },
        missingInformation: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Important information that was requested or implied but is missing from the context."
        },
        summary: {
            type: Type.STRING,
            description: "A concise, professional summary of the current customer state."
        }
    },
    required: ["customerName", "foundInformation", "missingInformation", "summary"]
};
export class ResearchAgent {
    static async execute(query) {
        const systemInstruction = `You are a Senior Enterprise Customer Research Specialist. 
Your job is to extract and structure factual customer information from the provided context.
Do not invent information. If something is unknown, place it in the missingInformation array.`;
        const response = await aiClient.models.generateContent({
            model: process.env.MODEL || 'gemini-3.5-flash',
            contents: `Context/Query to analyze: ${query}`,
            config: {
                systemInstruction,
                responseMimeType: 'application/json',
                responseSchema: geminiResearchSchema,
            }
        });
        if (!response.text) {
            throw new Error("Received empty response from Gemini API");
        }
        // 3. Parse the JSON and validate against our strict Zod schema
        const rawData = JSON.parse(response.text);
        return ResearchOutputSchema.parse(rawData);
    }
}
//# sourceMappingURL=ResearchAgent.js.map