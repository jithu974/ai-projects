import { Type, type FunctionDeclaration, type Tool } from '@google/genai';

// 1. The actual backend functions (simulating a database or CRM API)
const mockDatabase = {
  customers: {
    "CUST-001": { id: "CUST-001", name: "ABC Ltd", industry: "Logistics", mrr: 5000, status: "Active" }
  },
  contracts: {
    "CUST-001": { type: "Enterprise Plus", expiresAt: "2026-12-15", renewalValue: 60000, autoRenew: false }
  },
  tickets: {
    "CUST-001": [
      { id: "T-89", status: "Closed", issue: "Onboarding setup", priority: "High" },
      { id: "T-102", status: "Open", issue: "API rate limits blocking production", priority: "Critical" },
      { id: "T-105", status: "Open", issue: "Billing discrepancy on last invoice", priority: "Medium" }
    ]
  }
};

export const getCustomerByName = async (args: { name: string }) => {
  console.log(`[TOOL EXECUTION] getCustomerByName: ${args.name}`);
  // Simple mock search
  const cust = Object.values(mockDatabase.customers).find(c => c.name.toLowerCase().includes(args.name.toLowerCase()));
  return cust ? cust : { error: "Customer not found" };
};

export const getCustomerContract = async (args: { customerId: string }) => {
  console.log(`[TOOL EXECUTION] getCustomerContract: ${args.customerId}`);
  return mockDatabase.contracts[args.customerId as keyof typeof mockDatabase.contracts] || { error: "No contract found" };
};

export const getCustomerTickets = async (args: { customerId: string }) => {
  console.log(`[TOOL EXECUTION] getCustomerTickets: ${args.customerId}`);
  return mockDatabase.tickets[args.customerId as keyof typeof mockDatabase.tickets] || [];
};

// 2. The registry that maps function names to actual executable code
export const toolRegistry: Record<string, (args: any) => Promise<any>> = {
  getCustomerByName,
  getCustomerContract,
  getCustomerTickets
};

// 3. The Gemini Function Declarations (telling the LLM how to use them)
export const crmToolsDeclaration: Tool = {
  functionDeclarations: [
    {
      name: "getCustomerByName",
      description: "Search for a customer by their company name to retrieve their customerId and basic details.",
      parameters: {
        type: Type.OBJECT,
        properties: { name: { type: Type.STRING, description: "The company name, e.g., 'ABC Ltd'" } },
        required: ["name"]
      }
    },
    {
      name: "getCustomerContract",
      description: "Get contract details and expiration dates for a specific customerId.",
      parameters: {
        type: Type.OBJECT,
        properties: { customerId: { type: Type.STRING } },
        required: ["customerId"]
      }
    },
    {
      name: "getCustomerTickets",
      description: "Get recent support tickets and their statuses for a specific customerId.",
      parameters: {
        type: Type.OBJECT,
        properties: { customerId: { type: Type.STRING } },
        required: ["customerId"]
      }
    }
  ]
};