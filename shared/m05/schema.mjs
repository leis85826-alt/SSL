// Shared, dependency-free validation of the explicitly supported JSON Schema subset.
export class ContractError extends Error {
  constructor(message, status = 422, code = 'INVALID_INPUT') { super(message); this.status = status; this.code = code; }
}
export function validate(schema, value, path = '$') {
  const fail = reason => { throw new ContractError(`${path}: ${reason}`); };
  if (schema.enum && !schema.enum.includes(value)) fail('不在允许值中');
  if (schema.type) {
    const type = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
    if (schema.type === 'integer' ? !Number.isSafeInteger(value) : type !== schema.type) fail('类型错误');
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('须为有限数值');
    if (schema.minimum !== undefined && value < schema.minimum) fail('低于最小值');
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) fail('须大于下限');
  }
  if (typeof value === 'string') {
    if (schema.minLength && value.trim().length < schema.minLength) fail('内容为空');
    if (schema.maxLength && value.length > schema.maxLength) fail('内容过长');
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) fail('格式错误');
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) fail('元素不足');
    if (schema.maxItems !== undefined && value.length > schema.maxItems) fail('元素过多');
    if (schema.items) value.forEach((v, i) => validate(schema.items, v, `${path}[${i}]`));
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const k of schema.required || []) if (!Object.hasOwn(value, k)) fail(`缺少 ${k}`);
    for (const [k, v] of Object.entries(value)) {
      if (schema.properties?.[k]) validate(schema.properties[k], v, `${path}.${k}`);
      else if (schema.additionalProperties === false) fail(`未知字段 ${k}`);
    }
  }
  return value;
}
export const text = { type: 'string', minLength: 1, maxLength: 500 };
export const id = { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$' };
export const positive = { type: 'number', exclusiveMinimum: 0 };
export const nonnegative = { type: 'number', minimum: 0 };
export const object = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
