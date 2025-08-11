export const ES_DEFAULT_CLIENT_NAME = 'default';

export const ES_MODULE_OPTIONS = Symbol('ES_MODULE_OPTIONS');

export const getElasticsearchClientToken = (name?: string): string => {
    const keyUpper = (name?.trim() || ES_DEFAULT_CLIENT_NAME).toUpperCase();
    return keyUpper === ES_DEFAULT_CLIENT_NAME.toUpperCase() ? 'ES_CLIENT' : `ES_CLIENT_${keyUpper}`;
};
