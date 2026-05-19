import { AsyncLocalStorage } from 'async_hooks';
import { ulid } from 'ulid';
import {
  SDK_VERSION,
  getExporter,
  getInstanceId,
  getOutbox,
  getPrivateKey,
  getTenantId,
} from './client';
import { eventContentHash, SENTINEL_PREV_HASH, signEvent } from './signing';

const correlationStorage = new AsyncLocalStorage<string>();

export function runWithCorrelationId<T>(id: string, fn: () => T): T {
  return correlationStorage.run(id, fn);
}

export function pushSubjectMapping(
  sourceId: string,
  subjectType: string,
  subjectId: string
): void {
  void sourceId;
  void subjectType;
  void subjectId;
}

function isoTimestamp(ms: number): string {
  return new Date(ms).toISOString();
}

function untrustedPayload(
  inputs: unknown[],
  output: unknown,
  status: 'ok' | 'error'
): boolean {
  if (inputs.length > 0) {
    return true;
  }
  return status === 'ok' && output !== null && output !== undefined;
}

export function wrap<T extends (...args: any[]) => any>(
  options: { intent: string; action: string },
  fn: T
) {
  return async function (...args: Parameters<T>): Promise<ReturnType<T>> {
    const t0 = Date.now();
    const correlationId = correlationStorage.getStore() || 'req_' + ulid();
    const eventId = ulid();

    let result;
    let status: 'ok' | 'error' = 'ok';
    let errorObj: { message: string } | null = null;
    let thrownError: unknown;
    let didThrow = false;

    try {
      result = await fn(...args);
    } catch (e: any) {
      didThrow = true;
      status = 'error';
      errorObj = { message: e?.message ?? String(e) };
      thrownError = e;
    }
    const t1 = Date.now();

    try {
      const outbox = getOutbox();
      let chainPos = 1;
      let prevHash = SENTINEL_PREV_HASH;
      const state = outbox.getChainState(correlationId);
      if (state) {
        chainPos = state.position + 1;
        prevHash = state.hash;
      }

      const event: Record<string, unknown> = {
        schema: 'intentproof.event.v1',
        event_id: eventId,
        tenant_id: getTenantId(),
        instance_id: getInstanceId(),
        correlation_id: correlationId,
        provenance_class: 'sdk_attested_evidence',
        prev_event_hash: prevHash,
        chain_position: chainPos,
        intent: options.intent,
        action: options.action,
        status,
        started_at: isoTimestamp(t0),
        completed_at: isoTimestamp(t1),
        duration_ms: t1 - t0,
        inputs: args,
        output: status === 'ok' ? result : null,
        error: errorObj,
        attributes: {},
        untrusted_payload: untrustedPayload(args, result, status),
        spec_version: '1.0.0',
        sdk_version: SDK_VERSION,
      };

      const signed = await signEvent(
        event,
        getPrivateKey(),
        getInstanceId()
      );
      const hash = eventContentHash(signed);
      outbox.append(eventId, signed);
      outbox.setChainState(correlationId, chainPos, hash);

      const exporter = getExporter();
      if (exporter) {
        exporter.enqueue(signed);
      }
    } catch (recordError) {
      if (didThrow) {
        if (thrownError instanceof Error) {
          (thrownError as Error & { cause?: unknown }).cause = recordError;
          throw thrownError;
        }
        if (thrownError !== undefined) {
          const err = new Error(String(thrownError));
          (err as Error & { cause?: unknown }).cause = recordError;
          throw err;
        }
        throw undefined;
      }
      throw recordError;
    }

    if (didThrow) {
      throw thrownError;
    }
    return result;
  };
}
