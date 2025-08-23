import { Injectable } from '@nestjs/common';

import assign from 'lodash/assign';
import filter from 'lodash/filter';
import first from 'lodash/first';
import forEach from 'lodash/forEach';
import get from 'lodash/get';
import isBoolean from 'lodash/isBoolean';
import isEmpty from 'lodash/isEmpty';
import isNil from 'lodash/isNil';
import map from 'lodash/map';
import toString from 'lodash/toString';
import toUpper from 'lodash/toUpper';
import trim from 'lodash/trim';

import { getElasticsearchClientToken } from './es.constants';
import { buildDocumentMetadata, getDocumentMetadata, toElasticsearchDocument } from './es.utils';

import type { ElasticsearchClient } from './es.interfaces';
import type { QueryDslQueryContainer, SearchResponse } from '@elastic/elasticsearch/lib/api/types';

export type Constructor<T = unknown, Arguments extends unknown[] = unknown[]> = new (...arguments_: Arguments) => T;

/**
 * Base Elasticsearch repository providing CRUD, bulk, query, and search helpers for an entity T described via @Document/@Field decorators.
 * @template T - The entity type extending object
 */
@Injectable()
export class EsRepository<T extends object> {
    /**
     * Create a repository for the given entity constructor using the provided client.
     * @param {ElasticsearchClient} es - Elasticsearch client instance
     * @param {Constructor<T>} entityCtor - Entity constructor decorated with @Document
     */
    constructor(
        protected readonly es: ElasticsearchClient,
        protected readonly entityCtor: Constructor<T>,
    ) {}

    /**
     * Access the underlying Elasticsearch client for advanced/raw operations.
     * @returns {ElasticsearchClient} The Elasticsearch client instance
     */
    getClient(): ElasticsearchClient {
        return this.es;
    }

    /**
     * Create a class instance of the repository entity from a plain source object.
     * @param {Partial<T>} source - Source object to convert to entity instance
     * @returns {T} The created entity instance
     */
    protected createEntity(source: Partial<T>): T {
        const proto = this.entityCtor.prototype as unknown as object;
        const instance = Object.create(proto) as T;

        assign(instance, source);

        return instance;
    }

    /**
     * Target index name derived from the entity @Document metadata.
     * @returns {string} The index name
     * @throws {Error} If @Document metadata is missing
     */
    protected get index(): string {
        const meta = getDocumentMetadata(this.entityCtor);

        if (!meta) throw new Error('Missing @Document metadata for repository entity');

        return get(meta, 'index');
    }

    /**
     * Check if the target index exists.
     * @returns {Promise<boolean>} True if index exists, false otherwise
     */
    async indexExists(): Promise<boolean> {
        const res = await this.es.indices.exists({ index: this.index });

        return isBoolean(res) ? res : false;
    }

    /**
     * Delete the target index (ignores 404).
     * @returns {Promise<void>} Promise that resolves when operation completes
     */
    async deleteIndex(): Promise<void> {
        await this.es.indices.delete({ index: this.index }, { ignore: [404] });
    }

    /**
     * Create the index with settings and mappings built from decorators. No-op if entity has no @Document metadata.
     * @returns {Promise<void>} Promise that resolves when operation completes
     */
    async ensureIndex(): Promise<void> {
        const meta = buildDocumentMetadata(this.entityCtor);

        if (!meta) return;

        await this.es.indices.create(
            {
                index: get(meta, 'index'),
                mappings: get(meta, 'mappings'),
                settings: get(meta, 'settings'),
            },
            { ignore: [400] },
        );
    }

    /**
     * Refresh the target index.
     * @returns {Promise<void>} Promise that resolves when operation completes
     */
    async refresh(): Promise<void> {
        await this.es.indices.refresh({ index: this.index });
    }

    /**
     * Index a single entity. If id omitted, ES will generate one.
     * @param {T} entity - Entity instance to index
     * @param {string} [id] - Optional document id
     * @returns {Promise<void>} Promise that resolves when operation completes
     * @example
     * await repo.indexOne(user, 'user-123');
     * await repo.indexOne(user); // ES generates ID
     */
    async indexOne(entity: T, id?: string): Promise<void> {
        await this.es.index({ id, document: toElasticsearchDocument(entity), index: this.index });
    }

