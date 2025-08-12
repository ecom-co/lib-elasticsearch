import { Injectable, Logger, OnModuleDestroy, type LoggerService } from '@nestjs/common';

import { ES_DEFAULT_CLIENT_NAME } from './es.constants';
import type { ElasticsearchClient, ElasticsearchModuleOptions } from './es.interfaces';
import { createElasticsearchClient } from './es.utils';

@Injectable()
export class ElasticsearchService implements OnModuleDestroy {
    private readonly nameToClient = new Map<string, ElasticsearchClient>();
    private logger: LoggerService = new Logger(ElasticsearchService.name);

    configure(options: ElasticsearchModuleOptions): void {
        if (options.logger) this.logger = options.logger;
        for (const def of options.clients) {
            const name = (def.name || ES_DEFAULT_CLIENT_NAME).toLowerCase();
            const client = createElasticsearchClient(def);
            this.nameToClient.set(name, client);
            this.attachLogs(name, client);
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

    private attachLogs(name: string, client: ElasticsearchClient): void {
        const label = `es:${name}`;
        // Low-level client exposes events via Transport. We can log request/response and errors.
        const anyClient = client as unknown as {
            transport?: {
                on: (event: 'request' | 'response' | 'sniff', listener: (...args: any[]) => void) => void;
                emitter?: { on: (event: 'resurrect' | 'sniff', listener: (...args: any[]) => void) => void };
            };
            on?: (
                event: 'resurrect' | 'sniff' | 'response' | 'request' | 'error',
                listener: (...args: any[]) => void,
            ) => void;
        };
        try {
            anyClient.on?.('error', (err: unknown) => {
                this.logger.error?.(`${label} error`, (err as Error)?.stack);
            });
            anyClient.transport?.on?.('request', () => {
                this.logger.verbose?.(`${label} request`);
            });
            anyClient.transport?.on?.('response', () => {
                this.logger.verbose?.(`${label} response`);
            });
            anyClient.transport?.emitter?.on?.('resurrect', () => {
                this.logger.warn?.(`${label} resurrect`);
            });
            anyClient.transport?.on?.('sniff', () => {
                this.logger.log?.(`${label} sniff`);
            });
        } catch {
            // ignore if transport/on not available (older client)
        }
    }
}
