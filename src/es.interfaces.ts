import type { ModuleMetadata } from '@nestjs/common';

import type { Client, ClientOptions } from '@elastic/elasticsearch';

export type ElasticsearchClient = Client;

export type ElasticsearchClientOptions = ClientOptions & { name?: string };

export interface ElasticsearchModuleOptions {
    clients: ElasticsearchClientOptions[];
}

export interface ElasticsearchModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
    useFactory: (...args: any[]) => Promise<ElasticsearchModuleOptions> | ElasticsearchModuleOptions;
    inject?: any[];
    /**
     * Optional list of client names to predeclare DI tokens in async mode.
     * Names are case-insensitive.
     */
    predeclare?: string[];
}

export type ESClientNamesFromOptions<T extends { clients: ReadonlyArray<{ name?: string }> }> =
    | Lowercase<Extract<T['clients'][number]['name'], string>>
    | 'default';

export type ESClientNamesFromPredeclare<TNames extends ReadonlyArray<string>> = Lowercase<TNames[number]> | 'default';
