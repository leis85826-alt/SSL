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
const openapi = { openapi: '3.1.0', info: { title: 'Roadscape M05 S1 isolated storage API', version: '0.2.0', description: 'Implemented S1 project/history/file routes. S2–S9 algorithms, previews/commits and engineering exports remain unavailable. Disabled by default; verified Cloudflare Access JWT or trusted private account service required. Model cookies are not project identities.' }, servers: [{ url: '/api/v1' }], security: [{ accountSession: [] }], paths: {
  '/projects': { get: { summary: 'List up to 100 accessible projects for the current account', responses }, post: { summary: 'Create project and initial complete snapshot', requestBody: request(['project_id','snapshot','change_summary']), responses } },
  '/projects/{projectId}': { get: { summary: 'Read current or specified immutable revision', parameters: [projectParameter, { name: 'revision_id', in: 'query', required: false, schema: { type: 'string' } }], responses } },
  '/projects/{projectId}/snapshots': { post: { summary: 'Save complete manual snapshot with base revision optimistic locking (not S6 commit)', parameters: [projectParameter], requestBody: request(['base_revision_id','snapshot','change_summary']), responses } },
'/me': { get: { summary: 'Read stable account ID and file-storage readiness', responses } },
  '/login': { get: { summary: 'After Access authentication, return to workbench; unconfigured login is unavailable', responses: {303:{description:'Return to /'},401:{description:'Access login required'},503:{description:'Cloud sync unconfigured'}} } },
  '/status': { get: { summary: 'Configuration/authentication flags only; Access edge may still protect this path', security: [], responses } },
  '/projects/{projectId}/revisions': { get: { summary: 'Read immutable revision metadata', parameters:[projectParameter], responses } },
  '/projects/{projectId}/assets': { get: { summary: 'List private file metadata for an authorized project', parameters:[projectParameter], responses } },
  '/projects/{projectId}/assets/{assetId}': {
    parameters:[projectParameter,{name:'assetId',in:'path',required:true,schema:{type:'string'}}],
    get:{summary:'Download authorized private attachment (forced download)',responses:{...responses,200:{description:'Private binary attachment',content:{'application/octet-stream':{schema:{type:'string',format:'binary'}}}}}},
    put:{summary:'Upload immutable file; same ID with different content is 409',parameters:[{name:'X-File-Name',in:'header',required:true,schema:{type:'string'},description:'encodeURIComponent filename'},{name:'X-File-Sha256',in:'header',required:true,schema:{type:'string',pattern:'^[a-f0-9]{64}$'}},{name:'X-Asset-Purpose',in:'header',schema:{enum:['FILE','WORKBENCH_MANIFEST']}}],requestBody:{required:true,content:{'application/octet-stream':{schema:{type:'string',format:'binary',description:'25 MiB maximum; WORKBENCH_MANIFEST JSON maximum 2 MiB'}}}},responses}
  },
}, components: { securitySchemes: { accountSession: { type: 'apiKey', in: 'cookie', name: 'CF_Authorization', description: 'Cloudflare Access session or configured private account service. Worker verifies JWT cryptographically; injected identity/email headers alone are never sufficient.' } }, schemas: { Snapshot: snapshot } } };
const outputs = { 'snapshot.schema.json': contract, 'openapi.json': openapi };
for (const [name, data] of Object.entries(outputs)) fs.writeFileSync(new URL('../docs/m05/' + name, import.meta.url), JSON.stringify(data, null, 2) + '\n');
console.log('Exported M05 structural JSON Schema and implemented OpenAPI 3.1 routes.');