    /**
     * Bulk index entities using index action.
     * @param {ReadonlyArray<T>} entities - Array of entities to index
     * @returns {Promise<void>} Promise that resolves when operation completes
     * @example
     * await repo.bulkIndex([user1, user2, user3]);
     */
    async bulkIndex(entities: ReadonlyArray<T>): Promise<void> {
        if (isEmpty(entities)) return;

        const operations: Array<Record<string, unknown>> = [];

        forEach(entities, (e) => {
            operations.push({ index: { _index: this.index } });
            operations.push(toElasticsearchDocument(e));
        });
        await this.es.bulk({ operations });
    }

    /**
     * Bulk delete documents by ids.
     * @param {ReadonlyArray<string>} ids - Array of document ids to delete
     * @returns {Promise<void>} Promise that resolves when operation completes
     * @example
     * await repo.bulkDeleteByIds(['id1', 'id2', 'id3']);
     */
    async bulkDeleteByIds(ids: ReadonlyArray<string>): Promise<void> {
        if (isEmpty(ids)) return;

        const operations: Array<Record<string, unknown>> = [];

        forEach(ids, (id) => {
            operations.push({ delete: { _id: id, _index: this.index } });
        });
        await this.es.bulk({ operations });
    }

    /**
     * Bulk update documents by ids with partial docs.
     * @param {ReadonlyArray<{ doc: Partial<T>; id: string }>} updates - Array of update operations
     * @returns {Promise<void>} Promise that resolves when operation completes
     * @example
     * await repo.bulkUpdateByIds([{ id: '1', doc: { name: 'New Name' } }]);
     */
    async bulkUpdateByIds(updates: ReadonlyArray<{ doc: Partial<T>; id: string }>): Promise<void> {
        if (isEmpty(updates)) return;

        const operations: Array<Record<string, unknown>> = [];

        forEach(updates, ({ id, doc }) => {
            operations.push({ update: { _id: id, _index: this.index } });
            operations.push({ doc: doc as Record<string, unknown> });
        });
        await this.es.bulk({ operations });
    }

    /**
     * Delete a single document by id.
     * @param {string} id - Document id to delete
     * @returns {Promise<void>} Promise that resolves when operation completes
     * @example
     * await repo.deleteById('user-123');
     */
    async deleteById(id: string): Promise<void> {
        await this.es.delete({ id, index: this.index });
    }

    /**
     * Partially update a single document by id.
     * @param {string} id - Document id to update
     * @param {Partial<T>} partial - Partial entity data to update
     * @returns {Promise<void>} Promise that resolves when operation completes
     * @example
     * await repo.updateById('user-123', { name: 'New Name' });
     */
    async updateById(id: string, partial: Partial<T>): Promise<void> {
        await this.es.update<T, Partial<T>>({ id, doc: partial, index: this.index });
    }

    /**
     * Upsert a single document by id with the given partial body.
     * @param {string} id - Document id to upsert
     * @param {Partial<T>} partial - Partial entity data to upsert
     * @returns {Promise<void>} Promise that resolves when operation completes
     * @example
     * await repo.upsertById('user-123', { name: 'Name', email: 'email@example.com' });
     */
    async upsertById(id: string, partial: Partial<T>): Promise<void> {
        await this.es.update<T, Partial<T>>({ id, doc: partial, doc_as_upsert: true, index: this.index });
    }

    /**
     * Update a single document by id using an inline script.
     * @param {string} id - Document id to update
     * @param {{ lang?: string; params?: Record<string, unknown>; source: string }} script - Script configuration
     * @returns {Promise<void>} Promise that resolves when operation completes
     * @example
     * await repo.updateByIdScript('user-123', { source: 'ctx._source.counter += params.increment', params: { increment: 1 } });
     */
    async updateByIdScript(
        id: string,
        script: { lang?: string; params?: Record<string, unknown>; source: string },
    ): Promise<void> {
        await this.es.update<T, unknown>({ id, index: this.index, script });
    }

