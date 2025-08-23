import { Injectable, Logger, type LoggerService, OnModuleDestroy } from '@nestjs/common';

import { ES_DEFAULT_CLIENT_NAME } from './es.constants';
import { createElasticsearchClient } from './es.utils';

import type { ElasticsearchClient, ElasticsearchModuleOptions } from './es.interfaces';

/**
 * Service for managing Elasticsearch clients with logging and lifecycle management.
 */
@Injectable()
export class ElasticsearchService implements OnModuleDestroy {
    private logger: LoggerService = new Logger(ElasticsearchService.name);
    private readonly nameToClient = new Map<string, ElasticsearchClient>();

    /**
     * Clean up all Elasticsearch clients when module is destroyed.
     * @returns {Promise<void>} Promise that resolves when all clients are closed
     */
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

    /**
     * Get an Elasticsearch client by name.
     * @param {string} [name=ES_DEFAULT_CLIENT_NAME] - Client name to retrieve
     * @returns {ElasticsearchClient} The Elasticsearch client instance
     * @throws {Error} If client with given name is not found
     * @example
     * const client = service.get(); // Default client
     * const secondary = service.get('secondary'); // Named client
     */
    get(name = ES_DEFAULT_CLIENT_NAME): ElasticsearchClient {
        const key = name.toLowerCase();
        const client = this.nameToClient.get(key);

        if (!client) throw new Error(`Elasticsearch client not found: ${name}`);

        return client;
    }

    /**
     * Configure the service with client options and logger.
     * @param {ElasticsearchModuleOptions} options - Module configuration options
     * @returns {void}
     * @example
     * service.configure({ clients: [{ node: 'http://localhost:9200' }] });
     */
    configure(options: ElasticsearchModuleOptions): void {
        if (options.logger) this.logger = options.logger;

        for (const def of options.clients) {
            const name = (def.name || ES_DEFAULT_CLIENT_NAME).toLowerCase();
            const client = createElasticsearchClient(def);

            this.nameToClient.set(name, client);
            this.attachLogs(name, client);
        }
    }

    /**
     * Attach logging to an Elasticsearch client.
     * @param {string} name - Client name for logging labels
     * @param {ElasticsearchClient} client - Elasticsearch client instance
     * @returns {void}
     */
    private attachLogs(name: string, client: ElasticsearchClient): void {
        const label = `es:${name}`;
        // Low-level client exposes events via Transport. We can log request/response and errors.
        const anyClient = client as unknown as {
            on?: (
                event: 'error' | 'request' | 'response' | 'resurrect' | 'sniff',
                listener: (...args: unknown[]) => void,
            ) => void;
            transport?: {
                emitter?: { on: (event: 'resurrect' | 'sniff', listener: (...args: unknown[]) => void) => void };
                on: (event: 'request' | 'response' | 'sniff', listener: (...args: unknown[]) => void) => void;
            };
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
