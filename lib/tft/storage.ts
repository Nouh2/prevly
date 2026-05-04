import { DEFAULT_TFT_ASSUMPTIONS, DEFAULT_TFT_SETTINGS } from "./defaults";
import type { TftStoragePayload } from "./types";

export const TFT_STORAGE_KEY = "prevly_tft_v1";

export function loadTftFromStorage(): TftStoragePayload | null {
  try {
    const raw = localStorage.getItem(TFT_STORAGE_KEY);
    if (!raw) return null;
    const payload = JSON.parse(raw) as TftStoragePayload;
    return {
      settings: { ...DEFAULT_TFT_SETTINGS, ...payload.settings },
      assumptions: {
        ...DEFAULT_TFT_ASSUMPTIONS,
        ...payload.assumptions,
        seasonality: {
          ...DEFAULT_TFT_ASSUMPTIONS.seasonality,
          ...payload.assumptions?.seasonality,
        },
      },
    };
  } catch {
    return null;
  }
}

export function saveTftToStorage(payload: TftStoragePayload): void {
  try {
    localStorage.setItem(TFT_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Storage may be unavailable or full.
  }
}
