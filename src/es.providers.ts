import type { Provider } from '@nestjs/common';

import type { ElasticsearchClient } from './es.interfaces';
import { EsRepository, getRepositoryToken, type Constructor } from './es.repository';
import { ElasticsearchService } from './es.service';

export const createElasticsearchProviders = (
    entities: Array<abstract new (...args: any[]) => object> = [],
    clientName?: string,
): Provider[] =>
    entities.map((entity) => ({
        provide: getRepositoryToken(entity, clientName),
        useFactory: (service: ElasticsearchService): EsRepository<any> => {
            const client: ElasticsearchClient = service.get(clientName);
            return new EsRepository(client, entity as Constructor<object>);
        },
        inject: [ElasticsearchService],
    }));
