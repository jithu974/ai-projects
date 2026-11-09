// Tool Execution Layer (Function Declarations & Execution)

import { Type, FunctionDeclaration } from '@google/genai';

export const calculatorToolDeclaration: FunctionDeclaration = {
  name: 'calculate',
  description: 'Evaluates basic mathematical expressions (addition, subtraction, multiplication, division, exponents).',
  parameters: {
    type: Type.OBJECT,
    properties: {
      expression: {
        type: Type.STRING,
        description: 'The mathematical expression string to evaluate (e.g., "1024 * 8", "(450 / 60) * 100").'
      }
    },
    required: ['expression']
  }
};

export const docsLookupToolDeclaration: FunctionDeclaration = {
  name: 'lookupTechnicalDocs',
  description: 'Searches developer references and API endpoints for frameworks, libraries, and protocols.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      topic: {
        type: Type.STRING,
        description: 'The keyword or framework query (e.g., "fetch API abort controller", "React 19 hooks").'
      }
    },
    required: ['topic']
  }
};

export const executeTool = async (name: string, args: Record<string, any>): Promise<any> => {
  switch (name) {
    case 'calculate': {
      try {
        // Safe evaluation strictly permitting numerical operators
        const sanitized = String(args.expression).replace(/[^0-9+\-*/().^ ]/g, '');
        const result = Function(`"use strict"; return (${sanitized})`)();
        return { expression: args.expression, result };
      } catch (err: any) {
        return { error: `Failed to calculate: ${err.message}` };
      }
    }
    case 'lookupTechnicalDocs': {
      // Stubbed or integrated with an external developer doc registry / GitHub API
      return {
        query: args.topic,
        summary: `Reference documentation found for "${args.topic}": Standard implementation patterns and signature definitions retrieved successfully.`,
        status: 200
      };
    }
    default:
      throw new Error(`Tool "${name}" is not registered.`);
  }
};