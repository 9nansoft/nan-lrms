export interface ConnectionConfig {
  apiUrl: string;
  bearerToken: string;
  appIdentifier: string;
}

export interface UserInfo {
  loginname: string;
  fullname: string;
  hospcode: string;
  // Other fields are tunnel-specific; treat as opaque
  [key: string]: unknown;
}

export interface BmsSessionResponse {
  // PasteJSON nests the actionable fields (bms_url, bms_session_code, etc.)
  // under `result.user_info`. Earlier ports read top-level `jwt`/`bms_url`
  // and crashed at runtime because those fields don't exist.
  result?: {
    user_info?: Record<string, unknown>;
    key_value?: string;
    expired_second?: number;
    [key: string]: unknown;
  };
  // Top-level fallbacks (used by test fixtures that mimic the legacy shape):
  jwt?: string;
  bms_url?: string;
  user_info?: Record<string, unknown>;
  expired_second?: number;
  MessageCode?: number;
  Message?: string;
  [key: string]: unknown;
}

export type SqlParams = Record<string, unknown>;

export interface SqlApiResponse<T = Record<string, unknown>> {
  data: T[];
  MessageCode: number;
  Message: string;
}

export interface RestApiResponse {
  MessageCode: number;
  Message: string;
  insert_count?: number;
  update_count?: number;
  data?: Record<string, unknown>[];
  [key: string]: unknown;
}

export interface BmsFunctionResponse {
  MessageCode: number;
  Message: string;
  Value?: unknown;
  url?: string;
  [key: string]: unknown;
}
