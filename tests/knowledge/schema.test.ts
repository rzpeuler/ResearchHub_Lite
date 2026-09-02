import assert from 'node:assert/strict'
import test from 'node:test'
import { KNOWLEDGE_SCHEMA_V03 } from '../../knowledge/schema/index.ts'

test('Schema 0.3 / Storage 1 identity and frozen vocabularies', () => {
  assert.deepEqual(KNOWLEDGE_SCHEMA_V03.identity, { schemaVersion: '0.3', storageFormatVersion: '1' })
  assert.deepEqual(KNOWLEDGE_SCHEMA_V03.canonicalObjectKinds, ['ThemeGroup', 'Entity', 'Relation', 'Claim', 'Source', 'Module', 'RawRef'])
  assert.deepEqual(KNOWLEDGE_SCHEMA_V03.entity.types, ['investment_theme', 'industry', 'company', 'product', 'technology'])
  assert.deepEqual(KNOWLEDGE_SCHEMA_V03.claim.types, ['fact', 'forecast', 'viewpoint', 'trend', 'risk'])
  assert.deepEqual(KNOWLEDGE_SCHEMA_V03.relation.types, ['theme_exposure', 'business_exposure', 'upstream_of', 'supplier_of', 'competes_with', 'owns_stake_in', 'offers_product', 'belongs_to_industry', 'component_of', 'develops_technology', 'uses_technology', 'applied_in', 'depends_on', 'substitutes_for'])
  assert.deepEqual(KNOWLEDGE_SCHEMA_V03.canonicalNamespaces, { themeGroup: 'theme-group:', entity: 'entity:', relation: 'relation:', claim: 'claim:', source: 'source:', module: 'module:' })
  assert.deepEqual(KNOWLEDGE_SCHEMA_V03.relation.definitions.offers_product.sourceTypes, ['company'])
  assert.deepEqual(KNOWLEDGE_SCHEMA_V03.relation.definitions.offers_product.targetTypes, ['product'])
  assert.match('raw-sha256-' + 'a'.repeat(64), new RegExp(KNOWLEDGE_SCHEMA_V03.rawIdentity.pattern))
})