    /**
     * Update a document by id then return the latest _source.
     * @param {string} id - Document id to update
     * @param {Partial<T>} partial - Partial entity data to update
     * @param {{ refresh?: 'wait_for' | boolean }} [options] - Optional refresh settings
     * @returns {Promise<T | undefined>} The updated document source or undefined if not found
     * @example
     * const updated = await repo.updateByIdAndGetSource('user-123', { name: 'New Name' });
     */
    async updateByIdAndGetSource(
        id: string,
        partial: Partial<T>,
        options?: { refresh?: 'wait_for' | boolean },
    ): Promise<T | undefined> {
        await this.es.update<T, Partial<T>>({ id, doc: partial, index: this.index, refresh: get(options, 'refresh') });
        const res = await this.es.get<T>({ id, index: this.index });

        return get(res, '_source');
    }

    /**
     * Upsert a document by id then return the latest _source.
     * @param {string} id - Document id to upsert
     * @param {Partial<T>} partial - Partial entity data to upsert
     * @param {{ refresh?: 'wait_for' | boolean }} [options] - Optional refresh settings
     * @returns {Promise<T | undefined>} The upserted document source or undefined if not found
     * @example
     * const upserted = await repo.upsertByIdAndGetSource('user-123', { name: 'Name' });
     */
    async upsertByIdAndGetSource(
        id: string,
        partial: Partial<T>,
        options?: { refresh?: 'wait_for' | boolean },
    ): Promise<T | undefined> {
        await this.es.update<T, Partial<T>>({
            id,
            doc: partial,
            doc_as_upsert: true,
            index: this.index,
            refresh: get(options, 'refresh'),
        });
        const res = await this.es.get<T>({ id, index: this.index });

        return get(res, '_source');
    }

    /**
     * Update a document by id with a script then return the latest _source.
     * @param {string} id - Document id to update
     * @param {{ lang?: string; params?: Record<string, unknown>; source: string }} script - Script configuration
     * @param {{ refresh?: 'wait_for' | boolean }} [options] - Optional refresh settings
     * @returns {Promise<T | undefined>} The updated document source or undefined if not found
     * @example
     * const updated = await repo.updateByIdScriptAndGetSource('user-123', { source: 'ctx._source.counter++' });
     */
    async updateByIdScriptAndGetSource(
        id: string,
        script: { lang?: string; params?: Record<string, unknown>; source: string },
        options?: { refresh?: 'wait_for' | boolean },
    ): Promise<T | undefined> {
        await this.es.update<T, unknown>({ id, index: this.index, refresh: get(options, 'refresh'), script });
        const res = await this.es.get<T>({ id, index: this.index });

        return get(res, '_source');
    }

    /**
     * Check if a document exists by id.
     * @param {string} id - Document id to check
     * @returns {Promise<boolean>} True if document exists, false otherwise
     * @example
     * const exists = await repo.exists('user-123');
     */
    async exists(id: string): Promise<boolean> {
        const res = await this.es.exists({ id, index: this.index });

        return isBoolean(res) ? res : false;
    }

    /**
     * Get a document by id (raw response).
     * @param {string} id - Document id to get
     * @returns {Promise<unknown>} The raw Elasticsearch response
     * @example
     * const rawDoc = await repo.findById('user-123');
     */
    async findById(id: string): Promise<unknown> {
        return this.es.get({ id, index: this.index });
    }

    /**
     * Get a document _source by id, or undefined if not found.
     * @param {string} id - Document id to get
     * @returns {Promise<T | undefined>} The document source or undefined if not found
     * @example
     * const user = await repo.findSourceById('user-123');
     */
    async findSourceById(id: string): Promise<T | undefined> {
        const found = await this.exists(id);

        if (!found) return undefined;

        const res = await this.es.get<T>({ id, index: this.index });

        return get(res, '_source');
    }

    /**
     * Multi-get sources by ids (aligned with input order).
     * @param {ReadonlyArray<string>} ids - Array of document ids to get
     * @returns {Promise<Array<T | undefined>>} Array of document sources (undefined for missing docs)
     * @example
     * const users = await repo.mgetSources(['user-1', 'user-2', 'user-3']);
     */
    async mgetSources(ids: ReadonlyArray<string>): Promise<Array<T | undefined>> {
        if (isEmpty(ids)) return [];

        type InlineGet<TDoc> = { _source?: TDoc; found?: boolean };
        const res = await this.es.mget<T>({
            docs: map(ids, (id) => ({ _id: id, _index: this.index })),
        } as Omit<Parameters<ElasticsearchClient['mget']>[0], 'index'>);
        const docs = get(res, 'docs', []) as Array<InlineGet<T>>;

        return map(docs, (d) => (get(d, 'found') ? (get(d, '_source') as T) : undefined));
    }

