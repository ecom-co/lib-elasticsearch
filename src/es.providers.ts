import type { Provider } from '@nestjs/common';

import { type Constructor, EsRepository, getRepositoryToken } from './es.repository';
import { ElasticsearchService } from './es.service';

import type { ElasticsearchClient } from './es.interfaces';

export const createElasticsearchProviders = (
    entities: Array<abstract new (...args: unknown[]) => object> = [],
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
