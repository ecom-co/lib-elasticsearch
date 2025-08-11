import { Injectable } from '@nestjs/common';

import type { QueryDslQueryContainer, SearchResponse } from '@elastic/elasticsearch/lib/api/types';

import { getElasticsearchClientToken } from './es.constants';
import type { ElasticsearchClient } from './es.interfaces';
import { buildDocumentMetadata, getDocumentMetadata, toElasticsearchDocument } from './es.utils';

export type Constructor<T = any, Arguments extends unknown[] = any[]> = new (...arguments_: Arguments) => T;
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
     * Target index name derived from the entity `@Document` metadata.
     */
    protected get index(): string {
        const meta = getDocumentMetadata(this.entityCtor);
        if (!meta) throw new Error('Missing @Document metadata for repository entity');
        return meta.index;
    }

    /** Check if the target index exists. */
    async indexExists(): Promise<boolean> {
        const res = await this.es.indices.exists({ index: this.index });
        return Boolean(res);
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
            { index: meta.index, settings: meta.settings, mappings: meta.mappings },
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
        await this.es.index({ index: this.index, id, document: toElasticsearchDocument(entity) });
    }

    /** Bulk index entities using index action. */
    async bulkIndex(entities: ReadonlyArray<T>): Promise<void> {
        if (entities.length === 0) return;
        const operations: Array<Record<string, unknown>> = [];
        for (const e of entities) {
            operations.push({ index: { _index: this.index } });
            operations.push(toElasticsearchDocument(e));
        }
        await this.es.bulk({ operations });
    }

    /** Bulk delete documents by ids. */
    async bulkDeleteByIds(ids: ReadonlyArray<string>): Promise<void> {
        if (ids.length === 0) return;
        const operations: Array<Record<string, unknown>> = [];
        for (const id of ids) {
            operations.push({ delete: { _index: this.index, _id: id } });
        }
        await this.es.bulk({ operations });
    }

    /** Bulk update documents by ids with partial docs. */
    async bulkUpdateByIds(updates: ReadonlyArray<{ id: string; doc: Partial<T> }>): Promise<void> {
        if (updates.length === 0) return;
        const operations: Array<Record<string, unknown>> = [];
        for (const { id, doc } of updates) {
            operations.push({ update: { _index: this.index, _id: id } });
            operations.push({ doc: doc as Record<string, unknown> });
        }
        await this.es.bulk({ operations });
    }

    /** Delete a single document by id. */
    async deleteById(id: string): Promise<void> {
        await this.es.delete({ index: this.index, id });
    }

    /** Partially update a single document by id. */
    async updateById(id: string, partial: Partial<T>): Promise<void> {
        await this.es.update<T, Partial<T>>({ index: this.index, id, doc: partial });
    }

    /** Upsert a single document by id with the given partial body. */
    async upsertById(id: string, partial: Partial<T>): Promise<void> {
        await this.es.update<T, Partial<T>>({ index: this.index, id, doc: partial, doc_as_upsert: true });
    }

    /** Update a single document by id using an inline script. */
    async updateByIdScript(
        id: string,
        script: { source: string; lang?: string; params?: Record<string, unknown> },
    ): Promise<void> {
        await this.es.update<T, unknown>({ index: this.index, id, script });
    }

    /** Update a document by id then return the latest `_source`. */
    async updateByIdAndGetSource(
        id: string,
        partial: Partial<T>,
        options?: { refresh?: boolean | 'wait_for' },
    ): Promise<T | undefined> {
        await this.es.update<T, Partial<T>>({ index: this.index, id, doc: partial, refresh: options?.refresh });
        const res = await this.es.get<T>({ index: this.index, id });
        return res._source ?? undefined;
    }

    /** Upsert a document by id then return the latest `_source`. */
    async upsertByIdAndGetSource(
        id: string,
        partial: Partial<T>,
        options?: { refresh?: boolean | 'wait_for' },
    ): Promise<T | undefined> {
        await this.es.update<T, Partial<T>>({
            index: this.index,
            id,
            doc: partial,
            doc_as_upsert: true,
            refresh: options?.refresh,
        });
        const res = await this.es.get<T>({ index: this.index, id });
        return res._source ?? undefined;
    }

    /** Update a document by id with a script then return the latest `_source`. */
    async updateByIdScriptAndGetSource(
        id: string,
        script: { source: string; lang?: string; params?: Record<string, unknown> },
        options?: { refresh?: boolean | 'wait_for' },
    ): Promise<T | undefined> {
        await this.es.update<T, unknown>({ index: this.index, id, script, refresh: options?.refresh });
        const res = await this.es.get<T>({ index: this.index, id });
        return res._source ?? undefined;
    }

    /** Check if a document exists by id. */
    async exists(id: string): Promise<boolean> {
        const res = await this.es.exists({ index: this.index, id });
        return Boolean(res);
    }

    /** Get a document by id (raw response). */
    async findById(id: string): Promise<unknown> {
        return this.es.get({ index: this.index, id });
    }

    /** Get a document `_source` by id, or `undefined` if not found. */
    async findSourceById(id: string): Promise<T | undefined> {
        const found = await this.exists(id);
        if (!found) return undefined;
        const res = await this.es.get<T>({ index: this.index, id });
        return res._source ?? undefined;
    }

    /** Multi-get sources by ids (aligned with input order). */
    async mgetSources(ids: ReadonlyArray<string>): Promise<Array<T | undefined>> {
        if (ids.length === 0) return [];
        type InlineGet<TDoc> = { found?: boolean; _source?: TDoc };
        const res = await this.es.mget<T>({
            docs: ids.map((id) => ({ _index: this.index, _id: id })),
        } as Omit<Parameters<ElasticsearchClient['mget']>[0], 'index'>);
        const docs = (res as { docs?: Array<InlineGet<T>> }).docs ?? [];
        return docs.map((d) => (d && d.found ? (d._source as T) : undefined));
    }

    /** Count documents matching a query. */
    async count(query?: QueryDslQueryContainer): Promise<number> {
        const res = await this.es.count({ index: this.index, query });
        return res.count;
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
        args: {
            script: { source: string; lang?: string; params?: Record<string, unknown> };
            query: QueryDslQueryContainer;
        } & Omit<Parameters<ElasticsearchClient['updateByQuery']>[0], 'index' | 'script' | 'query'>,
    ): Promise<unknown> {
        const { script, query, ...rest } = args;
        return this.es.updateByQuery({ index: this.index, script, query, ...rest });
    }

    /** Low-level passthrough for search request params. */
    async searchRaw<TDoc = T>(
        params: Omit<Parameters<ElasticsearchClient['search']>[0], 'index'>,
    ): Promise<SearchResponse<TDoc>> {
        return this.es.search<TDoc>({ index: this.index, ...params });
    }

    /** Search and return the full typed response. */
    async search(params: Omit<Parameters<ElasticsearchClient['search']>[0], 'index'>): Promise<SearchResponse<T>> {
        const request = { index: this.index, ...params } as Omit<
            Parameters<ElasticsearchClient['search']>[0],
            'index'
        > & { index: string };
        return this.es.search<T>(request);
    }

    /** Search and return the `_source` array. */
    async searchSources(params: Omit<Parameters<ElasticsearchClient['search']>[0], 'index'>): Promise<T[]> {
        const res = await this.search(params);
        const hits = res.hits?.hits ?? [];
        return hits.map((h) => h._source).filter((s): s is T => s != null);
    }

    /** Search and return only document ids. */
    async searchIds(params: Omit<Parameters<ElasticsearchClient['search']>[0], 'index'>): Promise<string[]> {
        const res = await this.search(params);
        const hits = res.hits?.hits ?? [];
        return hits.map((h) => String(h._id)).filter((id) => !!id);
    }

    /** Search and return the first hit `_source`, if any. */
    async searchFirstSource(
        params: Omit<Parameters<ElasticsearchClient['search']>[0], 'index'>,
    ): Promise<T | undefined> {
        const res = await this.search({ ...params, size: 1 });
        const hit = res.hits?.hits?.[0];
        return hit?._source ?? undefined;
    }
}

/**
 * Build a DI token for a repository of a given entity and client name.
 * @param entity Entity constructor (uses `name`)
 * @param clientName Optional client name (defaults to `default`)
 */
export const getRepositoryToken = (entity: { name: string }, clientName?: string): string => {
    const base = `ES_REPOSITORY_${entity.name}`.toUpperCase();
    const name = (clientName || 'default').trim().toUpperCase();
    const clientToken = getElasticsearchClientToken(name);
    return `${base}_${clientToken}`;
};