    /**
     * Count documents matching a query.
     * @param {QueryDslQueryContainer} [query] - Optional query to filter documents
     * @returns {Promise<number>} The count of matching documents
     * @example
     * const count = await repo.count({ term: { status: 'active' } });
     */
    async count(query?: QueryDslQueryContainer): Promise<number> {
        const res = await this.es.count({ index: this.index, query });

        return get(res, 'count', 0);
    }

    /**
     * Delete documents matching a query.
     * @param {QueryDslQueryContainer} query - Query to match documents for deletion
     * @returns {Promise<void>} Promise that resolves when operation completes
     * @example
     * await repo.deleteByQuery({ term: { status: 'inactive' } });
     */
    async deleteByQuery(query: QueryDslQueryContainer): Promise<void> {
        await this.es.deleteByQuery({ index: this.index, query });
    }

    /**
     * Low-level passthrough for update-by-query request params.
     * @param {Omit<Parameters<ElasticsearchClient['updateByQuery']>[0], 'index'>} params - Update by query parameters
     * @returns {Promise<unknown>} The raw Elasticsearch response
     * @example
     * const result = await repo.updateByQueryRaw({ query: { match_all: {} }, script: { source: 'ctx._source.updated = true' } });
     */
    async updateByQueryRaw(
        params: Omit<Parameters<ElasticsearchClient['updateByQuery']>[0], 'index'>,
    ): Promise<unknown> {
        return this.es.updateByQuery({ index: this.index, ...params });
    }

    /**
     * Update-by-query using an inline script.
     * @param {object} args - Update by query arguments
     * @param {QueryDslQueryContainer} args.query - Query to match documents
     * @param {{ lang?: string; params?: Record<string, unknown>; source: string }} args.script - Script configuration
     * @returns {Promise<unknown>} The raw Elasticsearch response
     * @example
     * await repo.updateByQueryScript({
     *   query: { term: { status: 'active' } },
     *   script: { source: 'ctx._source.lastUpdated = System.currentTimeMillis()' }
     * });
     */
    async updateByQueryScript(
        args: Omit<Parameters<ElasticsearchClient['updateByQuery']>[0], 'index' | 'query' | 'script'> & {
            query: QueryDslQueryContainer;
            script: { lang?: string; params?: Record<string, unknown>; source: string };
        },
    ): Promise<unknown> {
        const { query, script, ...rest } = args;

        return this.es.updateByQuery({ index: this.index, query, script, ...rest });
    }

    /**
     * Low-level passthrough for search request params.
     * @template TDoc - The document type to return
     * @param {Omit<Parameters<ElasticsearchClient['search']>[0], 'index'>} params - Search parameters
     * @returns {Promise<SearchResponse<TDoc>>} The raw Elasticsearch search response
     * @example
     * const response = await repo.searchRaw<User>({ query: { match_all: {} }, size: 10 });
     */
    async searchRaw<TDoc = T>(
        params: Omit<Parameters<ElasticsearchClient['search']>[0], 'index'>,
    ): Promise<SearchResponse<TDoc>> {
        return this.es.search<TDoc>({ index: this.index, ...params });
    }

    /**
     * Search and return the full typed response.
     * @param {object} params - Search parameters
     * @param {number} [params.from] - Starting offset
     * @param {string} [params.q] - Query string
     * @param {QueryDslQueryContainer} [params.query] - Elasticsearch query
     * @param {number} [params.size] - Number of results to return
     * @param {unknown} [params.sort] - Sort configuration
     * @returns {Promise<SearchResponse<T>>} The full Elasticsearch search response
     * @example
     * const response = await repo.search({ query: { match: { name: 'John' } }, size: 10 });
     */
    async search(params: {
        from?: number;
        q?: string;
        query?: QueryDslQueryContainer;
        size?: number;
        sort?: unknown;
    }): Promise<SearchResponse<T>> {
        const request = { index: this.index, ...params } as Parameters<ElasticsearchClient['search']>[0];

        return this.es.search<T>(request);
    }

