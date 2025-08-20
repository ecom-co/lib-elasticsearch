import toUpper from 'lodash/toUpper';
import trim from 'lodash/trim';

export const ES_DEFAULT_CLIENT_NAME = 'default';

export const ES_MODULE_OPTIONS = Symbol('ES_MODULE_OPTIONS');

// Metadata keys for document decorators
export const ES_DOCUMENT_METADATA = Symbol('es:document');

export const ES_FIELD_METADATA = Symbol('es:field');

export const ES_INDEX_METADATA = Symbol('es:index');

export const getElasticsearchClientToken = (name?: string): string => {
    const keyUpper = toUpper(trim(name) || ES_DEFAULT_CLIENT_NAME);

    return keyUpper === toUpper(ES_DEFAULT_CLIENT_NAME) ? 'ES_CLIENT' : `ES_CLIENT_${keyUpper}`;
};
