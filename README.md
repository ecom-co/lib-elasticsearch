# @ecom-co/elasticsearch

NestJS Elasticsearch module built on `@elastic/elasticsearch` with multi-client support and optional health indicator. Exposes the full client API via DI tokens.

## Install

```bash
npm i @ecom-co/elasticsearch @elastic/elasticsearch
```

Peer deps: `@nestjs/common`, `@nestjs/core`.

## Usage

### Decorators (document mapping)

```ts
import { Document, Field } from '@ecom-co/elasticsearch';

@Document({ index: 'products' })
export class Product {
  @Field({ type: 'keyword' }) id!: string;
  @Field({ type: 'text', analyzer: 'standard' }) name!: string;
  @Field({ type: 'double' }) price!: number;
}
```

Create index and mappings from metadata:

```ts
import {
  InjectElasticsearch,
  ElasticsearchClient,
  buildDocumentMetadata,
  getDocumentMetadata,
  toElasticsearchDocument,
} from '@ecom-co/elasticsearch';

export class ProductService {
  constructor(@InjectElasticsearch() private readonly es: ElasticsearchClient) {}

  async ensureIndex() {
    const meta = buildDocumentMetadata(Product);
    if (!meta) return;
    await this.es.indices.create(
      { index: meta.index, settings: meta.settings, mappings: meta.mappings },
      { ignore: [400] },
    );
  }

  async indexOne(p: Product) {
    const { index } = getDocumentMetadata(Product)!;
    await this.es.index({ index, id: p.id, document: toElasticsearchDocument(p) });
    await this.es.indices.refresh({ index });
  }

  async search(q: string) {
    const { index } = getDocumentMetadata(Product)!;
    return this.es.search({ index, query: { multi_match: { query: q, fields: ['name^2', 'id'] } } });
  }
}
```

### Register (sync)

```ts
import { Module } from '@nestjs/common';
import { ElasticsearchModule } from '@ecom-co/elasticsearch';

@Module({
  imports: [
    ElasticsearchModule.forRoot({
      clients: [
        { name: 'default', node: 'http://localhost:9200' },
        { name: 'analytics', node: 'http://localhost:9201' },
      ],
      // Optional: auto-create indices from provided documents on startup
      autoCreateIndices: true,
      documents: [Product],
    }),
  ],
})
export class AppModule {}
```

or async:

```ts
ElasticsearchModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    clients: [
      { name: 'default', node: config.get('ES_NODE') },
      { name: 'secure', node: config.get('ES_SECURE_NODE'), auth: { apiKey: config.get('ES_API_KEY') } },
    ],
    // Optional: auto-create indices from provided documents on startup
    autoCreateIndices: true,
    documents: [Product],
  }),
  // Optional in async mode: predeclare names to enable direct DI by name
  predeclare: ['secure'],
});
```

### Inject client

```ts
import { Injectable } from '@nestjs/common';
import { InjectElasticsearch, ElasticsearchClient } from '@ecom-co/elasticsearch';

@Injectable()
export class SearchService {
  constructor(@InjectElasticsearch() private readonly es: ElasticsearchClient) {}

  async searchUsers(q: string) {
    return this.es.search({ index: 'users', query: { query_string: { query: q } } });
  }
}
```

Inject a named client (sync or async with predeclared name):

```ts
@Injectable()
export class AnalyticsSearch {
  constructor(@InjectElasticsearch('analytics') private readonly es: ElasticsearchClient) {}
}
```

### Health (optional)

```ts
import { checkElasticsearchHealthy } from '@ecom-co/elasticsearch';
const res = await checkElasticsearchHealthy(esClient);
```

## Notes
- Dependencies are peers; install them in the app.
- Exposes root-only API. Avoid deep imports.
- Tokens are uppercase: `ES_CLIENT` (default) and `ES_CLIENT_<NAME>` for named clients.
- Names in DI are case-insensitive; internally normalized.

### Optional: Repository pattern (TypeORM-like)

Provides a lightweight base repository leveraging decorators.

```ts
// If not exported at root in your version, import from the file path
import { EsRepository, InjectElasticsearch, ElasticsearchClient } from '@ecom-co/elasticsearch';

export class ProductRepository extends EsRepository<Product> {
  constructor(@InjectElasticsearch() es: ElasticsearchClient) {
    super(es, Product);
  }
}

// Usage
await repo.ensureIndex();
await repo.indexOne({ id: 'p1', name: 'iPhone', price: 999 });
const res = await repo.search({ query: { match: { name: 'iphone' } }, size: 20 });
```

#### Extra helpers available in the base repository

- Index management:
  - `indexExists()`
  - `ensureIndex()`
  - `deleteIndex()`
  - `refresh()`

- Single doc:
  - `indexOne(entity, id?)`
  - `findById(id)` / `findSourceById(id)`
  - `exists(id)`
  - `deleteById(id)`
  - `updateById(id, partial)`
  - `upsertById(id, partial)`
  - Scripted update: `updateByIdScript(id, { source, params?, lang? })`
  - Update and return latest `_source`:
    - `updateByIdAndGetSource(id, partial, { refresh? })`
    - `upsertByIdAndGetSource(id, partial, { refresh? })`
    - `updateByIdScriptAndGetSource(id, { source, params?, lang? }, { refresh? })`

- Bulk:
  - `bulkIndex(entities)`
  - `bulkDeleteByIds(ids)`
  - `bulkUpdateByIds([{ id, doc }])`
  - `mgetSources(ids)` → `(T | undefined)[]`

- Query-based:
  - `count(query?)`
  - `deleteByQuery(query)`
  - `updateByQueryRaw(params)`
  - Scripted: `updateByQueryScript({ script, query, ...rest })`

- Search helpers:
  - `search(params)` → typed `SearchResponse<T>`
  - `searchRaw(params)`
  - `searchSources(params)` → `T[]`
  - `searchIds(params)` → `string[]`
  - `searchFirstSource(params)` → `T | undefined`

Example scripted updates and read-after-update:

```ts
// Scripted update for a single document
await repo.updateByIdScript('p1', {
  source: 'ctx._source.stock = (ctx._source.stock ?: 0) + params.delta',
  params: { delta: 5 },
});

// Update and immediately read latest _source
const updated = await repo.updateByIdAndGetSource('p1', { price: 899 }, { refresh: 'wait_for' });

// Upsert and read latest _source
const upserted = await repo.upsertByIdAndGetSource('p2', { id: 'p2', name: 'iPad', price: 499 });

// Scripted update by query
await repo.updateByQueryScript({
  query: { term: { status: 'active' } },
  script: { source: 'ctx._source.rank = params.r', params: { r: 10 } },
  refresh: true,
});
```


