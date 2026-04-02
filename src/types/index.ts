// ── Store Configuration ──

export interface StoreDefinition {
  storeId: string;
  registeredPhone: string;
  sheetDocumentId: string;
}

export interface StoreConfig {
  stores: StoreDefinition[];
  sharedDriveFolderId: string;
}

// ── Telegram & Batching ──

export interface TelegramPhoto {
  buffer: Buffer;
  format: "jpeg" | "png" | "heic";
  receivedAt: Date;
}

export interface PhotoBatch {
  senderId: string;
  senderPhone: string | undefined;
  storeId: string;
  photos: TelegramPhoto[];
}

export interface PendingBatch {
  senderId: string;
  senderPhone: string | undefined;
  photos: TelegramPhoto[];
  timer: NodeJS.Timeout;
  startedAt: Date;
}

// ── Vision Parser ──

export interface DateMarker {
  type: "date_marker";
  date: string; // ISO date string YYYY-MM-DD
  position: number;
}

export interface SalesRecord {
  type: "sales_record";
  name: string;
  model?: string;
  size?: string;
  color?: string;
  price?: number;
  isCashless?: boolean;
  position: number;
}

export type ParsedElement = DateMarker | SalesRecord;

export interface PhotoParseResult {
  elements: ParsedElement[];
  rawText: string;
}

// ── Date Assignment ──

export interface DatedSalesRecord {
  date: string; // YYYY-MM-DD
  name: string;
  model?: string;
  size?: string;
  color?: string;
  price?: number;
  isCashless?: boolean;
  photoLink?: string;
  incomplete: boolean;
}

export interface DateAssignmentResult {
  records: DatedSalesRecord[];
  discardedPreDateCount: number;
  usedFallbackDate: boolean;
}

// ── Store Identification ──

export interface IdentificationResult {
  storeId: string;
  method: "phone" | "manual";
}

// ── Google Drive ──

export interface UploadResult {
  fileId: string;
  shareableLink: string;
  fileName: string;
}

// ── Logging ──

export interface LogEntry {
  timestamp: Date;
  level: "info" | "warn" | "error";
  event: string;
  senderId?: string;
  storeId?: string;
  recordCount?: number;
  error?: string;
  details?: Record<string, unknown>;
}
