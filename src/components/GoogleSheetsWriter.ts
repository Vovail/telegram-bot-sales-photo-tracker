import type { sheets_v4 } from "googleapis";
import type { DatedSalesRecord } from "../types/index.js";

const COLUMN_HEADERS = [
  "Date",
  "Item Name",
  "Model",
  "Size",
  "Color",
  "Price",
  "Is Cashless",
  "Photo Link",
];

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 10_000;

export class GoogleSheetsWriter {
  private sheets: sheets_v4.Sheets;
  private delayFn: (ms: number) => Promise<void>;

  constructor(
    sheets: sheets_v4.Sheets,
    delayFn?: (ms: number) => Promise<void>,
  ) {
    this.sheets = sheets;
    this.delayFn =
      delayFn ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  /**
   * Ensure a Month_Tab exists in the spreadsheet. If it doesn't exist,
   * create it and add column headers.
   */
  async ensureMonthTab(
    sheetDocumentId: string,
    monthKey: string,
  ): Promise<void> {
    const spreadsheet = await this.sheets.spreadsheets.get({
      spreadsheetId: sheetDocumentId,
    });

    const existingSheets = spreadsheet.data.sheets ?? [];
    const tabExists = existingSheets.some(
      (s) => s.properties?.title === monthKey,
    );

    if (tabExists) {
      return;
    }

    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId: sheetDocumentId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: monthKey,
              },
            },
          },
        ],
      },
    });

    // Add column headers to the new tab
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: sheetDocumentId,
      range: `${monthKey}!A1:H1`,
      valueInputOption: "RAW",
      requestBody: {
        values: [COLUMN_HEADERS],
      },
    });
  }

  /**
   * Format a DatedSalesRecord into an 8-column row.
   * Missing optional fields become empty strings (never null/undefined).
   */
  static formatRow(record: DatedSalesRecord): string[] {
    return [
      record.date,
      record.name,
      record.model ?? "",
      record.size ?? "",
      record.color ?? "",
      record.price != null ? String(record.price) : "",
      record.isCashless != null ? String(record.isCashless) : "",
      record.photoLink ?? "",
    ];
  }

  /**
   * Write records to the appropriate Month_Tabs in the given spreadsheet.
   * Groups records by month (YYYY-MM), ensures each tab exists,
   * and appends rows. Returns the total number of rows written.
   *
   * Uses retry logic: up to 3 attempts with 10-second delays on failure.
   */
  async writeRecords(
    sheetDocumentId: string,
    records: DatedSalesRecord[],
  ): Promise<number> {
    if (records.length === 0) {
      return 0;
    }

    // Group records by month (first 7 chars of date = YYYY-MM)
    const byMonth = new Map<string, DatedSalesRecord[]>();
    for (const record of records) {
      const monthKey = record.date.substring(0, 7);
      const group = byMonth.get(monthKey);
      if (group) {
        group.push(record);
      } else {
        byMonth.set(monthKey, [record]);
      }
    }

    let totalWritten = 0;

    for (const [monthKey, monthRecords] of byMonth) {
      await this.ensureMonthTab(sheetDocumentId, monthKey);

      const rows = monthRecords.map((r) => GoogleSheetsWriter.formatRow(r));

      await this.appendWithRetry(sheetDocumentId, monthKey, rows);
      totalWritten += rows.length;
    }

    return totalWritten;
  }

  /**
   * Append rows to a sheet tab with retry logic.
   * Retries up to MAX_RETRIES times with RETRY_DELAY_MS between attempts.
   */
  private async appendWithRetry(
    sheetDocumentId: string,
    monthKey: string,
    rows: string[][],
  ): Promise<void> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await this.sheets.spreadsheets.values.append({
          spreadsheetId: sheetDocumentId,
          range: `${monthKey}!A:H`,
          valueInputOption: "RAW",
          insertDataOption: "INSERT_ROWS",
          requestBody: {
            values: rows,
          },
        });
        return;
      } catch (error) {
        lastError = error;
        if (attempt < MAX_RETRIES) {
          await this.delayFn(RETRY_DELAY_MS);
        }
      }
    }

    throw lastError;
  }
}
