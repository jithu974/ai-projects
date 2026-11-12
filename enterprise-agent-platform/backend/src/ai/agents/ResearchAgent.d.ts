import { z } from 'zod';
export declare const ResearchOutputSchema: z.ZodObject<{
    customerName: z.ZodString;
    foundInformation: z.ZodArray<z.ZodString>;
    missingInformation: z.ZodArray<z.ZodString>;
    summary: z.ZodString;
}, z.core.$strip>;
export type ResearchOutput = z.infer<typeof ResearchOutputSchema>;
export declare class ResearchAgent {
    static execute(query: string): Promise<ResearchOutput>;
}
//# sourceMappingURL=ResearchAgent.d.ts.map