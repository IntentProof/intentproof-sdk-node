/**
 * Posts signed ExecutionEvents to a configured ingest URL when set.
 */

const DEFAULT_LOCAL_INGEST_URL = 'http://127.0.0.1:9787/v1/events';

export function resolveIngestURL(explicit?: string): string | null {
  const raw = (explicit ?? process.env.INTENTPROOF_INGEST_URL ?? '').trim();
  if (raw) {
    return normalizeIngestURL(raw);
  }
  if (process.env.INTENTPROOF_USE_LOCAL_INGEST === '1') {
    return DEFAULT_LOCAL_INGEST_URL;
  }
  return null;
}

export function ingestRequestHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = (process.env.INTENTPROOF_INGEST_TOKEN ?? '').trim();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function normalizeIngestURL(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (trimmed.endsWith('/v1/events')) {
    return trimmed;
  }
  return trimmed + '/v1/events';
}

export class HttpExporter {
  private readonly ingestURL: string;
  private readonly pending = new Set<Promise<void>>();

  constructor(ingestURL: string) {
    this.ingestURL = ingestURL;
  }

  enqueue(event: Record<string, unknown>): void {
    const body = JSON.stringify(event);
    const task = fetch(this.ingestURL, {
      method: 'POST',
      headers: ingestRequestHeaders(),
      body,
    })
      .then(async (res) => {
        if (res.status === 202 || res.status === 200) {
          return;
        }
        const text = await res.text().catch(() => '');
        throw new Error(
          `ingest POST ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`
        );
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[intentproof] ingest export failed: ${msg}`);
      });

    this.pending.add(task);
    void task.finally(() => {
      this.pending.delete(task);
    });
  }

  async flush(): Promise<void> {
    await Promise.all([...this.pending]);
  }
}