    /**
     * Search and return the _source array.
     * @param {object} params - Search parameters
     * @param {number} [params.from] - Starting offset
     * @param {string} [params.q] - Query string
     * @param {QueryDslQueryContainer} [params.query] - Elasticsearch query
     * @param {number} [params.size] - Number of results to return
     * @param {unknown} [params.sort] - Sort configuration
     * @returns {Promise<T[]>} Array of document sources
     * @example
     * const users = await repo.searchSources({ query: { match: { status: 'active' } } });
     */
    async searchSources(params: {
        from?: number;
        q?: string;
        query?: QueryDslQueryContainer;
        size?: number;
        sort?: unknown;
    }): Promise<T[]> {
        const res = await this.search(params);
        const hits = get(res, 'hits.hits', []);

        return filter(
            map(hits, (h) => get(h, '_source')),
            (s): s is T => !isNil(s),
        );
    }

    /**
     * Search and return hydrated entity instances.
     * @param {object} params - Search parameters
     * @param {number} [params.from] - Starting offset
     * @param {string} [params.q] - Query string
     * @param {QueryDslQueryContainer} [params.query] - Elasticsearch query
     * @param {number} [params.size] - Number of results to return
     * @param {unknown} [params.sort] - Sort configuration
     * @returns {Promise<T[]>} Array of hydrated entity instances
     * @example
     * const userEntities = await repo.searchEntities({ query: { match: { name: 'John' } } });
     */
    async searchEntities(params: {
        from?: number;
        q?: string;
        query?: QueryDslQueryContainer;
        size?: number;
        sort?: unknown;
    }): Promise<T[]> {
        const sources = await this.searchSources(params);

        return map(sources, (s) => this.createEntity(s));
    }

    /**
     * Search and return only document ids.
     * @param {object} params - Search parameters
     * @param {number} [params.from] - Starting offset
     * @param {string} [params.q] - Query string
     * @param {QueryDslQueryContainer} [params.query] - Elasticsearch query
     * @param {number} [params.size] - Number of results to return
     * @param {unknown} [params.sort] - Sort configuration
     * @returns {Promise<string[]>} Array of document ids
     * @example
     * const userIds = await repo.searchIds({ query: { match: { status: 'active' } } });
     */
    async searchIds(params: {
        from?: number;
        q?: string;
        query?: QueryDslQueryContainer;
        size?: number;
        sort?: unknown;
    }): Promise<string[]> {
        const res = await this.search(params);
        const hits = get(res, 'hits.hits', []);

        return filter(
            map(hits, (h) => toString(get(h, '_id'))),
            (id) => !!id,
        );
    }

    /**
     * Search and return the first hit _source, if any.
     * @param {object} params - Search parameters
     * @param {number} [params.from] - Starting offset
     * @param {string} [params.q] - Query string
     * @param {QueryDslQueryContainer} [params.query] - Elasticsearch query
     * @param {number} [params.size] - Number of results to return
     * @param {unknown} [params.sort] - Sort configuration
     * @returns {Promise<T | undefined>} The first document source or undefined if no matches
     * @example
     * const firstUser = await repo.searchFirstSource({ query: { match: { name: 'John' } } });
     */
    async searchFirstSource(params: {
        from?: number;
        q?: string;
        query?: QueryDslQueryContainer;
        size?: number;
        sort?: unknown;
    }): Promise<T | undefined> {
        const res = await this.search({ ...params, size: 1 });
        const hit = first(get(res, 'hits.hits', []));

        return get(hit, '_source');
    }

