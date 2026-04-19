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
