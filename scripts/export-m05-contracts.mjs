import fs from 'node:fs';
import { schemas, collections } from '../shared/m05/entities.mjs';
import { RULE_SCHEMAS, ruleSchema } from '../shared/m05/rule-schemas.mjs';
const rule = structuredClone(ruleSchema);
rule.allOf = Object.entries(RULE_SCHEMAS).map(([name, parameters]) => ({
  if: { properties: { rule_type: { const: name } } }, then: { properties: { parameters } },
}));
const snapshot = { type: 'object', required: ['project', ...Object.keys(collections)], additionalProperties: false, properties: {
  project: schemas.project, ...Object.fromEntries(Object.keys(collections).map(name => [name, { type: 'array', maxItems: 10000, items: name === 'rules' ? rule : schemas[name] }])),
} };
const contract = { $schema: 'https://json-schema.org/draft/2020-12/schema', $id: 'urn:roadscape:m05:snapshot:v1', ...snapshot,
  description: 'S1 structural schema. Runtime additionally validates coordinate structure, projected CRS/unit conversion, rule mode conditionals, cross references, logical identity and quantity semantics; consult shared/m05/*.mjs.' };
const request = required => ({ required: true, content: { 'application/json': { schema: { type: 'object', additionalProperties: false, required, properties: Object.fromEntries(Object.entries({ project_id: { type: 'string' }, base_revision_id: { type: 'string' }, snapshot: { $ref: '#/components/schemas/Snapshot' }, change_summary: { type: 'string', minLength: 1, maxLength: 500 } }).filter(([key]) => required.includes(key))) } } } });
const responses = { 200: { description: 'success/data/project/revision/snapshot/request_id. Historical snapshots are immutable.' }, 201: { description: 'Created independent saved revision; does not imply engineering validation.' }, 400: { description: 'Malformed JSON / insecure transport' }, 401: { description: 'Account session required' }, 403: { description: 'Project permission / origin denied' }, 404: { description: 'Project/revision/route not found' }, 409: { description: 'Stale base revision or duplicate project. Read current version; no silent overwrite.' }, 413: { description: 'Body exceeds 2 MiB' }, 422: { description: 'Contract or cross-reference validation error' }, 500: { description: 'Storage error; transaction rolled back' }, 503: { description: 'Storage/auth disabled or unconfigured' } };
const projectParameter = { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } };
const openapi = { openapi: '3.1.0', info: { title: 'Roadscape M05 S1 isolated storage API', version: '0.1.0', description: 'Only implemented S1 routes. S2–S9, plant library search, previews/commits, exports and asset Blob APIs are not implemented. Disabled by default; trusted service-binding account authentication required. No anonymous model-cookie authorization.' }, servers: [{ url: '/api/v1' }], security: [{ accountSession: [] }], paths: {
  '/projects': { post: { summary: 'Create project and initial complete snapshot', requestBody: request(['project_id','snapshot','change_summary']), responses } },
  '/projects/{projectId}': { get: { summary: 'Read current or specified immutable revision', parameters: [projectParameter, { name: 'revision_id', in: 'query', required: false, schema: { type: 'string' } }], responses } },
  '/projects/{projectId}/snapshots': { post: { summary: 'Save complete manual snapshot with base revision optimistic locking (not S6 commit)', parameters: [projectParameter], requestBody: request(['base_revision_id','snapshot','change_summary']), responses } },
}, components: { securitySchemes: { accountSession: { type: 'apiKey', in: 'cookie', name: 'deployment-account-session', description: 'Actual cookie name defined by trusted M05_AUTH, not a cookie this API trusts directly.' } }, schemas: { Snapshot: snapshot } } };
const outputs = { 'snapshot.schema.json': contract, 'openapi.json': openapi };
for (const [name, data] of Object.entries(outputs)) fs.writeFileSync(new URL('../docs/m05/' + name, import.meta.url), JSON.stringify(data, null, 2) + '\n');
console.log('Exported M05 structural JSON Schema and implemented OpenAPI 3.1 routes.');