    /**
     * Search and return sources along with ES metadata (index, id, score).
     * @param {object} params - Search parameters
     * @param {number} [params.from] - Starting offset
     * @param {string} [params.q] - Query string
     * @param {QueryDslQueryContainer} [params.query] - Elasticsearch query
     * @param {number} [params.size] - Number of results to return
     * @param {unknown} [params.sort] - Sort configuration
     * @returns {Promise<Array<{ id: string; index: string; score: null | number; source: T }>>} Array of documents with metadata
     * @example
     * const usersWithMeta = await repo.searchSourcesWithMeta({ query: { match: { name: 'John' } } });
     */
    async searchSourcesWithMeta(params: {
        from?: number;
        q?: string;
        query?: QueryDslQueryContainer;
        size?: number;
        sort?: unknown;
    }): Promise<Array<{ id: string; index: string; score: null | number; source: T }>> {
        const res = await this.search(params);
        const hits = get(res, 'hits.hits', []);
        const mapped = map(hits, (h) => ({
            id: toString(get(h, '_id')),
            index: toString(get(h, '_index')),
            score: (get(h, '_score') as null | number) ?? null,
            source: get(h, '_source') as T,
        }));

        return filter(mapped, (m) => !isNil(m.source));
    }

    /**
     * Search and return first source with ES metadata (index, id, score), if any.
     * @param {object} params - Search parameters
     * @param {number} [params.from] - Starting offset
     * @param {string} [params.q] - Query string
     * @param {QueryDslQueryContainer} [params.query] - Elasticsearch query
     * @param {number} [params.size] - Number of results to return
     * @param {unknown} [params.sort] - Sort configuration
     * @returns {Promise<undefined | { id: string; index: string; score: null | number; source: T }>} First document with metadata or undefined
     * @example
     * const firstUserWithMeta = await repo.searchFirstSourceWithMeta({ query: { match: { name: 'John' } } });
     */
    async searchFirstSourceWithMeta(params: {
        from?: number;
        q?: string;
        query?: QueryDslQueryContainer;
        size?: number;
        sort?: unknown;
    }): Promise<undefined | { id: string; index: string; score: null | number; source: T }> {
        const res = await this.search({ ...params, size: 1 });
        const hit = first(get(res, 'hits.hits', []));

        if (isNil(hit)) return undefined;

        const source = get(hit, '_source');

        if (isNil(source)) return undefined;

        return {
            id: toString(get(hit, '_id')),
            index: toString(get(hit, '_index')),
            score: (get(hit, '_score') as null | number) ?? null,
            source,
        };
    }

    /**
     * Search and return the first hydrated entity, if any.
     * @param {object} params - Search parameters
     * @param {number} [params.from] - Starting offset
     * @param {string} [params.q] - Query string
     * @param {QueryDslQueryContainer} [params.query] - Elasticsearch query
     * @param {number} [params.size] - Number of results to return
     * @param {unknown} [params.sort] - Sort configuration
     * @returns {Promise<T | undefined>} The first hydrated entity or undefined if no matches
     * @example
     * const firstUserEntity = await repo.searchFirstEntity({ query: { match: { name: 'John' } } });
     */
    async searchFirstEntity(params: {
        from?: number;
        q?: string;
        query?: QueryDslQueryContainer;
        size?: number;
        sort?: unknown;
    }): Promise<T | undefined> {
        const src = await this.searchFirstSource(params);

        return isNil(src) ? undefined : this.createEntity(src);
    }

    /**
     * Get one document by id and hydrate into entity instance.
     * @param {string} id - Document id to get
     * @returns {Promise<T | undefined>} The hydrated entity or undefined if not found
     * @example
     * const userEntity = await repo.findEntityById('user-123');
     */
    async findEntityById(id: string): Promise<T | undefined> {
        const src = await this.findSourceById(id);

        return isNil(src) ? undefined : this.createEntity(src);
    }
}

/**
 * Build a DI token for a repository of a given entity and client name.
 * @param {{ name: string }} entity - Entity constructor (uses name property)
 * @param {string} [clientName] - Optional client name (defaults to 'default')
 * @returns {string} The dependency injection token for the repository
 * @example
 * const token = getRepositoryToken(User, 'secondary'); // 'ES_REPOSITORY_USER_ES_CLIENT_SECONDARY'
 */
export const getRepositoryToken = (entity: { name: string }, clientName?: string): string => {
    const base = toUpper(`ES_REPOSITORY_${get(entity, 'name')}`);
    const name = toUpper(trim(clientName || 'default'));
    const clientToken = getElasticsearchClientToken(name);

    return `${base}_${clientToken}`;
};
