import { describe, it, expect } from "vitest";
import { StoreIdentifier } from "../src/components/StoreIdentifier.js";
import type { StoreConfig } from "../src/types/index.js";

const config: StoreConfig = {
  sharedDriveFolderId: "drive-folder-123",
  stores: [
    {
      storeId: "STORE_1",
      registeredPhone: "+1234567890",
      sheetDocumentId: "sheet-abc",
    },
    {
      storeId: "STORE_2",
      registeredPhone: "+0987654321",
      sheetDocumentId: "sheet-def",
    },
  ],
};

describe("StoreIdentifier", () => {
  const identifier = new StoreIdentifier(config);

  describe("identifyByPhone", () => {
    it("returns IdentificationResult for a registered phone", () => {
      const result = identifier.identifyByPhone("+1234567890");
      expect(result).toEqual({ storeId: "STORE_1", method: "phone" });
    });

    it("returns correct store for second registered phone", () => {
      const result = identifier.identifyByPhone("+0987654321");
      expect(result).toEqual({ storeId: "STORE_2", method: "phone" });
    });

    it("returns undefined for an unregistered phone", () => {
      expect(identifier.identifyByPhone("+9999999999")).toBeUndefined();
    });

    it("returns undefined for an empty string", () => {
      expect(identifier.identifyByPhone("")).toBeUndefined();
    });
  });

  describe("validateStoreId", () => {
    it("returns true for a valid store ID", () => {
      expect(identifier.validateStoreId("STORE_1")).toBe(true);
    });

    it("returns true for another valid store ID", () => {
      expect(identifier.validateStoreId("STORE_2")).toBe(true);
    });

    it("returns false for an invalid store ID", () => {
      expect(identifier.validateStoreId("STORE_99")).toBe(false);
    });

    it("returns false for an empty string", () => {
      expect(identifier.validateStoreId("")).toBe(false);
    });

    it("is case-sensitive", () => {
      expect(identifier.validateStoreId("store_1")).toBe(false);
    });
  });
});
