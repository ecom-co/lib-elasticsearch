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

class EsIndexInitializer implements OnModuleInit {
    constructor(
        private readonly service: ElasticsearchService,
        private readonly options: ElasticsearchModuleOptions,
    ) {}

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

@Global()
@Module({})
export class ElasticsearchModule {
    static forFeature(
        entities: Array<abstract new (...args: unknown[]) => object> = [],
        clientName?: string,
    ): DynamicModule {
        const providers = createElasticsearchProviders(entities, clientName);

        return {
            providers: providers,
            exports: providers,
            module: ElasticsearchModule,
        };
    }

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
