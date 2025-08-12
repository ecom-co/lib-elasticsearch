import 'reflect-metadata';

import clone from 'lodash/clone';
import cloneDeep from 'lodash/cloneDeep';
import get from 'lodash/get';
import isUndefined from 'lodash/isUndefined';
import toLower from 'lodash/toLower';
import toString from 'lodash/toString';
import trim from 'lodash/trim';

import { Client } from '@elastic/elasticsearch';

import { ES_DOCUMENT_METADATA, ES_FIELD_METADATA, ES_INDEX_METADATA } from './es.constants';
import type {
    ElasticsearchClient,
    ElasticsearchClientOptions,
    DocumentOptions,
    FieldOptions,
    IndexOptions,
    DocumentMetadata,
} from './es.interfaces';

export const createElasticsearchClient = (options: ElasticsearchClientOptions): ElasticsearchClient =>
    new Client(options);

export const normalizeName = (name?: string): string => toLower(trim(name) || 'default');

/**
 * Extract document metadata from a class decorated with @Document
 */
export const getDocumentMetadata = (target: object): DocumentOptions | undefined =>
    Reflect.getMetadata(ES_DOCUMENT_METADATA, target) as DocumentOptions | undefined;

/**
 * Extract field metadata from a class decorated with @Field
 */
export const getFieldsMetadata = (target: object): Map<string | symbol, FieldOptions> | undefined =>
    Reflect.getMetadata(ES_FIELD_METADATA, target) as Map<string | symbol, FieldOptions> | undefined;

/**
 * Extract index metadata from a class decorated with @Index
 */
export const getIndexMetadata = (target: object): IndexOptions | undefined =>
    Reflect.getMetadata(ES_INDEX_METADATA, target) as IndexOptions | undefined;

/**
 * Build complete document metadata including mappings from field decorators
 */
type DocumentMappings = { properties?: Record<string, FieldOptions> } & Record<string, unknown>;

export const buildDocumentMetadata = (target: object): DocumentMetadata | undefined => {
    const documentOptions = getDocumentMetadata(target);
    if (!documentOptions) {
        return undefined;
    }

    const fieldsMetadata = getFieldsMetadata(target);
    const indexMetadata = getIndexMetadata(target);

    // Build mappings from field decorators
    const baseMappings: Record<string, unknown> = documentOptions.mappings ? cloneDeep(documentOptions.mappings) : {};
    const mappings: DocumentMappings = baseMappings as DocumentMappings;
    if (fieldsMetadata) {
        const properties: Record<string, FieldOptions> = cloneDeep(mappings.properties) || {};
        fieldsMetadata.forEach((fieldOptions, fieldName) => {
            const key = toString(fieldName);
            properties[key] = fieldOptions;
        });
        mappings.properties = properties;
    }

    return {
        index: documentOptions.index,
        type: documentOptions.type,
        settings: get(indexMetadata, 'settings', documentOptions.settings),
        mappings,
        fields: fieldsMetadata,
    };
};

/**
 * Convert a class instance to Elasticsearch document format
 */
export const toElasticsearchDocument = (instance: object): Record<string, unknown> => {
    const fieldsMetadata = getFieldsMetadata(instance.constructor);

    if (!fieldsMetadata) {
        // If no field metadata, return all enumerable properties
        return clone(instance as Record<string, unknown>);
    }

    // Only include fields that are decorated with @Field
    const record = instance as unknown as Record<string, unknown>;
    const document: Record<string, unknown> = {};
    fieldsMetadata.forEach((fieldOptions, fieldName) => {
        const key = toString(fieldName);
        const value = get(record, key);
        if (!isUndefined(value)) {
            document[key] = value;
        }
    });

    return document;
};
