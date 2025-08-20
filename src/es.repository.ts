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
 * Base Elasticsearch repository providing CRUD, bulk, query, and search helpers
 * for an entity `T` described via `@Document`/`@Field` decorators.
 */
@Injectable()
export class EsRepository<T extends object> {
    /**
     * Create a repository for the given entity constructor using the provided client.
     * @param es Elasticsearch client instance
     * @param entityCtor Entity constructor decorated with `@Document`
     */
    constructor(
        protected readonly es: ElasticsearchClient,
        protected readonly entityCtor: Constructor<T>,
    ) {}

    /**
     * Access the underlying Elasticsearch client for advanced/raw operations.
     */
    getClient(): ElasticsearchClient {
        return this.es;
    }

    /**
     * Create a class instance of the repository entity from a plain source object.
     */
    protected createEntity(source: Partial<T>): T {
        const proto = this.entityCtor.prototype as unknown as object;
        const instance = Object.create(proto) as T;

        assign(instance, source);

        return instance;
    }

    /**
     * Target index name derived from the entity `@Document` metadata.
     */
    protected get index(): string {
        const meta = getDocumentMetadata(this.entityCtor);

        if (!meta) throw new Error('Missing @Document metadata for repository entity');

        return get(meta, 'index');
    }

    /** Check if the target index exists. */
    async indexExists(): Promise<boolean> {
        const res = await this.es.indices.exists({ index: this.index });

        return isBoolean(res) ? res : false;
    }

    /** Delete the target index (ignores 404). */
    async deleteIndex(): Promise<void> {
        await this.es.indices.delete({ index: this.index }, { ignore: [404] });
    }

    /**
     * Create the index with settings and mappings built from decorators.
     * No-op if entity has no `@Document` metadata.
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

    /** Refresh the target index. */
    async refresh(): Promise<void> {
        await this.es.indices.refresh({ index: this.index });
    }

    /**
     * Index a single entity. If `id` omitted, ES will generate one.
     * @param entity Entity instance
     * @param id Optional document id
     */
    async indexOne(entity: T, id?: string): Promise<void> {
        await this.es.index({ id, document: toElasticsearchDocument(entity), index: this.index });
    }

    /** Bulk index entities using index action. */
    async bulkIndex(entities: ReadonlyArray<T>): Promise<void> {
        if (isEmpty(entities)) return;

        const operations: Array<Record<string, unknown>> = [];

        forEach(entities, (e) => {
            operations.push({ index: { _index: this.index } });
            operations.push(toElasticsearchDocument(e));
        });
        await this.es.bulk({ operations });
    }

    /** Bulk delete documents by ids. */
    async bulkDeleteByIds(ids: ReadonlyArray<string>): Promise<void> {
        if (isEmpty(ids)) return;

        const operations: Array<Record<string, unknown>> = [];

        forEach(ids, (id) => {
            operations.push({ delete: { _id: id, _index: this.index } });
        });
        await this.es.bulk({ operations });
    }

    /** Bulk update documents by ids with partial docs. */
    async bulkUpdateByIds(updates: ReadonlyArray<{ doc: Partial<T>; id: string }>): Promise<void> {
        if (isEmpty(updates)) return;

        const operations: Array<Record<string, unknown>> = [];

        forEach(updates, ({ id, doc }) => {
            operations.push({ update: { _id: id, _index: this.index } });
            operations.push({ doc: doc as Record<string, unknown> });
        });
        await this.es.bulk({ operations });
    }

    /** Delete a single document by id. */
    async deleteById(id: string): Promise<void> {
        await this.es.delete({ id, index: this.index });
    }

    /** Partially update a single document by id. */
    async updateById(id: string, partial: Partial<T>): Promise<void> {
        await this.es.update<T, Partial<T>>({ id, doc: partial, index: this.index });
    }

    /** Upsert a single document by id with the given partial body. */
    async upsertById(id: string, partial: Partial<T>): Promise<void> {
        await this.es.update<T, Partial<T>>({ id, doc: partial, doc_as_upsert: true, index: this.index });
    }

    /** Update a single document by id using an inline script. */
    async updateByIdScript(
        id: string,
        script: { lang?: string; params?: Record<string, unknown>; source: string },
    ): Promise<void> {
        await this.es.update<T, unknown>({ id, index: this.index, script });
    }

    /** Update a document by id then return the latest `_source`. */
    async updateByIdAndGetSource(
        id: string,
        partial: Partial<T>,
        options?: { refresh?: 'wait_for' | boolean },
    ): Promise<T | undefined> {
        await this.es.update<T, Partial<T>>({ id, doc: partial, index: this.index, refresh: get(options, 'refresh') });
        const res = await this.es.get<T>({ id, index: this.index });

        return get(res, '_source');
    }

