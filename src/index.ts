export * from './es.constants';
export * from './es.interfaces';
export * from './es.decorators';
export * from './es.module';
export * from './es.service';
export * from './es.utils';
export * from './terminus/es.health';

// Re-export specific decorators for convenience
export { Document, Field, Index } from './es.decorators';
export {
    getDocumentMetadata,
    getFieldsMetadata,
    getIndexMetadata,
    buildDocumentMetadata,
    toElasticsearchDocument,
} from './es.utils';
