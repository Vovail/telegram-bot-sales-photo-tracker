import { describe, it, expect, vi, beforeEach } from "vitest";
import { GoogleSheetsWriter } from "../src/components/GoogleSheetsWriter.js";
import type { sheets_v4 } from "googleapis";
import type { DatedSalesRecord } from "../src/types/index.js";

function createMockSheets() {
  return {
    spreadsheets: {
      get: vi.fn(),
      batchUpdate: vi.fn(),
      values: {
        update: vi.fn(),
        append: vi.fn(),
      },
    },
  };
}

function makeRecord(
  overrides: Partial<DatedSalesRecord> = {},
): DatedSalesRecord {
  return {
    date: "2026-03-20",
    name: "Футболка",
    incomplete: false,
    ...overrides,
  };
}

describe("GoogleSheetsWriter", () => {
  describe("formatRow", () => {
    it("should produce 8-column row with all fields present", () => {
      const record = makeRecord({
        model: "TS-100",
        size: "L",
        color: "Синій",
        price: 25,
        isCashless: false,
        photoLink: "https://drive.google.com/file/d/abc/view",
      });
      const row = GoogleSheetsWriter.formatRow(record);
      expect(row).toEqual([
        "2026-03-20",
        "Футболка",
        "TS-100",
        "L",
        "Синій",
        "25",
        "false",
        "https://drive.google.com/file/d/abc/view",
      ]);
      expect(row).toHaveLength(8);
    });

    it("should use empty strings for missing optional fields", () => {
      const record = makeRecord();
      const row = GoogleSheetsWriter.formatRow(record);
      expect(row).toEqual(["2026-03-20", "Футболка", "", "", "", "", "", ""]);
      expect(row).toHaveLength(8);
    });

    it("should never produce null or undefined in any column", () => {
      const record = makeRecord({ price: undefined, isCashless: undefined });
      const row = GoogleSheetsWriter.formatRow(record);
      for (const cell of row) {
        expect(cell).not.toBeNull();
        expect(cell).not.toBeUndefined();
        expect(typeof cell).toBe("string");
      }
    });

    it("should format isCashless true as string 'true'", () => {
      const record = makeRecord({ isCashless: true, price: 100 });
      const row = GoogleSheetsWriter.formatRow(record);
      expect(row[6]).toBe("true");
    });

    it("should format price as string", () => {
      const record = makeRecord({ price: 45.5 });
      const row = GoogleSheetsWriter.formatRow(record);
      expect(row[5]).toBe("45.5");
    });
  });

  describe("ensureMonthTab", () => {
    let mockSheets: ReturnType<typeof createMockSheets>;
    let writer: GoogleSheetsWriter;

    beforeEach(() => {
      mockSheets = createMockSheets();
      writer = new GoogleSheetsWriter(
        mockSheets as unknown as sheets_v4.Sheets,
      );
    });

    it("should not create tab if it already exists", async () => {
      mockSheets.spreadsheets.get.mockResolvedValue({
        data: {
          sheets: [{ properties: { title: "2026-03" } }],
        },
      });

      await writer.ensureMonthTab("sheet-id", "2026-03");

      expect(mockSheets.spreadsheets.get).toHaveBeenCalledOnce();
      expect(mockSheets.spreadsheets.batchUpdate).not.toHaveBeenCalled();
    });

    it("should create tab and add headers if it does not exist", async () => {
      mockSheets.spreadsheets.get.mockResolvedValue({
        data: { sheets: [] },
      });
      mockSheets.spreadsheets.batchUpdate.mockResolvedValue({});
      mockSheets.spreadsheets.values.update.mockResolvedValue({});

      await writer.ensureMonthTab("sheet-id", "2026-04");

      expect(mockSheets.spreadsheets.batchUpdate).toHaveBeenCalledWith({
        spreadsheetId: "sheet-id",
        requestBody: {
          requests: [{ addSheet: { properties: { title: "2026-04" } } }],
        },
      });

      expect(mockSheets.spreadsheets.values.update).toHaveBeenCalledWith({
        spreadsheetId: "sheet-id",
        range: "2026-04!A1:H1",
        valueInputOption: "RAW",
        requestBody: {
          values: [
            [
              "Date",
              "Item Name",
              "Model",
              "Size",
              "Color",
              "Price",
              "Is Cashless",
              "Photo Link",
            ],
          ],
        },
      });
    });

    it("should handle spreadsheet with no sheets array", async () => {
      mockSheets.spreadsheets.get.mockResolvedValue({
        data: { sheets: undefined },
      });
      mockSheets.spreadsheets.batchUpdate.mockResolvedValue({});
      mockSheets.spreadsheets.values.update.mockResolvedValue({});

      await writer.ensureMonthTab("sheet-id", "2026-05");

      expect(mockSheets.spreadsheets.batchUpdate).toHaveBeenCalledOnce();
    });
  });

  describe("writeRecords", () => {
    let mockSheets: ReturnType<typeof createMockSheets>;
    let writer: GoogleSheetsWriter;
    const noDelay = async () => {};

    beforeEach(() => {
      mockSheets = createMockSheets();
      writer = new GoogleSheetsWriter(
        mockSheets as unknown as sheets_v4.Sheets,
        noDelay,
      );
      // Default: tab already exists
      mockSheets.spreadsheets.get.mockResolvedValue({
        data: { sheets: [{ properties: { title: "2026-03" } }] },
      });
      mockSheets.spreadsheets.values.append.mockResolvedValue({});
    });

    it("should return 0 for empty records array", async () => {
      const count = await writer.writeRecords("sheet-id", []);
      expect(count).toBe(0);
      expect(mockSheets.spreadsheets.values.append).not.toHaveBeenCalled();
    });

    it("should write records and return count", async () => {
      const records = [
        makeRecord({ name: "Item A", price: 10 }),
        makeRecord({ name: "Item B", price: 20 }),
      ];

      const count = await writer.writeRecords("sheet-id", records);

      expect(count).toBe(2);
      expect(mockSheets.spreadsheets.values.append).toHaveBeenCalledOnce();
      expect(mockSheets.spreadsheets.values.append).toHaveBeenCalledWith({
        spreadsheetId: "sheet-id",
        range: "2026-03!A:H",
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: {
          values: [
            GoogleSheetsWriter.formatRow(records[0]),
            GoogleSheetsWriter.formatRow(records[1]),
          ],
        },
      });
    });

    it("should group records by month and write to separate tabs", async () => {
      mockSheets.spreadsheets.get.mockResolvedValue({
        data: {
          sheets: [
            { properties: { title: "2026-03" } },
            { properties: { title: "2026-04" } },
          ],
        },
      });

      const records = [
        makeRecord({ date: "2026-03-20", name: "March item" }),
        makeRecord({ date: "2026-04-01", name: "April item" }),
        makeRecord({ date: "2026-03-25", name: "Another March item" }),
      ];

      const count = await writer.writeRecords("sheet-id", records);

      expect(count).toBe(3);
      expect(mockSheets.spreadsheets.values.append).toHaveBeenCalledTimes(2);
    });

    it("should retry on append failure and succeed", async () => {
      mockSheets.spreadsheets.values.append
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce({});

      const count = await writer.writeRecords("sheet-id", [makeRecord()]);

      expect(count).toBe(1);
      expect(mockSheets.spreadsheets.values.append).toHaveBeenCalledTimes(2);
    });

    it("should throw after 3 failed retries", async () => {
      const error = new Error("Persistent failure");
      mockSheets.spreadsheets.values.append.mockRejectedValue(error);

      await expect(
        writer.writeRecords("sheet-id", [makeRecord()]),
      ).rejects.toThrow("Persistent failure");

      expect(mockSheets.spreadsheets.values.append).toHaveBeenCalledTimes(3);
    });
  });
});
