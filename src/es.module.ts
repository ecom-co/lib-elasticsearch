import { DynamicModule, Global, Module, Provider } from '@nestjs/common';

import { ES_DEFAULT_CLIENT_NAME, ES_MODULE_OPTIONS, getElasticsearchClientToken } from './es.constants';
import type { ElasticsearchClient, ElasticsearchModuleAsyncOptions, ElasticsearchModuleOptions } from './es.interfaces';
import { ElasticsearchService } from './es.service';
import { normalizeName } from './es.utils';

const createClientProviders = (options: ElasticsearchModuleOptions): Provider[] =>
    options.clients.map((clientOptions) => {
        const name = normalizeName(clientOptions.name);
        const token = getElasticsearchClientToken(name);
        return {
            provide: token,
            useFactory: (service: ElasticsearchService): ElasticsearchClient => service.get(name),
            inject: [ElasticsearchService],
        } satisfies Provider;
    });

@Global()
@Module({})
export class ElasticsearchModule {
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
        const clientProviders = createClientProviders(options);
        const defaultProvider: Provider = {
            provide: getElasticsearchClientToken(ES_DEFAULT_CLIENT_NAME),
            useFactory: (service: ElasticsearchService) => service.get(ES_DEFAULT_CLIENT_NAME),
            inject: [ElasticsearchService],
        };
        return {
            module: ElasticsearchModule,
            providers: [optionProvider, serviceProvider, defaultProvider, ...clientProviders],
            exports: [
                ElasticsearchService,
                getElasticsearchClientToken(ES_DEFAULT_CLIENT_NAME),
                ...options.clients.map((c) => getElasticsearchClientToken(normalizeName(c.name))),
            ],
        };
    }

    static forRootAsync(options: ElasticsearchModuleAsyncOptions): DynamicModule {
        const asyncOptionsProvider: Provider = {
            provide: ES_MODULE_OPTIONS,
            useFactory: options.useFactory,
            inject: options.inject || [],
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

        const predeclaredProviders: Provider[] = (options.predeclare ?? []).map((rawName): Provider => {
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
            imports: options.imports || [],
            providers: [asyncOptionsProvider, serviceProvider, ...proxyProviders],
            exports: (() => {
                const predeclaredTokens = (options.predeclare ?? []).map((n) =>
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
