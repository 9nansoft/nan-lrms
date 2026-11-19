// T010: BMS Session API types

export interface BmsSessionResponse {
  session_id: string;
}

export interface UserIdentity {
  name: string;
  position: string;
  hospital_code: string;
  department: string;
  is_hr_admin: boolean;
  is_director: boolean;
}

export interface UserRoles {
  is_hr_admin: boolean;
  is_director: boolean;
}

export interface DatabaseInfo {
  type: 'postgresql' | 'mysql';
  version?: string;
}

export interface SessionConfig {
  sessionId: string;
  jwt: string;
  bmsUrl: string;
  userInfo: UserIdentity;
  expiresAt: Date;
  expiredSecond: number;
  databaseInfo?: DatabaseInfo;
}

export interface BmsQueryResult {
  data: Record<string, unknown>[];
  field: string[];
  field_name: string[];
  record_count: number;
  MessageCode?: number;
}

// PasteJSON wraps the session details in `result`: the API URL and the
// bearer token live in `result.user_info` (`bms_url`, `bms_session_code`),
// `result.key_value` is the token's fallback and `result.expired_second`
// the lifetime. The top-level `jwt`/`bms_url` of the old port are NOT part
// of the response — they are read only as a fallback for older gateways.
export interface BmsValidateUserInfo extends Partial<UserIdentity> {
  bms_url?: string;
  bms_session_code?: string;
  bms_database_name?: string;
  bms_database_type?: string;
}

export interface BmsValidateResult {
  user_info?: BmsValidateUserInfo;
  key_value?: string;
  expired_second?: number;
}

export interface BmsValidateResponse {
  MessageCode?: number;
  Message?: string;
  result?: BmsValidateResult;
  /** Legacy top-level fields — read as a fallback only. */
  jwt?: string;
  bms_url?: string;
  user_info?: UserIdentity;
  expired_second?: number;
}

export interface BmsApiError {
  code: 'UNAUTHORIZED' | 'SQL_ERROR' | 'TIMEOUT' | 'CONNECTION_ERROR';
  message: string;
  statusCode: number;
  details?: unknown;
}

export interface BmsSqlRequest {
  sql: string;
  params?: Record<string, unknown>;
}
