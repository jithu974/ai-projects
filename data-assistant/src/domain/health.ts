export type DependencyStatus = 'up' | 'down';

export interface DependencyCheckResult {
  name: string;
  status: DependencyStatus;
  latencyMs: number;
  error?: string;
}

export interface IHealthCheckable {
  readonly name: string;
  checkHealth(): Promise<void>;
}