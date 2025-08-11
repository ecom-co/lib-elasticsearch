# @ecom-co/elasticsearch

NestJS Elasticsearch module built on `@elastic/elasticsearch` with multi-client support and optional health indicator. Exposes the full client API via DI tokens.

## Install

```bash
npm i @ecom-co/elasticsearch @elastic/elasticsearch
```

Peer deps: `@nestjs/common`, `@nestjs/core`.

## Usage

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


