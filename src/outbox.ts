import sqlite3 from 'sqlite3';
import { promisify } from 'util';

export class Outbox {
  private db: sqlite3.Database;
  
  constructor(dbPath: string) {
    this.db = new sqlite3.Database(dbPath);
    this.db.exec("PRAGMA journal_mode=WAL;");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        event_id TEXT PRIMARY KEY,
        body JSON NOT NULL
      );
    `);
  }

  async append(eventId: string, body: any): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run('INSERT INTO events (event_id, body) VALUES (?, ?)', [eventId, JSON.stringify(body)], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async getEvents(): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT body FROM events', (err, rows: any[]) => {
        if (err) reject(err);
        else resolve(rows.map(r => JSON.parse(r.body)));
      });
    });
  }
}
