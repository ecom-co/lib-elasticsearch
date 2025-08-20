// Optional health indicator for @nestjs/terminus users.
// This file imports from @nestjs/terminus only when used in the app.

import type { Client } from '@elastic/elasticsearch';
import type { HealthIndicatorResult } from '@nestjs/terminus';

export const checkElasticsearchHealthy = async (
    client: Client,
    key = 'elasticsearch',
): Promise<HealthIndicatorResult> => {
    const start = Date.now();
    const info = await client.info();
    const ms = Date.now() - start;
    const clusterName = (info as unknown as { name?: string })?.name ?? 'unknown';

    return {
        [key]: {
            status: 'up',
            cluster: clusterName,
            latencyMs: ms,
        },
    } satisfies HealthIndicatorResult;
};
