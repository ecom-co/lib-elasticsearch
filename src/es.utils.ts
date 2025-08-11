import { Client } from '@elastic/elasticsearch';

import type { ElasticsearchClient, ElasticsearchClientOptions } from './es.interfaces';

export const createElasticsearchClient = (options: ElasticsearchClientOptions): ElasticsearchClient =>
    // Pass all options directly; user must supply node(s)/auth/etc. per @elastic/elasticsearch API
    new Client(options);

export const normalizeName = (name?: string): string => (name?.trim() || 'default').toLowerCase();
