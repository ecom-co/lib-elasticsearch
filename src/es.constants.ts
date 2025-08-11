export const ES_DEFAULT_CLIENT_NAME = 'default';

export const ES_MODULE_OPTIONS = Symbol('ES_MODULE_OPTIONS');

// Metadata keys for document decorators
export const ES_DOCUMENT_METADATA = Symbol('es:document');
export const ES_FIELD_METADATA = Symbol('es:field');
export const ES_INDEX_METADATA = Symbol('es:index');

export const getElasticsearchClientToken = (name?: string): string => {
    const keyUpper = (name?.trim() || ES_DEFAULT_CLIENT_NAME).toUpperCase();
    return keyUpper === ES_DEFAULT_CLIENT_NAME.toUpperCase() ? 'ES_CLIENT' : `ES_CLIENT_${keyUpper}`;
};
