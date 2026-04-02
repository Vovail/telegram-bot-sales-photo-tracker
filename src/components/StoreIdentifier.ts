import type { StoreConfig, IdentificationResult } from "../types/index.js";

export class StoreIdentifier {
  private config: StoreConfig;

  constructor(config: StoreConfig) {
    this.config = config;
  }

  identifyByPhone(phone: string): IdentificationResult | undefined {
    const store = this.config.stores.find((s) => s.registeredPhone === phone);
    if (!store) {
      return undefined;
    }
    return { storeId: store.storeId, method: "phone" };
  }

  validateStoreId(input: string): boolean {
    return this.config.stores.some((s) => s.storeId === input);
  }
}
