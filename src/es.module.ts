/* eslint-disable @typescript-eslint/no-explicit-any */
import { DynamicModule, Global, Module, OnModuleInit, Provider } from '@nestjs/common';

import defaultTo from 'lodash/defaultTo';
import get from 'lodash/get';
import isEmpty from 'lodash/isEmpty';
import map from 'lodash/map';
import toArray from 'lodash/toArray';

import { ES_DEFAULT_CLIENT_NAME, ES_MODULE_OPTIONS, getElasticsearchClientToken } from './es.constants';
import { createElasticsearchProviders } from './es.providers';
import { ElasticsearchService } from './es.service';
import { buildDocumentMetadata, normalizeName } from './es.utils';

import type { ElasticsearchClient, ElasticsearchModuleAsyncOptions, ElasticsearchModuleOptions } from './es.interfaces';

/**
 * Create client providers for the given Elasticsearch module options.
 * @param {ElasticsearchModuleOptions} options - Module configuration options
 * @returns {Provider[]} Array of NestJS providers for Elasticsearch clients
 * @example
 * const providers = createClientProviders({ clients: [{ name: 'default', node: 'http://localhost:9200' }] });
 */
const createClientProviders = (options: ElasticsearchModuleOptions): Provider[] =>
    map(get(options, 'clients', []), (clientOptions) => {
        const name = normalizeName(get(clientOptions, 'name'));
        const token = getElasticsearchClientToken(name);

        return {
            inject: [ElasticsearchService],
            provide: token,
            useFactory: (service: ElasticsearchService): ElasticsearchClient => service.get(name),
        } satisfies Provider;
    });

/**
 * Index initializer that automatically creates indices for document entities.
 */
class EsIndexInitializer implements OnModuleInit {
    /**
     * Create an index initializer.
     * @param {ElasticsearchService} service - Elasticsearch service instance
     * @param {ElasticsearchModuleOptions} options - Module configuration options
     */
    constructor(
        private readonly service: ElasticsearchService,
        private readonly options: ElasticsearchModuleOptions,
    ) {}

    /**
     * Initialize indices on module startup if autoCreateIndices is enabled.
     * @returns {Promise<void>} Promise that resolves when initialization completes
     */
    async onModuleInit(): Promise<void> {
        if (!get(this.options, 'autoCreateIndices')) return;

        const documents = defaultTo(get(this.options, 'documents'), []);

        if (isEmpty(documents)) return;

        const client = this.service.get();
        const creations: Array<Promise<unknown>> = [];

        for (const doc of toArray(documents)) {
            const meta = buildDocumentMetadata(doc);

            if (!meta) continue;

            creations.push(
                client.indices.create(
                    { index: get(meta, 'index'), mappings: get(meta, 'mappings'), settings: get(meta, 'settings') },
                    { ignore: [400] },
                ),
            );
        }

        await Promise.allSettled(creations);
    }
}

/**
 * Global Elasticsearch module for NestJS applications.
 */
@Global()
@Module({})
export class ElasticsearchModule {
    /**
     * Register entity repositories for a specific feature module.
     * @param {Array<abstract new (...args: any[]) => object>} [entities=[]] - Array of entity constructors
     * @param {string} [clientName] - Optional client name to use for repositories
     * @returns {DynamicModule} Dynamic module configuration
     * @example
     * ElasticsearchModule.forFeature([User, Product], 'secondary');
     */
    static forFeature(
        entities: Array<abstract new (...args: any[]) => object> = [],
        clientName?: string,
    ): DynamicModule {
        const providers = createElasticsearchProviders(entities, clientName);

        return {
            providers: providers,
            exports: providers,
            module: ElasticsearchModule,
        };
    }

