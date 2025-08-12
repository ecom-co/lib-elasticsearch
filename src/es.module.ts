import { DynamicModule, Global, Module, OnModuleInit, Provider } from '@nestjs/common';

import defaultTo from 'lodash/defaultTo';
import get from 'lodash/get';
import isEmpty from 'lodash/isEmpty';
import map from 'lodash/map';
import toArray from 'lodash/toArray';

import { ES_DEFAULT_CLIENT_NAME, ES_MODULE_OPTIONS, getElasticsearchClientToken } from './es.constants';
import type { ElasticsearchClient, ElasticsearchModuleAsyncOptions, ElasticsearchModuleOptions } from './es.interfaces';
import { createElasticsearchProviders } from './es.providers';
import { ElasticsearchService } from './es.service';
import { buildDocumentMetadata, normalizeName } from './es.utils';

const createClientProviders = (options: ElasticsearchModuleOptions): Provider[] =>
    map(get(options, 'clients', []), (clientOptions) => {
        const name = normalizeName(get(clientOptions, 'name'));
        const token = getElasticsearchClientToken(name);
        return {
            provide: token,
            useFactory: (service: ElasticsearchService): ElasticsearchClient => service.get(name),
            inject: [ElasticsearchService],
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
                    { index: get(meta, 'index'), settings: get(meta, 'settings'), mappings: get(meta, 'mappings') },
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
        entities: Array<abstract new (...args: any[]) => object> = [],
        clientName?: string,
    ): DynamicModule {
        const providers = createElasticsearchProviders(entities, clientName);
        return {
            module: ElasticsearchModule,
            providers: providers,
            exports: providers,
        };
    }
    static forRoot(options: ElasticsearchModuleOptions): DynamicModule {
        const optionProvider: Provider = { provide: ES_MODULE_OPTIONS, useValue: options };
        const serviceProvider: Provider = {
            provide: ElasticsearchService,
            useFactory: (opts: ElasticsearchModuleOptions): ElasticsearchService => {
                const service = new ElasticsearchService();
                service.configure(opts);
                return service;
            },
            inject: [ES_MODULE_OPTIONS],
        };
        const indexInitializerProvider: Provider = {
            provide: EsIndexInitializer,
            useFactory: (service: ElasticsearchService, opts: ElasticsearchModuleOptions) =>
                new EsIndexInitializer(service, opts),
            inject: [ElasticsearchService, ES_MODULE_OPTIONS],
        };
        const clientProviders = createClientProviders(options);
        const defaultProvider: Provider = {
            provide: getElasticsearchClientToken(ES_DEFAULT_CLIENT_NAME),
            useFactory: (service: ElasticsearchService) => service.get(ES_DEFAULT_CLIENT_NAME),
            inject: [ElasticsearchService],
        };
        return {
            module: ElasticsearchModule,
            providers: [optionProvider, serviceProvider, indexInitializerProvider, defaultProvider, ...clientProviders],
            exports: [
                ElasticsearchService,
                getElasticsearchClientToken(ES_DEFAULT_CLIENT_NAME),
                ...map(get(options, 'clients', []), (c) => getElasticsearchClientToken(normalizeName(get(c, 'name')))),
            ],
        };
    }

    static forRootAsync(options: ElasticsearchModuleAsyncOptions): DynamicModule {
        const asyncOptionsProvider: Provider = {
            provide: ES_MODULE_OPTIONS,
            useFactory: get(options, 'useFactory'),
            inject: get(options, 'inject', []),
        };
        const serviceProvider: Provider = {
            provide: ElasticsearchService,
            useFactory: (opts: ElasticsearchModuleOptions): ElasticsearchService => {
                const service = new ElasticsearchService();
                service.configure(opts);
                return service;
            },
            inject: [ES_MODULE_OPTIONS],
        };
        const indexInitializerProvider: Provider = {
            provide: EsIndexInitializer,
            useFactory: (service: ElasticsearchService, opts: ElasticsearchModuleOptions) =>
                new EsIndexInitializer(service, opts),
            inject: [ElasticsearchService, ES_MODULE_OPTIONS],
        };

        const predeclaredProviders: Provider[] = map(defaultTo(get(options, 'predeclare'), []), (rawName): Provider => {
            const name = normalizeName(rawName);
            return {
                provide: getElasticsearchClientToken(name),
                useFactory: (service: ElasticsearchService): ElasticsearchClient => service.get(name),
                inject: [ElasticsearchService],
            } satisfies Provider;
        });

        const proxyProviders: Provider[] = [
            {
                provide: getElasticsearchClientToken(ES_DEFAULT_CLIENT_NAME),
                useFactory: (service: ElasticsearchService): ElasticsearchClient => service.get(ES_DEFAULT_CLIENT_NAME),
                inject: [ElasticsearchService],
            },
            ...predeclaredProviders,
        ];

        return {
            module: ElasticsearchModule,
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
        };
    }
}
