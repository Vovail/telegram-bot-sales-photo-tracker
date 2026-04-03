import type {
  PhotoParseResult,
  SalesRecord,
  DatedSalesRecord,
  DateAssignmentResult,
} from "../types/index.js";

export class DateAssigner {
  /**
   * Assigns dates to sales records across a photo batch using carry-forward logic.
   *
   * - First photo: discards SalesRecords before the first DateMarker (Pre_Date_Records)
   * - Subsequent photos: records before the first DateMarker get the carried-forward Active_Date
   * - If no DateMarker exists in the entire batch, uses fallbackDate for all records
   * - Records with missing price are flagged as incomplete
   */
  assignDates(
    batchResults: PhotoParseResult[],
    fallbackDate: string,
  ): DateAssignmentResult {
    // Check if any DateMarker exists in the entire batch
    const anyDateMarkerFound = batchResults.some((photo) =>
      photo.elements.some((el) => el.type === "date_marker"),
    );

    if (!anyDateMarkerFound) {
      // No date markers at all — use fallback for every sales record
      const records: DatedSalesRecord[] = [];
      for (const photo of batchResults) {
        for (const el of photo.elements) {
          if (el.type === "sales_record") {
            records.push(this.toDatedRecord(el, fallbackDate));
          }
        }
      }
      return { records, discardedPreDateCount: 0, usedFallbackDate: true };
    }

    // At least one DateMarker exists — process with carry-forward logic
    const records: DatedSalesRecord[] = [];
    let discardedPreDateCount = 0;
    let activeDate: string | null = null;
    // Buffer for records from non-first photos that appear before any
    // DateMarker has been encountered across the entire batch so far.
    const pendingRecords: SalesRecord[] = [];

    for (let i = 0; i < batchResults.length; i++) {
      const photo = batchResults[i];
      const isFirstPhoto = i === 0;

      for (const element of photo.elements) {
        if (element.type === "date_marker") {
          // If we have pending records waiting for a date, backfill them
          if (pendingRecords.length > 0) {
            for (const pending of pendingRecords) {
              records.push(this.toDatedRecord(pending, element.date));
            }
            pendingRecords.length = 0;
          }
          activeDate = element.date;
        } else if (element.type === "sales_record") {
          if (activeDate !== null) {
            // We have an active date — assign it
            records.push(this.toDatedRecord(element, activeDate));
          } else if (isFirstPhoto) {
            // First photo, no date yet — discard (Pre_Date_Records)
            discardedPreDateCount++;
          } else {
            // Non-first photo, no date carried forward yet — buffer
            pendingRecords.push(element);
          }
        }
      }
    }

    return { records, discardedPreDateCount, usedFallbackDate: false };
  }

  private toDatedRecord(record: SalesRecord, date: string): DatedSalesRecord {
    return {
      date,
      clothingType: record.clothingType,
      name: record.name,
      size: record.size,
      color: record.color,
      price: record.price,
      isCashless: record.isCashless,
      incomplete: record.price == null,
    };
  }
}
