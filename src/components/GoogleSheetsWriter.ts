import type { sheets_v4 } from "googleapis";
import type { DatedSalesRecord } from "../types/index.js";

const COLUMN_HEADERS = [
  "Дата",
  "Тип",
  "Назва",
  "Розмір",
  "Колір",
  "Ціна",
  "Безгот",
  "Фото",
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
   * create it at the correct position (newest month first, descending
   * chronological order among YYYY-MM tabs) and add column headers.
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

    // Determine the correct insert position among existing YYYY-MM tabs.
    // Tabs are ordered newest-first (descending), so find the first existing
    // month tab that is older (lexicographically smaller) than the new one.
    const MONTH_KEY_RE = /^\d{4}-\d{2}$/;
    const insertIndex = this.findInsertIndex(
      existingSheets,
      monthKey,
      MONTH_KEY_RE,
    );

    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId: sheetDocumentId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: monthKey,
                index: insertIndex,
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
   * Find the sheet index where a new month tab should be inserted so that
   * YYYY-MM tabs stay in descending (newest-first) order.
   *
   * Walks through existing sheets in order. For every sheet whose title
   * matches the YYYY-MM pattern, compares it to the new monthKey.
   * The new tab goes right before the first month tab that is
   * lexicographically smaller (i.e. older).
   * If no older month tab is found, the new tab is appended after the
   * last month tab (or at position 0 if there are no month tabs at all).
   */
  private findInsertIndex(
    existingSheets: {
      properties?: { title?: string | null; index?: number | null } | null;
    }[],
    monthKey: string,
    monthKeyRe: RegExp,
  ): number {
    // Collect month-tab indices in their current sheet order
    const monthTabs: { title: string; index: number }[] = [];
    for (const s of existingSheets) {
      const title = s.properties?.title;
      const idx = s.properties?.index;
      if (title && idx != null && monthKeyRe.test(title)) {
        monthTabs.push({ title, index: idx });
      }
    }

    // Sort by their actual position in the spreadsheet
    monthTabs.sort((a, b) => a.index - b.index);

    // No month tabs yet — put at position 0 (front)
    if (monthTabs.length === 0) {
      return 0;
    }

    // Find the first month tab that is older (smaller) than the new key
    for (const tab of monthTabs) {
      if (tab.title < monthKey) {
        return tab.index;
      }
    }

    // All existing month tabs are newer — insert right after the last one
    return monthTabs[monthTabs.length - 1].index + 1;
  }

  /**
   * Format a DatedSalesRecord into an 8-column row.
   * Missing optional fields become empty strings (never null/undefined).
   * Photo link is rendered as a HYPERLINK formula showing the date as label.
   */
  static formatRow(record: DatedSalesRecord): string[] {
    // Format date as DD.MM.YYYY for display
    const [y, m, d] = record.date.split("-");
    const displayDate = `${d}.${m}.${y}`;

    const photoCell = record.photoLink
      ? `=HYPERLINK("${record.photoLink}";"${displayDate}")`
      : "";

    return [
      record.date,
      record.clothingType ?? "",
      record.name,
      record.size ?? "",
      record.color ?? "",
      record.price != null ? String(record.price) : "",
      record.isCashless === true ? "true" : "",
      photoCell,
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
          valueInputOption: "USER_ENTERED",
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
