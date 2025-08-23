import { Inject } from '@nestjs/common';
import 'reflect-metadata';

import {
    ES_DOCUMENT_METADATA,
    ES_FIELD_METADATA,
    ES_INDEX_METADATA,
    getElasticsearchClientToken,
} from './es.constants';
import { getRepositoryToken } from './es.repository';

import type { DocumentOptions, FieldOptions, IndexOptions } from './es.interfaces';

export type InjectElasticsearch = {
    (): ParameterDecorator;
    <TName extends string = 'default'>(name: TName): ParameterDecorator;
};

/**
 * Decorator for injecting an Elasticsearch client instance.
 * @template TName - The client name type
 * @param {string} [name='default'] - The client name to inject
 * @returns {ParameterDecorator} The parameter decorator
 * @example
 * constructor(@InjectElasticsearch() private es: ElasticsearchClient) {}
 * constructor(@InjectElasticsearch('secondary') private secondaryEs: ElasticsearchClient) {}
 */
export const InjectElasticsearch: InjectElasticsearch = ((name?: string): ParameterDecorator =>
    Inject(getElasticsearchClientToken(name))) as InjectElasticsearch;

export type InjectEsRepository = {
    <T>(entity: new () => T): ParameterDecorator;
    <T, TName extends string = 'default'>(entity: new () => T, name: TName): ParameterDecorator;
};

/**
 * Decorator for injecting an Elasticsearch repository instance.
 * @template T - The entity type
 * @template TName - The client name type
 * @param {new () => T} entity - The entity constructor
 * @param {string} [clientName='default'] - The client name to use
 * @returns {ParameterDecorator} The parameter decorator
 * @example
 * constructor(@InjectEsRepository(User) private userRepo: EsRepository<User>) {}
 * constructor(@InjectEsRepository(Product, 'secondary') private productRepo: EsRepository<Product>) {}
 */
export const InjectEsRepository: InjectEsRepository = (<T>(
    entity: new () => T,
    clientName?: string,
): ParameterDecorator => Inject(getRepositoryToken(entity, clientName))) as InjectEsRepository;

/**
 * Decorator to mark a class as an Elasticsearch document.
 * @param {DocumentOptions} options - Document configuration options
 * @returns {ClassDecorator} The class decorator
 * @example
 * @Document({ index: 'users', type: '_doc' })
 * class User {
 *   @Field({ type: 'keyword' })
 *   id: string;
 * }
 */
export const Document =
    (options: DocumentOptions): ClassDecorator =>
    (target): void => {
        Reflect.defineMetadata(ES_DOCUMENT_METADATA, options, target);
    };

/**
 * Decorator to mark a property as an Elasticsearch field.
 * @param {FieldOptions} [options={}] - Field configuration options
 * @returns {PropertyDecorator} The property decorator
 * @example
 * class User {
 *   @Field({ type: 'keyword' })
 *   id: string;
 *   
 *   @Field({ type: 'text', analyzer: 'standard' })
 *   name: string;
 * }
 */
type HasConstructor = { constructor: unknown };

export const Field =
    (options: FieldOptions = {}): PropertyDecorator =>
    (target, propertyKey): void => {
        const ctor = (target as HasConstructor).constructor as object;
        const existingFields =
            (Reflect.getMetadata(ES_FIELD_METADATA, ctor) as Map<string | symbol, FieldOptions> | undefined) ||
            new Map<string | symbol, FieldOptions>();

        existingFields.set(propertyKey, options);
        Reflect.defineMetadata(ES_FIELD_METADATA, existingFields, ctor);
    };

/**
 * Decorator to configure index settings for a document.
 * @param {IndexOptions} options - Index configuration options
 * @returns {ClassDecorator} The class decorator
 * @example
 * @Index({ name: 'users', settings: { number_of_shards: 1 } })
 * @Document({ index: 'users' })
 * class User {
 *   @Field({ type: 'keyword' })
 *   id: string;
 * }
 */
export const Index =
    (options: IndexOptions): ClassDecorator =>
    (target): void => {
        Reflect.defineMetadata(ES_INDEX_METADATA, options, target);
    };
