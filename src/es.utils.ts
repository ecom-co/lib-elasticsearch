import 'reflect-metadata';

import { Client } from '@elastic/elasticsearch';
import clone from 'lodash/clone';
import cloneDeep from 'lodash/cloneDeep';
import get from 'lodash/get';
import isUndefined from 'lodash/isUndefined';
import set from 'lodash/set';
import toLower from 'lodash/toLower';
import toString from 'lodash/toString';
import trim from 'lodash/trim';

import { ES_DOCUMENT_METADATA, ES_FIELD_METADATA, ES_INDEX_METADATA } from './es.constants';

import type {
    DocumentMetadata,
    DocumentOptions,
    ElasticsearchClient,
    ElasticsearchClientOptions,
    FieldOptions,
    IndexOptions,
} from './es.interfaces';

/**
 * Create an Elasticsearch client instance with the given options.
 * @param {ElasticsearchClientOptions} options - Client configuration options
 * @returns {ElasticsearchClient} The configured Elasticsearch client
 * @example
 * const client = createElasticsearchClient({ node: 'http://localhost:9200', auth: { username: 'user', password: 'pass' } });
 */
export const createElasticsearchClient = (options: ElasticsearchClientOptions): ElasticsearchClient =>
    new Client(options);

/**
 * Normalize a name to lowercase and trimmed format with default fallback.
 * @param {string} [name] - Name to normalize
 * @returns {string} Normalized name or 'default' if empty
 * @example
 * normalizeName('  MyClient  '); // 'myclient'
 * normalizeName(); // 'default'
 */
export const normalizeName = (name?: string): string => toLower(trim(name) || 'default');

/**
 * Extract document metadata from a class decorated with @Document.
 * @param {object} target - The class constructor to extract metadata from
 * @returns {DocumentOptions | undefined} Document options or undefined if no metadata
 * @example
 * const metadata = getDocumentMetadata(UserClass);
 * if (metadata) console.log(metadata.index); // 'users'
 */
export const getDocumentMetadata = (target: object): DocumentOptions | undefined =>
    Reflect.getMetadata(ES_DOCUMENT_METADATA, target) as DocumentOptions | undefined;

/**
 * Extract field metadata from a class decorated with @Field.
 * @param {object} target - The class constructor to extract metadata from
 * @returns {Map<string | symbol, FieldOptions> | undefined} Field metadata map or undefined if no metadata
 * @example
 * const fieldsMap = getFieldsMetadata(UserClass);
 * if (fieldsMap) fieldsMap.forEach((options, fieldName) => console.log(fieldName, options));
 */
export const getFieldsMetadata = (target: object): Map<string | symbol, FieldOptions> | undefined =>
    Reflect.getMetadata(ES_FIELD_METADATA, target) as Map<string | symbol, FieldOptions> | undefined;

/**
 * Extract index metadata from a class decorated with @Index.
 * @param {object} target - The class constructor to extract metadata from
 * @returns {IndexOptions | undefined} Index options or undefined if no metadata
 * @example
 * const indexMeta = getIndexMetadata(UserClass);
 * if (indexMeta) console.log(indexMeta.settings);
 */
export const getIndexMetadata = (target: object): IndexOptions | undefined =>
    Reflect.getMetadata(ES_INDEX_METADATA, target) as IndexOptions | undefined;

/**
 * Build complete document metadata including mappings from field decorators.
 * @param {object} target - The class constructor to build metadata for
 * @returns {DocumentMetadata | undefined} Complete document metadata or undefined if no @Document decorator
 * @example
 * const metadata = buildDocumentMetadata(UserClass);
 * if (metadata) {
 *   console.log(metadata.index); // 'users'
 *   console.log(metadata.mappings); // { properties: { name: { type: 'text' } } }
 * }
 */
type DocumentMappings = Record<string, unknown> & { properties?: Record<string, FieldOptions> };

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

            set(properties, key, fieldOptions);
        });
        mappings.properties = properties;
    }

    return {
        type: documentOptions.type,
        fields: fieldsMetadata,
        index: documentOptions.index,
        mappings,
        settings: get(indexMetadata, 'settings', documentOptions.settings),
    };
};

/**
 * Convert a class instance to Elasticsearch document format.
 * @param {object} instance - The class instance to convert
 * @returns {Record<string, unknown>} The Elasticsearch document representation
 * @example
 * const user = new User();
 * user.name = 'John';
 * user.email = 'john@example.com';
 * const doc = toElasticsearchDocument(user); // { name: 'John', email: 'john@example.com' }
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
            set(document, key, value);
        }
    });

    return document;
};
