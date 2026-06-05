import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * Mini-store de persistance sur fichier JSON (data/records.json).
 *
 * Suffisant pour un banc de test mono-processus. NON concurrent-safe à l'échelle :
 * lecture/écriture synchrones + écriture atomique (fichier temporaire puis rename).
 */

export type RecordKind = "intent" | "invoice" | "product";

export interface StoredEvent {
  type: string;
  timestamp: number;
  receivedAt: string;
  data: Record<string, unknown>;
}

export interface StoredRecord {
  id: string; // identifiant interne ; pour un intent, sert aussi de merchantReference
  kind: RecordKind;
  status: string;
  amount?: string;
  currency?: string;
  paymentLink?: string;
  izipayId?: string; // id côté API (intentId / invoiceId / productId)
  label?: string;
  meta?: Record<string, unknown>;
  raw?: unknown; // dernière réponse API (inspection)
  events: StoredEvent[];
  createdAt: string;
  updatedAt: string;
  paidAt?: string;
}

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "records.json");

function ensureFile(): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "[]", "utf8");
}

function readAll(): StoredRecord[] {
  ensureFile();
  try {
    const txt = fs.readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(txt) as StoredRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(records: StoredRecord[]): void {
  ensureFile();
  const tmp = `${DATA_FILE}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(records, null, 2), "utf8");
  fs.renameSync(tmp, DATA_FILE);
}

// --- Registre de déduplication des livraisons webhook ---
const EVENTS_FILE = path.join(DATA_DIR, "processed-events.json");
const MAX_EVENTS = 2000;

function readProcessedEvents(): string[] {
  ensureFile();
  if (!fs.existsSync(EVENTS_FILE)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(EVENTS_FILE, "utf8")) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeProcessedEvents(keys: string[]): void {
  ensureFile();
  const tmp = `${EVENTS_FILE}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(keys), "utf8");
  fs.renameSync(tmp, EVENTS_FILE);
}

const KIND_PREFIX: Record<RecordKind, string> = {
  intent: "ord",
  invoice: "inv",
  product: "prd",
};

function newId(kind: RecordKind): string {
  return `${KIND_PREFIX[kind]}_${crypto.randomBytes(5).toString("hex")}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

export interface CreateRecordInput {
  kind: RecordKind;
  status: string;
  amount?: string;
  currency?: string;
  label?: string;
  meta?: Record<string, unknown>;
}

export const db = {
  createRecord(input: CreateRecordInput): StoredRecord {
    const records = readAll();
    const ts = nowIso();
    const record: StoredRecord = {
      id: newId(input.kind),
      kind: input.kind,
      status: input.status,
      amount: input.amount,
      currency: input.currency,
      label: input.label,
      meta: input.meta,
      events: [],
      createdAt: ts,
      updatedAt: ts,
    };
    records.push(record);
    writeAll(records);
    return record;
  },

  get(id: string): StoredRecord | undefined {
    return readAll().find((r) => r.id === id);
  },

  findByIzipayId(izipayId: string): StoredRecord | undefined {
    return readAll().find((r) => r.izipayId === izipayId);
  },

  /** Trouve une ressource par référence interne OU par id IzichangePay. */
  find(ref?: string, izipayId?: string): StoredRecord | undefined {
    if (!ref && !izipayId) return undefined;
    return readAll().find((r) => (ref && r.id === ref) || (izipayId && r.izipayId === izipayId));
  },

  /**
   * Idempotence au niveau LIVRAISON : enregistre la clé d'un événement webhook.
   * Retourne `false` si l'événement a déjà été traité (à ignorer), `true` sinon.
   */
  markEventProcessed(key: string): boolean {
    const keys = readProcessedEvents();
    if (keys.includes(key)) return false;
    keys.push(key);
    writeProcessedEvents(keys.length > MAX_EVENTS ? keys.slice(-MAX_EVENTS) : keys);
    return true;
  },

  list(kind?: RecordKind): StoredRecord[] {
    const records = readAll().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return kind ? records.filter((r) => r.kind === kind) : records;
  },

  update(id: string, patch: Partial<StoredRecord>): StoredRecord | undefined {
    const records = readAll();
    const idx = records.findIndex((r) => r.id === id);
    if (idx === -1) return undefined;
    records[idx] = { ...records[idx], ...patch, updatedAt: nowIso() };
    writeAll(records);
    return records[idx];
  },

  appendEvent(id: string, event: Omit<StoredEvent, "receivedAt">): void {
    const records = readAll();
    const idx = records.findIndex((r) => r.id === id);
    if (idx === -1) return;
    records[idx].events.push({ ...event, receivedAt: nowIso() });
    records[idx].updatedAt = nowIso();
    writeAll(records);
  },

  /**
   * Marque une ressource comme payée de façon IDEMPOTENTE.
   * Cherche d'abord par id interne (merchantReference), puis par izipayId.
   * No-op si déjà payée.
   */
  markPaid(
    ref: string | undefined,
    izipayId: string | undefined,
    eventData: Record<string, unknown>,
    eventType = "payment_intent.completed",
  ): { changed: boolean; record?: StoredRecord } {
    const records = readAll();
    const idx = records.findIndex(
      (r) => (ref && r.id === ref) || (izipayId && r.izipayId === izipayId),
    );
    if (idx === -1) return { changed: false };

    const ts =
      typeof eventData.timestamp === "number" ? (eventData.timestamp as number) : Math.floor(Date.now() / 1000);
    records[idx].events.push({ type: eventType, timestamp: ts, receivedAt: nowIso(), data: eventData });

    if (records[idx].status === "paid") {
      records[idx].updatedAt = nowIso();
      writeAll(records);
      return { changed: false, record: records[idx] }; // déjà payée → idempotent
    }

    records[idx].status = "paid";
    records[idx].paidAt = nowIso();
    if (izipayId && !records[idx].izipayId) records[idx].izipayId = izipayId;
    records[idx].updatedAt = nowIso();
    writeAll(records);
    return { changed: true, record: records[idx] };
  },

  /** Met à jour le statut d'une ressource si elle existe (par id interne OU izipayId). */
  setStatus(
    ref: string | undefined,
    izipayId: string | undefined,
    status: string,
    event?: Omit<StoredEvent, "receivedAt">,
  ): StoredRecord | undefined {
    const records = readAll();
    const idx = records.findIndex(
      (r) => (ref && r.id === ref) || (izipayId && r.izipayId === izipayId),
    );
    if (idx === -1) return undefined;
    if (event) records[idx].events.push({ ...event, receivedAt: nowIso() });
    if (records[idx].status !== "paid") records[idx].status = status; // ne dégrade jamais "paid"
    records[idx].updatedAt = nowIso();
    writeAll(records);
    return records[idx];
  },
};
