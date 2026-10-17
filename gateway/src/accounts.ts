import { createHash, createHmac, randomBytes } from 'node:crypto';
import { openSync, closeSync, writeFileSync, readFileSync, mkdirSync, unlinkSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import * as argon2 from 'argon2';

const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const NAME = /^[A-Za-z][A-Za-z0-9]{2,19}$/;

export type Account = { id: number; name: string };

export class Accounts {
  private db: DatabaseSync;
  private key: Buffer;
  private players: string;

  constructor(privateDir: string, players: string, private reservedPlayers?: string) {
    mkdirSync(privateDir, { recursive: true, mode: 0o700 });
    mkdirSync(players, { recursive: true, mode: 0o700 });
    this.players = players;
    const keyPath = join(privateDir, 'pike-secret.key');
    try {
      const fd = openSync(keyPath, 'wx', 0o600);
      try { writeFileSync(fd, randomBytes(32)); } finally { closeSync(fd); }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    this.key = readFileSync(keyPath);
    if (this.key.length !== 32) throw new Error('Invalid Pike secret key');
    this.db = new DatabaseSync(join(privateDir, 'accounts.sqlite'));
    this.db.exec(`PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS accounts (
        id INTEGER PRIMARY KEY, name TEXT NOT NULL, name_key TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL, created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id),
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);`);
  }

  private credential(name: string): string {
    return createHmac('sha256', this.key).update('pike-v1\0').update(name.toLowerCase()).digest('hex');
  }

  pikeCredential(account: Account): string { return this.credential(account.name); }

  async register(name: string, password: string, gender: number): Promise<{ account: Account; token: string }> {
    if (!NAME.test(name)) throw new PublicError(400, 'Name must be 3–20 ASCII letters or digits and start with a letter');
    if (typeof password !== 'string' || password.length < 12 || password.length > 256)
      throw new PublicError(400, 'Password must be 12–256 characters');
    if (gender !== 1 && gender !== 2) throw new PublicError(400, 'Gender must be 1 or 2');
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const nameKey = name.toLowerCase();
    const path = join(this.players, `${name}.o`);
    let fileCreated = false;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (this.db.prepare('SELECT 1 FROM accounts WHERE name_key = ?').get(nameKey))
        throw new PublicError(409, 'Name is unavailable');
      // Case-insensitive collision protection against existing player files.
      const existing = [...readdirSync(this.players),
        ...(this.reservedPlayers && existsSync(this.reservedPlayers) ? readdirSync(this.reservedPlayers) : [])];
      if (existing.some(file => file.toLowerCase() === `${nameKey}.o`))
        throw new PublicError(409, 'Name is unavailable');
      const fd = openSync(path, 'wx', 0o600);
      fileCreated = true;
      try {
        writeFileSync(fd, `name=${name}\npassword=${this.credential(name)}\ngender=${gender}\nmodel=${gender === 1 ? 'brwm.ani' : 'blwf.ani'}\ntexture=woman8_.tm2\n`);
      } finally { closeSync(fd); }
      const id = Number(this.db.prepare('INSERT INTO accounts (name,name_key,password_hash,created_at) VALUES (?,?,?,?)')
        .run(name, nameKey, passwordHash, Date.now()).lastInsertRowid);
      const account = { id, name };
      const token = this.createSession(account);
      this.db.exec('COMMIT');
      return { account, token };
    } catch (error) {
      this.db.exec('ROLLBACK');
      if (fileCreated) unlinkSync(path);
      throw error;
    }
  }

  async login(name: string, password: string): Promise<{ account: Account; token: string }> {
    if (typeof password !== 'string' || password.length > 256) throw new PublicError(401, 'Invalid credentials');
    const row = NAME.test(name) ? this.db.prepare('SELECT id,name,password_hash FROM accounts WHERE name_key = ?')
      .get(name.toLowerCase()) as { id: number; name: string; password_hash: string } | undefined : undefined;
    let valid = false;
    if (row) {
      try { valid = await argon2.verify(row.password_hash, password); } catch { /* Invalid credentials. */ }
    }
    if (!row || !valid) throw new PublicError(401, 'Invalid credentials');
    const account = { id: row.id, name: row.name };
    return { account, token: this.createSession(account) };
  }

  private createSession(account: Account): string {
    const token = randomBytes(32).toString('base64url');
    this.db.prepare('INSERT INTO sessions (token_hash,account_id,expires_at) VALUES (?,?,?)')
      .run(this.digest(token), account.id, Date.now() + SESSION_MS);
    return token;
  }

  private digest(token: string): string { return createHash('sha256').update(token).digest('hex'); }

  session(token: string | undefined): Account | undefined {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return undefined;
    const row = this.db.prepare(`SELECT a.id,a.name FROM sessions s JOIN accounts a ON a.id=s.account_id
      WHERE s.token_hash=? AND s.expires_at>?`).get(this.digest(token), Date.now());
    return row as Account | undefined;
  }

  logout(token: string | undefined): void {
    if (token && /^[A-Za-z0-9_-]{43}$/.test(token))
      this.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(this.digest(token));
  }
}

export class PublicError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
