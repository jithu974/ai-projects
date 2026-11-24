import { SupervisorAgent, type ExecutionPlan } from './agents/SupervisorAgent.js';
import { ResearchAgent } from './agents/ResearchAgent.js';
import { AnalysisAgent } from './agents/AnalysisAgent.js';
import { ProposalAgent, type ProposalOutput } from './agents/ProposalAgent.js';
import { QualityAgent, type QualityOutput } from './agents/QualityAgent.js';
import { TaskRepository } from '../db/repositories/TaskRepository.js';
import { ApprovalService } from '../services/ApprovalService.js';

// The shared memory for the workflow
export interface TaskState {
  taskId?: string; // Will be set after the task is created in the database
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
      // 1. Persist initial task creation
      state.taskId = await TaskRepository.createTask(request);
      console.log(`[DB] Task created with ID: ${state.taskId}`);

      console.log("Orchestrator: Asking Supervisor for plan...");
      state.plan = await SupervisorAgent.createPlan(request);

      // 2. Persist the execution plan
      await TaskRepository.saveExecutionPlan(state.taskId, state.plan);
      await TaskRepository.updateTaskStatus(state.taskId, 'executing');

      state.status = 'executing';
      console.log(`[DB] Plan saved.`);

      // 1. Add the isReadyForApproval flag
      let qualityPassed = false;
      let draftedEmailContent = "";
      let isReadyForApproval = false;

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
            // 2. Capture the agent's readiness assessment
            const proposal = result as ProposalOutput;
            draftedEmailContent = proposal.draftEmailContent;
            isReadyForApproval = proposal.isReadyForApproval;
            break;
          case 'QUALITY':
            result = await QualityAgent.execute(step.instruction, state.agentResults);
            qualityPassed = (result as QualityOutput).status === 'approved';
            break;
          default:
            throw new Error(`Unknown agent role: ${step.agentRole}`);
        }

        // 3. Persist the individual agent's result immediately
        await TaskRepository.saveAgentRun(state.taskId, step.agentRole, result);
        state.agentResults[`step_${step.stepNumber}_${step.agentRole}`] = result;
        console.log(`[DB] Saved ${step.agentRole} result.`);
      }

      // Intercept workflow completion to create an approval request if needed
      if (state.taskId && qualityPassed && isReadyForApproval && draftedEmailContent) {
        console.log(`\n[ORCHESTRATOR] Quality checks passed. Creating human approval request for email dispatch.`);
        
        // We extract customer ID from the Research results (assuming step 1 was research)
        const researchResult = state.agentResults['step_1_RESEARCH'];
        const customerId = researchResult.customerId || "CUST-001"; // Hardcoded safely here, normally derived from researchResult.customerId if we added it to the schema

        await ApprovalService.createApprovalRequest(
          state.taskId, 
          'SEND_EMAIL', 
          { customerId: customerId, content: state.agentResults['step_4_QUALITY'].draftedEmailContent }
        );
      }

      // 4. Mark complete
      await TaskRepository.updateTaskStatus(state.taskId, 'completed');
      state.status = 'completed';
      console.log("\nOrchestrator: Workflow completed successfully.");

      return state;

    } catch (error: any) {
      console.error("Orchestrator encountered an error:", error);
      if (state.taskId) {
         await TaskRepository.updateTaskStatus(state.taskId, 'failed', error.message);
      }
      state.status = 'failed';
      state.error = error.message;
      return state;
    }
  }
}