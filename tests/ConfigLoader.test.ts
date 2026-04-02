import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ConfigLoader } from "../src/components/ConfigLoader.js";
import type { StoreConfig } from "../src/types/index.js";

describe("ConfigLoader", () => {
  let loader: ConfigLoader;
  let tmpDir: string;

  beforeEach(() => {
    loader = new ConfigLoader();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "configloader-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeConfig(data: unknown, filename = "stores.json"): string {
    const filePath = path.join(tmpDir, filename);
    fs.writeFileSync(filePath, JSON.stringify(data), "utf-8");
    return filePath;
  }

  const validConfig: StoreConfig = {
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

  describe("load", () => {
    it("loads and returns a valid config", () => {
      const filePath = writeConfig(validConfig);
      const result = loader.load(filePath);
      expect(result).toEqual(validConfig);
    });

    it("throws on missing file", () => {
      expect(() => loader.load("/nonexistent/path.json")).toThrow(
        /Failed to read config file/,
      );
    });

    it("throws on malformed JSON", () => {
      const filePath = path.join(tmpDir, "bad.json");
      fs.writeFileSync(filePath, "not json {{{", "utf-8");
      expect(() => loader.load(filePath)).toThrow(/invalid JSON/);
    });
  });

  describe("validate", () => {
    it("accepts a valid config", () => {
      expect(() => loader.validate(validConfig)).not.toThrow();
    });

    it("rejects missing sharedDriveFolderId", () => {
      const config = { ...validConfig, sharedDriveFolderId: "" };
      expect(() => loader.validate(config)).toThrow(/sharedDriveFolderId/);
    });

    it("rejects empty stores array", () => {
      const config = { ...validConfig, stores: [] };
      expect(() => loader.validate(config)).toThrow(/at least one store/);
    });

    it("rejects store with empty storeId", () => {
      const config: StoreConfig = {
        ...validConfig,
        stores: [
          { storeId: "", registeredPhone: "+111", sheetDocumentId: "s1" },
        ],
      };
      expect(() => loader.validate(config)).toThrow(/storeId.*non-empty/);
    });

    it("rejects store with empty registeredPhone", () => {
      const config: StoreConfig = {
        ...validConfig,
        stores: [{ storeId: "S1", registeredPhone: "", sheetDocumentId: "s1" }],
      };
      expect(() => loader.validate(config)).toThrow(
        /registeredPhone.*non-empty/,
      );
    });

    it("rejects store with empty sheetDocumentId", () => {
      const config: StoreConfig = {
        ...validConfig,
        stores: [
          { storeId: "S1", registeredPhone: "+111", sheetDocumentId: "" },
        ],
      };
      expect(() => loader.validate(config)).toThrow(
        /sheetDocumentId.*non-empty/,
      );
    });

    it("rejects duplicate storeId", () => {
      const config: StoreConfig = {
        ...validConfig,
        stores: [
          { storeId: "S1", registeredPhone: "+111", sheetDocumentId: "a" },
          { storeId: "S1", registeredPhone: "+222", sheetDocumentId: "b" },
        ],
      };
      expect(() => loader.validate(config)).toThrow(/Duplicate storeId/);
    });

    it("rejects duplicate registeredPhone", () => {
      const config: StoreConfig = {
        ...validConfig,
        stores: [
          { storeId: "S1", registeredPhone: "+111", sheetDocumentId: "a" },
          { storeId: "S2", registeredPhone: "+111", sheetDocumentId: "b" },
        ],
      };
      expect(() => loader.validate(config)).toThrow(
        /Duplicate registeredPhone/,
      );
    });
  });

  describe("lookup methods", () => {
    beforeEach(() => {
      const filePath = writeConfig(validConfig);
      loader.load(filePath);
    });

    it("getStoreByPhone returns matching store", () => {
      const store = loader.getStoreByPhone("+1234567890");
      expect(store?.storeId).toBe("STORE_1");
    });

    it("getStoreByPhone returns undefined for unknown phone", () => {
      expect(loader.getStoreByPhone("+9999999999")).toBeUndefined();
    });

    it("getStoreById returns matching store", () => {
      const store = loader.getStoreById("STORE_2");
      expect(store?.registeredPhone).toBe("+0987654321");
    });

    it("getStoreById returns undefined for unknown id", () => {
      expect(loader.getStoreById("STORE_99")).toBeUndefined();
    });

    it("getValidStoreIds returns all store ids", () => {
      expect(loader.getValidStoreIds()).toEqual(["STORE_1", "STORE_2"]);
    });
  });

  describe("lookup methods before load", () => {
    it("getStoreByPhone returns undefined when config not loaded", () => {
      expect(loader.getStoreByPhone("+111")).toBeUndefined();
    });

    it("getStoreById returns undefined when config not loaded", () => {
      expect(loader.getStoreById("S1")).toBeUndefined();
    });

    it("getValidStoreIds returns empty array when config not loaded", () => {
      expect(loader.getValidStoreIds()).toEqual([]);
    });
  });
});
