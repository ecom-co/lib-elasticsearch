/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Provider } from '@nestjs/common';

import { type Constructor, EsRepository, getRepositoryToken } from './es.repository';
import { ElasticsearchService } from './es.service';

import type { ElasticsearchClient } from './es.interfaces';

/**
 * Create providers for Elasticsearch repositories for the given entities.
 * @param {Array<abstract new (...args: any[]) => object>} [entities=[]] - Array of entity constructors
 * @param {string} [clientName] - Optional client name to use for repositories
 * @returns {Provider[]} Array of NestJS providers for the repositories
 * @example
 * const providers = createElasticsearchProviders([User, Product], 'secondary');
 */
export const createElasticsearchProviders = (
    entities: Array<abstract new (...args: any[]) => object> = [],
    clientName?: string,
): Provider[] =>
    entities.map((entity) => ({
        inject: [ElasticsearchService],
        provide: getRepositoryToken(entity, clientName),
        useFactory: (service: ElasticsearchService): EsRepository<object> => {
            const client: ElasticsearchClient = service.get(clientName);

            return new EsRepository(client, entity as Constructor<object>);
        },
    }));
