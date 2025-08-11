import { Inject } from '@nestjs/common';

import { getElasticsearchClientToken } from './es.constants';

export type InjectElasticsearch = {
    (): ParameterDecorator;
    <TName extends string = 'default'>(name: TName): ParameterDecorator;
};

export const InjectElasticsearch: InjectElasticsearch = ((name?: string): ParameterDecorator =>
    Inject(getElasticsearchClientToken(name))) as InjectElasticsearch;
