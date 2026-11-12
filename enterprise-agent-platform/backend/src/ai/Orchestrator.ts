import { SupervisorAgent, type ExecutionPlan } from './agents/SupervisorAgent.js';
import { ResearchAgent } from './agents/ResearchAgent.js';
import { AnalysisAgent } from './agents/AnalysisAgent.js';
import { ProposalAgent } from './agents/ProposalAgent.js';
import { QualityAgent } from './agents/QualityAgent.js';

// The shared memory for the workflow
export interface TaskState {
  originalRequest: string;
  plan?: ExecutionPlan;
  agentResults: Record<string, any>; // Keys will be step numbers or roles
  status: 'planning' | 'executing' | 'completed' | 'failed';
  error?: string;
}

export class Orchestrator {
  static async runWorkflow(request: string): Promise<TaskState> {
    const state: TaskState = {
      originalRequest: request,
      agentResults: {},
      status: 'planning'
    };

    try {
      console.log("Orchestrator: Asking Supervisor for plan...");
      state.plan = await SupervisorAgent.createPlan(request);
      state.status = 'executing';

      console.log(`Orchestrator: Plan created with ${state.plan.steps.length} steps. Executing...`);

      for (const step of state.plan.steps) {
        console.log(`\n--- Executing Step ${step.stepNumber}: ${step.agentRole} ---`);
        
        let result: any;
        
        // Dispatch to the correct agent, passing the current state as context
        switch (step.agentRole) {
          case 'RESEARCH':
            result = await ResearchAgent.execute(step.instruction, state.agentResults);
            break;
          case 'ANALYSIS':
            result = await AnalysisAgent.execute(step.instruction, state.agentResults);
            break;
          case 'PROPOSAL':
            result = await ProposalAgent.execute(step.instruction, state.agentResults);
            break;
          case 'QUALITY':
            result = await QualityAgent.execute(step.instruction, state.agentResults);
            break;
          default:
            throw new Error(`Unknown agent role: ${step.agentRole}`);
        }

        // Save the result into the shared state
        state.agentResults[`step_${step.stepNumber}_${step.agentRole}`] = result;
        console.log(`${step.agentRole} completed.`);
      }

      state.status = 'completed';
      console.log("\nOrchestrator: Workflow completed successfully.");
      return state;

    } catch (error: any) {
      console.error("Orchestrator encountered an error:", error);
      state.status = 'failed';
      state.error = error.message;
      return state;
    }
  }
}