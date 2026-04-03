import { describe, it, expect } from "vitest";
import { DateAssigner } from "../src/components/DateAssigner.js";
import type { PhotoParseResult } from "../src/types/index.js";

const assigner = new DateAssigner();

describe("DateAssigner", () => {
  describe("single photo with date markers", () => {
    it("assigns date from marker to following records", () => {
      const batch: PhotoParseResult[] = [
        {
          elements: [
            { type: "date_marker", date: "2026-03-20", position: 1 },
            { type: "sales_record", name: "Футболка", price: 25, position: 2 },
            { type: "sales_record", name: "Джинси", price: 45, position: 3 },
          ],
          rawText: "",
        },
      ];

      const result = assigner.assignDates(batch, "2026-01-01");

      expect(result.usedFallbackDate).toBe(false);
      expect(result.discardedPreDateCount).toBe(0);
      expect(result.records).toHaveLength(2);
      expect(result.records[0].date).toBe("2026-03-20");
      expect(result.records[0].name).toBe("Футболка");
      expect(result.records[1].date).toBe("2026-03-20");
    });

    it("updates active date when a new marker is encountered", () => {
      const batch: PhotoParseResult[] = [
        {
          elements: [
            { type: "date_marker", date: "2026-03-20", position: 1 },
            { type: "sales_record", name: "Item A", price: 10, position: 2 },
            { type: "date_marker", date: "2026-03-21", position: 3 },
            { type: "sales_record", name: "Item B", price: 20, position: 4 },
          ],
          rawText: "",
        },
      ];

      const result = assigner.assignDates(batch, "2026-01-01");

      expect(result.records).toHaveLength(2);
      expect(result.records[0].date).toBe("2026-03-20");
      expect(result.records[1].date).toBe("2026-03-21");
    });
  });

  describe("pre-date record discarding (first photo only)", () => {
    it("discards records before first date marker in first photo", () => {
      const batch: PhotoParseResult[] = [
        {
          elements: [
            {
              type: "sales_record",
              name: "Pre-date item",
              price: 5,
              position: 1,
            },
            {
              type: "sales_record",
              name: "Another pre-date",
              price: 8,
              position: 2,
            },
            { type: "date_marker", date: "2026-03-20", position: 3 },
            {
              type: "sales_record",
              name: "Valid item",
              price: 15,
              position: 4,
            },
          ],
          rawText: "",
        },
      ];

      const result = assigner.assignDates(batch, "2026-01-01");

      expect(result.discardedPreDateCount).toBe(2);
      expect(result.records).toHaveLength(1);
      expect(result.records[0].name).toBe("Valid item");
      expect(result.records[0].date).toBe("2026-03-20");
    });

    it("does NOT discard pre-marker records in subsequent photos (carry-forward)", () => {
      const batch: PhotoParseResult[] = [
        {
          elements: [
            { type: "date_marker", date: "2026-03-20", position: 1 },
            {
              type: "sales_record",
              name: "Photo 1 item",
              price: 10,
              position: 2,
            },
          ],
          rawText: "",
        },
        {
          elements: [
            {
              type: "sales_record",
              name: "Photo 2 pre-marker",
              price: 20,
              position: 1,
            },
            { type: "date_marker", date: "2026-03-21", position: 2 },
            {
              type: "sales_record",
              name: "Photo 2 post-marker",
              price: 30,
              position: 3,
            },
          ],
          rawText: "",
        },
      ];

      const result = assigner.assignDates(batch, "2026-01-01");

      expect(result.discardedPreDateCount).toBe(0);
      expect(result.records).toHaveLength(3);
      // Pre-marker record in photo 2 gets carried-forward date from photo 1
      expect(result.records[0].name).toBe("Photo 1 item");
      expect(result.records[0].date).toBe("2026-03-20");
      expect(result.records[1].name).toBe("Photo 2 pre-marker");
      expect(result.records[1].date).toBe("2026-03-20");
      expect(result.records[2].name).toBe("Photo 2 post-marker");
      expect(result.records[2].date).toBe("2026-03-21");
    });
  });

  describe("cross-photo carry-forward", () => {
    it("carries active date from last marker of previous photo", () => {
      const batch: PhotoParseResult[] = [
        {
          elements: [
            { type: "date_marker", date: "2026-03-20", position: 1 },
            { type: "sales_record", name: "A", price: 10, position: 2 },
            { type: "date_marker", date: "2026-03-21", position: 3 },
          ],
          rawText: "",
        },
        {
          elements: [
            { type: "sales_record", name: "B", price: 20, position: 1 },
            { type: "sales_record", name: "C", price: 30, position: 2 },
          ],
          rawText: "",
        },
      ];

      const result = assigner.assignDates(batch, "2026-01-01");

      expect(result.records).toHaveLength(3);
      expect(result.records[0].date).toBe("2026-03-20");
      expect(result.records[1].date).toBe("2026-03-21");
      expect(result.records[2].date).toBe("2026-03-21");
    });
  });

  describe("fallback date", () => {
    it("uses fallback when no date markers exist in entire batch", () => {
      const batch: PhotoParseResult[] = [
        {
          elements: [
            { type: "sales_record", name: "Item A", price: 10, position: 1 },
            { type: "sales_record", name: "Item B", price: 20, position: 2 },
          ],
          rawText: "",
        },
        {
          elements: [
            { type: "sales_record", name: "Item C", price: 30, position: 1 },
          ],
          rawText: "",
        },
      ];

      const result = assigner.assignDates(batch, "2026-05-15");

      expect(result.usedFallbackDate).toBe(true);
      expect(result.discardedPreDateCount).toBe(0);
      expect(result.records).toHaveLength(3);
      expect(result.records.every((r) => r.date === "2026-05-15")).toBe(true);
    });

    it("does NOT use fallback when at least one date marker exists", () => {
      const batch: PhotoParseResult[] = [
        {
          elements: [
            { type: "date_marker", date: "2026-03-20", position: 1 },
            { type: "sales_record", name: "Item", price: 10, position: 2 },
          ],
          rawText: "",
        },
      ];

      const result = assigner.assignDates(batch, "2026-05-15");

      expect(result.usedFallbackDate).toBe(false);
      expect(result.records[0].date).toBe("2026-03-20");
    });
  });

  describe("incomplete record flagging", () => {
    it("flags records with undefined price as incomplete", () => {
      const batch: PhotoParseResult[] = [
        {
          elements: [
            { type: "date_marker", date: "2026-03-20", position: 1 },
            { type: "sales_record", name: "No price", position: 2 },
            { type: "sales_record", name: "Has price", price: 50, position: 3 },
          ],
          rawText: "",
        },
      ];

      const result = assigner.assignDates(batch, "2026-01-01");

      expect(result.records).toHaveLength(2);
      expect(result.records[0].incomplete).toBe(true);
      expect(result.records[0].price).toBeUndefined();
      expect(result.records[1].incomplete).toBe(false);
      expect(result.records[1].price).toBe(50);
    });
  });

  describe("empty batch", () => {
    it("returns empty results for empty batch", () => {
      const result = assigner.assignDates([], "2026-01-01");

      expect(result.records).toHaveLength(0);
      expect(result.discardedPreDateCount).toBe(0);
      expect(result.usedFallbackDate).toBe(true);
    });

    it("returns empty results for photos with no elements", () => {
      const batch: PhotoParseResult[] = [
        { elements: [], rawText: "" },
        { elements: [], rawText: "" },
      ];

      const result = assigner.assignDates(batch, "2026-01-01");

      expect(result.records).toHaveLength(0);
      expect(result.usedFallbackDate).toBe(true);
    });
  });

  describe("photoLink is not set", () => {
    it("does not set photoLink on any record", () => {
      const batch: PhotoParseResult[] = [
        {
          elements: [
            { type: "date_marker", date: "2026-03-20", position: 1 },
            { type: "sales_record", name: "Item", price: 10, position: 2 },
          ],
          rawText: "",
        },
      ];

      const result = assigner.assignDates(batch, "2026-01-01");

      expect(result.records[0].photoLink).toBeUndefined();
    });
  });

  describe("edge case: first photo has no markers, later photo does", () => {
    it("discards first photo records and processes later photos correctly", () => {
      const batch: PhotoParseResult[] = [
        {
          elements: [
            { type: "sales_record", name: "Orphan 1", price: 5, position: 1 },
            { type: "sales_record", name: "Orphan 2", price: 8, position: 2 },
          ],
          rawText: "",
        },
        {
          elements: [
            { type: "sales_record", name: "Buffered", price: 12, position: 1 },
            { type: "date_marker", date: "2026-04-01", position: 2 },
            { type: "sales_record", name: "Dated", price: 20, position: 3 },
          ],
          rawText: "",
        },
      ];

      const result = assigner.assignDates(batch, "2026-01-01");

      expect(result.usedFallbackDate).toBe(false);
      // First photo records are pre-date in first photo — discarded
      expect(result.discardedPreDateCount).toBe(2);
      // "Buffered" from photo 2 has no carried-forward date (first photo had none)
      // It gets backfilled with the first DateMarker found (2026-04-01)
      expect(result.records).toHaveLength(2);
      expect(result.records[0].name).toBe("Buffered");
      expect(result.records[0].date).toBe("2026-04-01");
      expect(result.records[1].name).toBe("Dated");
      expect(result.records[1].date).toBe("2026-04-01");
    });
  });

  describe("preserves optional fields", () => {
    it("copies model, size, color, isCashless from SalesRecord", () => {
      const batch: PhotoParseResult[] = [
        {
          elements: [
            { type: "date_marker", date: "2026-03-20", position: 1 },
            {
              type: "sales_record",
              name: "TS-100",
              clothingType: "футболка",
              size: "L",
              color: "Синій",
              price: 25,
              isCashless: true,
              position: 2,
            },
          ],
          rawText: "",
        },
      ];

      const result = assigner.assignDates(batch, "2026-01-01");

      const rec = result.records[0];
      expect(rec.clothingType).toBe("футболка");
      expect(rec.size).toBe("L");
      expect(rec.color).toBe("Синій");
      expect(rec.isCashless).toBe(true);
    });
  });
});