    /**
     * Register the Elasticsearch module with synchronous configuration.
     * @param {ElasticsearchModuleOptions} options - Module configuration options
     * @returns {DynamicModule} Dynamic module configuration
     * @example
     * ElasticsearchModule.forRoot({
     *   clients: [{ node: 'http://localhost:9200' }],
     *   autoCreateIndices: true
     * });
     */
    static forRoot(options: ElasticsearchModuleOptions): DynamicModule {
        const optionProvider: Provider = { provide: ES_MODULE_OPTIONS, useValue: options };
        const serviceProvider: Provider = {
            inject: [ES_MODULE_OPTIONS],
            provide: ElasticsearchService,
            useFactory: (opts: ElasticsearchModuleOptions): ElasticsearchService => {
                const service = new ElasticsearchService();

                service.configure(opts);

                return service;
            },
        };
        const indexInitializerProvider: Provider = {
            inject: [ElasticsearchService, ES_MODULE_OPTIONS],
            provide: EsIndexInitializer,
            useFactory: (service: ElasticsearchService, opts: ElasticsearchModuleOptions) =>
                new EsIndexInitializer(service, opts),
        };
        const clientProviders = createClientProviders(options);
        const defaultProvider: Provider = {
            inject: [ElasticsearchService],
            provide: getElasticsearchClientToken(ES_DEFAULT_CLIENT_NAME),
            useFactory: (service: ElasticsearchService) => service.get(ES_DEFAULT_CLIENT_NAME),
        };

        return {
            providers: [optionProvider, serviceProvider, indexInitializerProvider, defaultProvider, ...clientProviders],
            exports: [
                ElasticsearchService,
                getElasticsearchClientToken(ES_DEFAULT_CLIENT_NAME),
                ...map(get(options, 'clients', []), (c) => getElasticsearchClientToken(normalizeName(get(c, 'name')))),
            ],
            module: ElasticsearchModule,
        };
    }

    /**
     * Register the Elasticsearch module with asynchronous configuration.
     * @param {ElasticsearchModuleAsyncOptions} options - Async module configuration options
     * @returns {DynamicModule} Dynamic module configuration
     * @example
     * ElasticsearchModule.forRootAsync({
     *   imports: [ConfigModule],
     *   inject: [ConfigService],
     *   useFactory: (config: ConfigService) => ({
     *     clients: [{ node: config.get('ELASTICSEARCH_URL') }]
     *   })
     * });
     */
    static forRootAsync(options: ElasticsearchModuleAsyncOptions): DynamicModule {
        const asyncOptionsProvider: Provider = {
            inject: get(options, 'inject', []),
            provide: ES_MODULE_OPTIONS,
            useFactory: get(options, 'useFactory'),
        };
        const serviceProvider: Provider = {
            inject: [ES_MODULE_OPTIONS],
            provide: ElasticsearchService,
            useFactory: (opts: ElasticsearchModuleOptions): ElasticsearchService => {
                const service = new ElasticsearchService();

                service.configure(opts);

                return service;
            },
        };
        const indexInitializerProvider: Provider = {
            inject: [ElasticsearchService, ES_MODULE_OPTIONS],
            provide: EsIndexInitializer,
            useFactory: (service: ElasticsearchService, opts: ElasticsearchModuleOptions) =>
                new EsIndexInitializer(service, opts),
        };

        const predeclaredProviders: Provider[] = map(defaultTo(get(options, 'predeclare'), []), (rawName): Provider => {
            const name = normalizeName(rawName);

            return {
                inject: [ElasticsearchService],
                provide: getElasticsearchClientToken(name),
                useFactory: (service: ElasticsearchService): ElasticsearchClient => service.get(name),
            } satisfies Provider;
        });

        const proxyProviders: Provider[] = [
            {
                inject: [ElasticsearchService],
                provide: getElasticsearchClientToken(ES_DEFAULT_CLIENT_NAME),
                useFactory: (service: ElasticsearchService): ElasticsearchClient => service.get(ES_DEFAULT_CLIENT_NAME),
            },
            ...predeclaredProviders,
        ];

        return {
            imports: get(options, 'imports', []),
            providers: [asyncOptionsProvider, serviceProvider, indexInitializerProvider, ...proxyProviders],
            exports: (() => {
                const predeclaredTokens = map(defaultTo(get(options, 'predeclare'), []), (n) =>
                    getElasticsearchClientToken(normalizeName(n)),
                );

                return [
                    ElasticsearchService,
                    getElasticsearchClientToken(ES_DEFAULT_CLIENT_NAME),
                    ...predeclaredTokens,
                ];
            })(),
            module: ElasticsearchModule,
        };
    }
}
