import * as fs from 'fs';
import * as path from 'path';
import Ajv from 'ajv/dist/2020';
import addFormats from 'ajv-formats';

export function resolveSpecDir(): string {
  const fromEnv = process.env.INTENTPROOF_SPEC_DIR?.trim();
  if (fromEnv && fs.existsSync(path.join(fromEnv, 'schema/execution_event.v1.schema.json'))) {
    return fromEnv;
  }
  const sibling = path.join(__dirname, '../../../intentproof-spec');
  if (fs.existsSync(path.join(sibling, 'schema/execution_event.v1.schema.json'))) {
    return sibling;
  }
  throw new Error(
    'intentproof-spec not found; set INTENTPROOF_SPEC_DIR to the spec repo root'
  );
}

let validateExecutionEvent: ReturnType<Ajv['compile']> | null = null;

export function getExecutionEventValidator(): ReturnType<Ajv['compile']> {
  if (validateExecutionEvent) {
    return validateExecutionEvent;
  }
  const specDir = resolveSpecDir();
  const schemaPath = path.join(specDir, 'schema/execution_event.v1.schema.json');
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
  const ajv = new Ajv({ strict: false, allowUnionTypes: true });
  addFormats(ajv);
  validateExecutionEvent = ajv.compile(schema);
  return validateExecutionEvent;
}

export function assertValidExecutionEvent(event: Record<string, unknown>): void {
  const validate = getExecutionEventValidator();
  const ok = validate(event);
  if (!ok) {
    throw new Error(
      `execution event failed schema validation: ${JSON.stringify(validate.errors, null, 2)}`
    );
  }
}