    /** Upsert a document by id then return the latest `_source`. */
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

    /** Update a document by id with a script then return the latest `_source`. */
    async updateByIdScriptAndGetSource(
        id: string,
        script: { lang?: string; params?: Record<string, unknown>; source: string },
        options?: { refresh?: 'wait_for' | boolean },
    ): Promise<T | undefined> {
        await this.es.update<T, unknown>({ id, index: this.index, refresh: get(options, 'refresh'), script });
        const res = await this.es.get<T>({ id, index: this.index });

        return get(res, '_source');
    }

    /** Check if a document exists by id. */
    async exists(id: string): Promise<boolean> {
        const res = await this.es.exists({ id, index: this.index });

        return isBoolean(res) ? res : false;
    }

    /** Get a document by id (raw response). */
    async findById(id: string): Promise<unknown> {
        return this.es.get({ id, index: this.index });
    }

    /** Get a document `_source` by id, or `undefined` if not found. */
    async findSourceById(id: string): Promise<T | undefined> {
        const found = await this.exists(id);

        if (!found) return undefined;

        const res = await this.es.get<T>({ id, index: this.index });

        return get(res, '_source');
    }

    /** Multi-get sources by ids (aligned with input order). */
    async mgetSources(ids: ReadonlyArray<string>): Promise<Array<T | undefined>> {
        if (isEmpty(ids)) return [];

        type InlineGet<TDoc> = { _source?: TDoc; found?: boolean };
        const res = await this.es.mget<T>({
            docs: map(ids, (id) => ({ _id: id, _index: this.index })),
        } as Omit<Parameters<ElasticsearchClient['mget']>[0], 'index'>);
        const docs = get(res, 'docs', []) as Array<InlineGet<T>>;

        return map(docs, (d) => (get(d, 'found') ? (get(d, '_source') as T) : undefined));
    }

    /** Count documents matching a query. */
    async count(query?: QueryDslQueryContainer): Promise<number> {
        const res = await this.es.count({ index: this.index, query });

        return get(res, 'count', 0);
    }

    /** Delete documents matching a query. */
    async deleteByQuery(query: QueryDslQueryContainer): Promise<void> {
        await this.es.deleteByQuery({ index: this.index, query });
    }

    /** Low-level passthrough for update-by-query request params. */
    async updateByQueryRaw(
        params: Omit<Parameters<ElasticsearchClient['updateByQuery']>[0], 'index'>,
    ): Promise<unknown> {
        return this.es.updateByQuery({ index: this.index, ...params });
    }

    /** Update-by-query using an inline script. */
    async updateByQueryScript(
        args: Omit<Parameters<ElasticsearchClient['updateByQuery']>[0], 'index' | 'query' | 'script'> & {
            query: QueryDslQueryContainer;
            script: { lang?: string; params?: Record<string, unknown>; source: string };
        },
    ): Promise<unknown> {
        const { query, script, ...rest } = args;

        return this.es.updateByQuery({ index: this.index, query, script, ...rest });
    }

    /** Low-level passthrough for search request params. */
    async searchRaw<TDoc = T>(
        params: Omit<Parameters<ElasticsearchClient['search']>[0], 'index'>,
    ): Promise<SearchResponse<TDoc>> {
        return this.es.search<TDoc>({ index: this.index, ...params });
    }

    /** Search and return the full typed response. */
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

    /** Search and return the `_source` array. */
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

    /** Search and return hydrated entity instances. */
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

    /** Search and return only document ids. */
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

    /** Search and return the first hit `_source`, if any. */
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

    /** Search and return sources along with ES metadata (index, id, score). */
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

    /** Search and return first source with ES metadata (index, id, score), if any. */
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

    /** Search and return the first hydrated entity, if any. */
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

    /** Get one document by id and hydrate into entity instance. */
    async findEntityById(id: string): Promise<T | undefined> {
        const src = await this.findSourceById(id);

        return isNil(src) ? undefined : this.createEntity(src);
    }
}

/**
 * Build a DI token for a repository of a given entity and client name.
 * @param entity Entity constructor (uses `name`)
 * @param clientName Optional client name (defaults to `default`)
 */
export const getRepositoryToken = (entity: { name: string }, clientName?: string): string => {
    const base = toUpper(`ES_REPOSITORY_${get(entity, 'name')}`);
    const name = toUpper(trim(clientName || 'default'));
    const clientToken = getElasticsearchClientToken(name);

    return `${base}_${clientToken}`;
};
