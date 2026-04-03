import fs from "node:fs";
import type { StoreConfig, StoreDefinition } from "../types/index.js";

export class ConfigLoader {
  private config: StoreConfig | null = null;

  load(filePath: string): StoreConfig {
    let raw: string;
    try {
      raw = fs.readFileSync(filePath, "utf-8");
    } catch (err) {
      throw new Error(
        `Failed to read config file at "${filePath}": ${(err as Error).message}`,
      );
    }

    return this.parseAndValidate(raw, `Config file at "${filePath}"`);
  }

  /**
   * Load config from a raw JSON string (e.g., from an environment variable).
   */
  loadFromJson(jsonString: string): StoreConfig {
    return this.parseAndValidate(jsonString, "STORES_CONFIG_JSON");
  }

  private parseAndValidate(raw: string, source: string): StoreConfig {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`${source} contains invalid JSON`);
    }

    const config = parsed as StoreConfig;
    this.validate(config);
    this.config = config;
    return config;
  }

  validate(config: StoreConfig): void {
    if (!config || typeof config !== "object") {
      throw new Error("Config must be a non-null object");
    }

    if (
      typeof config.sharedDriveFolderId !== "string" ||
      config.sharedDriveFolderId.trim() === ""
    ) {
      throw new Error("Config is missing a non-empty 'sharedDriveFolderId'");
    }

    if (!Array.isArray(config.stores)) {
      throw new Error("Config 'stores' must be an array");
    }

    if (config.stores.length === 0) {
      throw new Error("Config 'stores' must contain at least one store");
    }

    const seenStoreIds = new Set<string>();
    const seenPhones = new Set<string>();

    for (let i = 0; i < config.stores.length; i++) {
      const store = config.stores[i];
      const prefix = `Store at index ${i}`;

      if (!store || typeof store !== "object") {
        throw new Error(`${prefix}: must be a non-null object`);
      }

      if (typeof store.storeId !== "string" || store.storeId.trim() === "") {
        throw new Error(`${prefix}: 'storeId' must be a non-empty string`);
      }

      if (
        typeof store.registeredPhone !== "string" ||
        store.registeredPhone.trim() === ""
      ) {
        throw new Error(
          `${prefix}: 'registeredPhone' must be a non-empty string`,
        );
      }

      if (
        typeof store.sheetDocumentId !== "string" ||
        store.sheetDocumentId.trim() === ""
      ) {
        throw new Error(
          `${prefix}: 'sheetDocumentId' must be a non-empty string`,
        );
      }

      if (seenStoreIds.has(store.storeId)) {
        throw new Error(
          `Duplicate storeId '${store.storeId}' found at index ${i}`,
        );
      }
      seenStoreIds.add(store.storeId);

      if (seenPhones.has(store.registeredPhone)) {
        throw new Error(
          `Duplicate registeredPhone '${store.registeredPhone}' found at index ${i}`,
        );
      }
      seenPhones.add(store.registeredPhone);
    }
  }

  getStoreByPhone(phone: string): StoreDefinition | undefined {
    return this.config?.stores.find((s) => s.registeredPhone === phone);
  }

  getStoreById(storeId: string): StoreDefinition | undefined {
    return this.config?.stores.find((s) => s.storeId === storeId);
  }

  getValidStoreIds(): string[] {
    return this.config?.stores.map((s) => s.storeId) ?? [];
  }
}
