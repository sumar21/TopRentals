// Backend switch. The UI imports `api` from here and nothing else — never a concrete
// adapter or backend SDK directly. See CLAUDE.md "Arquitectura".
import type { DataApi } from './api.ts';
import { createMockAdapter } from './mock/adapter.ts';
import { createSupabaseAdapter } from './supabase/adapter.ts';

const backend = import.meta.env.VITE_DATA_BACKEND ?? 'mock';

function selectAdapter(): DataApi {
  switch (backend) {
    case 'mock':
    case undefined:
      return createMockAdapter();
    case 'supabase':
      return createSupabaseAdapter();
    default:
      throw new Error(`Unknown VITE_DATA_BACKEND "${backend}" — expected "mock" or "supabase".`);
  }
}

export const api: DataApi = selectAdapter();
export type { DataApi } from './api.ts';
