import { Inject } from '@nestjs/common';
import 'reflect-metadata';

import {
    getElasticsearchClientToken,
    ES_DOCUMENT_METADATA,
    ES_FIELD_METADATA,
    ES_INDEX_METADATA,
} from './es.constants';
import type { DocumentOptions, FieldOptions, IndexOptions } from './es.interfaces';
import { getRepositoryToken } from './es.repository';

export type InjectElasticsearch = {
    (): ParameterDecorator;
    <TName extends string = 'default'>(name: TName): ParameterDecorator;
};

export const InjectElasticsearch: InjectElasticsearch = ((name?: string): ParameterDecorator =>
    Inject(getElasticsearchClientToken(name))) as InjectElasticsearch;

export type InjectEsRepository = {
    <T>(entity: new () => T): ParameterDecorator;
    <T, TName extends string = 'default'>(entity: new () => T, name: TName): ParameterDecorator;
};

export const InjectEsRepository: InjectEsRepository = (<T>(
    entity: new () => T,
    clientName?: string,
): ParameterDecorator => Inject(getRepositoryToken(entity, clientName))) as InjectEsRepository;

/**
 * Decorator to mark a class as an Elasticsearch document
 * @param options Document configuration options
 */
export const Document =
    (options: DocumentOptions): ClassDecorator =>
    (target): void => {
        Reflect.defineMetadata(ES_DOCUMENT_METADATA, options, target);
    };

/**
 * Decorator to mark a property as an Elasticsearch field
 * @param options Field configuration options
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
 * Decorator to configure index settings for a document
 * @param options Index configuration options
 */
export const Index =
    (options: IndexOptions): ClassDecorator =>
    (target): void => {
        Reflect.defineMetadata(ES_INDEX_METADATA, options, target);
    };
