import { Injectable, OnModuleDestroy } from '@nestjs/common';

import { ES_DEFAULT_CLIENT_NAME } from './es.constants';
import type { ElasticsearchClient, ElasticsearchModuleOptions } from './es.interfaces';
import { createElasticsearchClient } from './es.utils';

@Injectable()
export class ElasticsearchService implements OnModuleDestroy {
    private readonly nameToClient = new Map<string, ElasticsearchClient>();

    configure(options: ElasticsearchModuleOptions): void {
        for (const def of options.clients) {
            const name = (def.name || ES_DEFAULT_CLIENT_NAME).toLowerCase();
            const client = createElasticsearchClient(def);
            this.nameToClient.set(name, client);
        }
    }

    get(name = ES_DEFAULT_CLIENT_NAME): ElasticsearchClient {
        const key = name.toLowerCase();
        const client = this.nameToClient.get(key);
        if (!client) throw new Error(`Elasticsearch client not found: ${name}`);
        return client;
    }

    async onModuleDestroy(): Promise<void> {
        const closers: Array<Promise<void>> = [];
        for (const client of this.nameToClient.values()) {
            try {
                closers.push(client.close());
            } catch {
                // ignore
            }
        }
        await Promise.allSettled(closers);
        this.nameToClient.clear();
    }
}
