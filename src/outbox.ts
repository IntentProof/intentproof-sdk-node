import Database from 'better-sqlite3';

export class Outbox {
  private db: Database.Database;
  
  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        event_id TEXT PRIMARY KEY,
        body JSON NOT NULL
      );
    `);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chains (
        correlation_id TEXT PRIMARY KEY,
        last_position INTEGER NOT NULL,
        last_hash TEXT NOT NULL
      );
    `);
  }

  append(eventId: string, body: any): void {
    const stmt = this.db.prepare('INSERT INTO events (event_id, body) VALUES (?, ?)');
    stmt.run(eventId, JSON.stringify(body));
  }

  getEvents(): any[] {
    const stmt = this.db.prepare('SELECT body FROM events');
    return stmt.all().map((r: any) => JSON.parse(r.body));
  }

  getChainState(correlationId: string): { position: number; hash: string } | null {
    const stmt = this.db.prepare('SELECT last_position, last_hash FROM chains WHERE correlation_id = ?');
    const row = stmt.get(correlationId) as any;
    if (!row) return null;
    return { position: row.last_position, hash: row.last_hash };
  }

  setChainState(correlationId: string, position: number, hash: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO chains (correlation_id, last_position, last_hash)
      VALUES (?, ?, ?)
      ON CONFLICT(correlation_id) DO UPDATE SET
        last_position = excluded.last_position,
        last_hash = excluded.last_hash
    `);
    stmt.run(correlationId, position, hash);
  }
}
