# @ecom-co/elasticsearch

NestJS Elasticsearch module built on `@elastic/elasticsearch` with:
- Multi-client DI (`default`, named clients)
- Decorators for document mapping (`@Document`, `@Field`)
- Optional auto index creation from decorators
- TypeORM-like repository pattern (`EsRepository`) and DI (`forFeature`, `@InjectEsRepository`)
- Optional health indicator utilities

## Install

```bash
npm i @ecom-co/elasticsearch @elastic/elasticsearch
```

Peer deps: `@nestjs/common`, `@nestjs/core`.

## Quick start

1) Define a document

```ts
import { Document, Field } from '@ecom-co/elasticsearch';

@Document({ index: 'products' })
export class Product {
  @Field({ type: 'keyword' }) id!: string;
  @Field({ type: 'text', analyzer: 'standard' }) name!: string;
  @Field({ type: 'double' }) price!: number;
}
```

2) Register clients (sync or async)

```ts
// app.module.ts
import { Module } from '@nestjs/common';
import { ElasticsearchModule } from '@ecom-co/elasticsearch';

@Module({
  imports: [
    ElasticsearchModule.forRoot({
      clients: [
        { name: 'default', node: 'http://localhost:9200' },
        { name: 'analytics', node: 'http://localhost:9200' },
      ],
      autoCreateIndices: true,
      documents: [Product],
    }),
  ],
})
export class AppModule {}
```

3) Feature module repositories (TypeORM-like)

```ts
// products.module.ts
import { Module } from '@nestjs/common';
import { ElasticsearchModule } from '@ecom-co/elasticsearch';
import { ProductsService } from './products.service';
import { Product } from './product.doc';

@Module({
  imports: [
    ElasticsearchModule.forFeature([Product]),
    ElasticsearchModule.forFeature([Product], 'analytics'),
  ],
  providers: [ProductsService],
})
export class ProductsModule {}
```

4) Inject repository

```ts
// products.service.ts
import { Injectable } from '@nestjs/common';
import { InjectEsRepository, EsRepository } from '@ecom-co/elasticsearch';
import { Product } from './product.doc';

@Injectable()
export class ProductsService {
  constructor(
    @InjectEsRepository(Product)
    private readonly repo: EsRepository<Product>,
    @InjectEsRepository(Product, 'analytics')
    private readonly analyticsRepo: EsRepository<Product>,
  ) {}

  async search(q: string) {
    const primary = await this.repo.search({
      query: { multi_match: { query: q, fields: ['name^2', 'id'] } },
      size: 20,
    });
    const secondary = await this.analyticsRepo.search({ q, size: 10 });
    return { primary, secondary };
  }

  // Access raw client when you need full power of the official API
  async raw() {
    const es = this.repo.getClient();
    return es.cat.indices({ format: 'json' });
  }
}
```

Optional: use a named client for this feature

```ts
// products.module.ts
@Module({
  imports: [ElasticsearchModule.forFeature([Product], 'analytics')],
  providers: [ProductsService],
})
export class ProductsModule {}

// products.service.ts
@Injectable()
export class ProductsService {
  constructor(
    @InjectEsRepository(Product, 'analytics')
    private readonly repo: EsRepository<Product>,
  ) {}
}
```

## Inject client directly (optional)

```ts
import { Injectable } from '@nestjs/common';
import { InjectElasticsearch, ElasticsearchClient } from '@ecom-co/elasticsearch';

@Injectable()
export class SearchService {
  constructor(@InjectElasticsearch() private readonly es: ElasticsearchClient) {}
}

// Named client
@Injectable()
export class AnalyticsSearch {
  constructor(@InjectElasticsearch('analytics') private readonly es: ElasticsearchClient) {}
}
```

## Health (optional)

```ts
import { checkElasticsearchHealthy } from '@ecom-co/elasticsearch';
await checkElasticsearchHealthy(esClient);
```

## Notes
- Register clients in the root module before using `forFeature`.
- DI tokens: `ES_CLIENT` (default) and `ES_CLIENT_<NAME>` for named clients.
- Repository token format: `<client>_EntityRepository` (default client omits prefix).

