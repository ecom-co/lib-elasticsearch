// Optional health indicator for @nestjs/terminus users.
// This file imports from @nestjs/terminus only when used in the app.

import type { Client } from '@elastic/elasticsearch';
import type { HealthIndicatorResult } from '@nestjs/terminus';

/**
 * Check Elasticsearch cluster health and return health indicator result.
 * @param {Client} client - Elasticsearch client instance
 * @param {string} [key='elasticsearch'] - Health indicator key name
 * @returns {Promise<HealthIndicatorResult>} Health indicator result with cluster status
 * @example
 * const health = await checkElasticsearchHealthy(client, 'es-cluster');
 * console.log(health.elasticsearch.status); // 'up'
 */
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
