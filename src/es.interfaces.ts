import type { LoggerService, ModuleMetadata } from '@nestjs/common';

import type { Client, ClientOptions } from '@elastic/elasticsearch';

export type ElasticsearchClient = Client;

export type ElasticsearchClientOptions = ClientOptions & { name?: string };

export interface ElasticsearchModuleOptions {
    clients: ElasticsearchClientOptions[];
    /** Optional list of entity classes (decorated with @Document) for auto index creation */
    documents?: Array<abstract new (...args: any[]) => object>;
    /** When true, auto-create indices for provided documents on module init (idempotent) */
    autoCreateIndices?: boolean;
    /** Optional Nest logger to receive client lifecycle/response messages */
    logger?: LoggerService;
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

// Document decorator interfaces
export interface DocumentOptions {
    index: string;
    type?: string;
    settings?: Record<string, any>;
    mappings?: Record<string, any>;
}

export interface FieldOptions {
    type?:
        | 'text'
        | 'keyword'
        | 'long'
        | 'integer'
        | 'short'
        | 'byte'
        | 'double'
        | 'float'
        | 'half_float'
        | 'scaled_float'
        | 'date'
        | 'date_nanos'
        | 'boolean'
        | 'binary'
        | 'integer_range'
        | 'float_range'
        | 'long_range'
        | 'double_range'
        | 'date_range'
        | 'ip_range'
        | 'object'
        | 'nested'
        | 'ip'
        | 'version'
        | 'murmur3'
        | 'geo_point'
        | 'geo_shape'
        | 'point'
        | 'shape'
        | 'completion'
        | 'search_as_you_type'
        | 'token_count'
        | 'dense_vector'
        | 'sparse_vector'
        | 'rank_feature'
        | 'rank_features'
        | 'flattened'
        | 'join'
        | 'percolator'
        | 'alias'
        | 'histogram'
        | 'constant_keyword'
        | 'wildcard';
    analyzer?: string;
    search_analyzer?: string;
    normalizer?: string;
    index?: boolean;
    store?: boolean;
    doc_values?: boolean;
    term_vector?: 'no' | 'yes' | 'with_positions' | 'with_offsets' | 'with_positions_offsets';
    norms?: boolean;
    boost?: number;
    null_value?: any;
    copy_to?: string | string[];
    dynamic?: boolean | 'strict';
    enabled?: boolean;
    format?: string;
    locale?: string;
    ignore_malformed?: boolean;
    coerce?: boolean;
    scaling_factor?: number;
    max_input_length?: number;
    eager_global_ordinals?: boolean;
    fielddata?: boolean | { loading?: 'eager' | 'lazy' };
    properties?: Record<string, FieldOptions>;
    fields?: Record<string, FieldOptions>;
    meta?: Record<string, string>;
    similarity?: string;
    dims?: number;
    depth_limit?: number;
    ignore_z_value?: boolean;
    points_only?: boolean;
    max_shingle_size?: number;
    preserve_separators?: boolean;
    preserve_position_increments?: boolean;
    max_gram?: number;
    min_gram?: number;
    relations?: Record<string, string | string[]>;
}

export interface IndexOptions {
    name: string;
    settings?: {
        number_of_shards?: number;
        number_of_replicas?: number;
        [key: string]: any;
    };
}

export interface DocumentMetadata {
    index: string;
    type?: string;
    settings?: Record<string, any>;
    mappings?: Record<string, any>;
    fields?: Map<string | symbol, FieldOptions>;
}
