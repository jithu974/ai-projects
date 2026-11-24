import type { DependencyCheckResult, IHealthCheckable } from '../domain/health.js';
import { withTimeout } from '../shared/timeout.js';

export interface ReadinessReport {
  status: 'ready' | 'not_ready';
  timestamp: string;
  dependencies: DependencyCheckResult[];
}

export class CheckReadinessUseCase {
  constructor(
    private readonly dependencies: readonly IHealthCheckable[],
    private readonly timeoutMs: number,
  ) {}

  async execute(): Promise<ReadinessReport> {
    const results = await Promise.all(
      this.dependencies.map(async (dep): Promise<DependencyCheckResult> => {
        const startedAt = performance.now();
        try {
          await withTimeout(dep.checkHealth(), this.timeoutMs, `${dep.name} health check`);
          return {
            name: dep.name,
            status: 'up',
            latencyMs: Math.round(performance.now() - startedAt),
          };
        } catch (err) {
          return {
            name: dep.name,
            status: 'down',
            latencyMs: Math.round(performance.now() - startedAt),
            error: err instanceof Error ? err.message : 'Unknown error',
          };
        }
      }),
    );

    const allUp = results.every((r) => r.status === 'up');
    return {
      status: allUp ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
      dependencies: results,
    };
  }
}