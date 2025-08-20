import type { InjectionToken, LoggerService, ModuleMetadata, OptionalFactoryDependency } from '@nestjs/common';

import type { Client, ClientOptions } from '@elastic/elasticsearch';

export type ElasticsearchClient = Client;

export type ElasticsearchClientOptions = ClientOptions & { name?: string };

export interface ElasticsearchModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
    inject?: Array<InjectionToken | OptionalFactoryDependency>;
    useFactory: (...args: unknown[]) => ElasticsearchModuleOptions | Promise<ElasticsearchModuleOptions>;
    /**
     * Optional list of client names to predeclare DI tokens in async mode.
     * Names are case-insensitive.
     */
    predeclare?: string[];
}

export interface ElasticsearchModuleOptions {
    clients: ElasticsearchClientOptions[];
    /** Optional list of entity classes (decorated with @Document) for auto index creation */
    documents?: Array<abstract new (...args: unknown[]) => object>;
    /** When true, auto-create indices for provided documents on module init (idempotent) */
    autoCreateIndices?: boolean;
    /** Optional Nest logger to receive client lifecycle/response messages */
    logger?: LoggerService;
}

export type ESClientNamesFromOptions<T extends { clients: ReadonlyArray<{ name?: string }> }> =
    | 'default'
    | Lowercase<Extract<T['clients'][number]['name'], string>>;

export type ESClientNamesFromPredeclare<TNames extends ReadonlyArray<string>> = 'default' | Lowercase<TNames[number]>;

// Document decorator interfaces
export interface DocumentMetadata {
    fields?: Map<string | symbol, FieldOptions>;
    index: string;
    mappings?: Record<string, unknown>;
    settings?: Record<string, unknown>;
    type?: string;
}

export interface DocumentOptions {
    index: string;
    mappings?: Record<string, unknown>;
    settings?: Record<string, unknown>;
    type?: string;
}

export interface FieldOptions {
    analyzer?: string;
    boost?: number;
    coerce?: boolean;
    copy_to?: string | string[];
    depth_limit?: number;
    dims?: number;
    doc_values?: boolean;
    dynamic?: 'strict' | boolean;
    eager_global_ordinals?: boolean;
    enabled?: boolean;
    fielddata?: boolean | { loading?: 'eager' | 'lazy' };
    fields?: Record<string, FieldOptions>;
    format?: string;
    ignore_malformed?: boolean;
    ignore_z_value?: boolean;
    index?: boolean;
    locale?: string;
    max_gram?: number;
    max_input_length?: number;
    max_shingle_size?: number;
    meta?: Record<string, string>;
    min_gram?: number;
    normalizer?: string;
    norms?: boolean;
    null_value?: unknown;
    points_only?: boolean;
    preserve_position_increments?: boolean;
    preserve_separators?: boolean;
    properties?: Record<string, FieldOptions>;
    relations?: Record<string, string | string[]>;
    scaling_factor?: number;
    search_analyzer?: string;
    similarity?: string;
    store?: boolean;
    term_vector?: 'no' | 'with_offsets' | 'with_positions' | 'with_positions_offsets' | 'yes';
    type?:
        | 'alias'
        | 'binary'
        | 'boolean'
        | 'byte'
        | 'completion'
        | 'constant_keyword'
        | 'date'
        | 'date_nanos'
        | 'date_range'
        | 'dense_vector'
        | 'double'
        | 'double_range'
        | 'flattened'
        | 'float'
        | 'float_range'
        | 'geo_point'
        | 'geo_shape'
        | 'half_float'
        | 'histogram'
        | 'integer'
        | 'integer_range'
        | 'ip'
        | 'ip_range'
        | 'join'
        | 'keyword'
        | 'long'
        | 'long_range'
        | 'murmur3'
        | 'nested'
        | 'object'
        | 'percolator'
        | 'point'
        | 'rank_feature'
        | 'rank_features'
        | 'scaled_float'
        | 'search_as_you_type'
        | 'shape'
        | 'short'
        | 'sparse_vector'
        | 'text'
        | 'token_count'
        | 'version'
        | 'wildcard';
}

export interface IndexOptions {
    name: string;
    settings?: {
        [key: string]: unknown;
        number_of_replicas?: number;
        number_of_shards?: number;
    };
}
