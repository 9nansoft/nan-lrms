import { describe, it, expect } from 'vitest';
import { apiError, ApiErrors } from '@/lib/api-errors';

describe('api-errors', () => {
  it('returns bilingual error with English error + Thai message + suggestedAction', () => {
    const err = apiError('INVALID_API_KEY');
    expect(err.error).toBe('Invalid or revoked API key');
    expect(err.code).toBe('INVALID_API_KEY');
    expect(err.message).toContain('API key');
    expect(err.suggestedAction).toContain('กรุณา');
  });

  it('all predefined errors have non-empty Thai message and suggestedAction', () => {
    for (const [key, value] of Object.entries(ApiErrors)) {
      expect(value.code, `${key}.code`).toBe(key);
      expect(value.message.length, `${key}.message empty`).toBeGreaterThan(0);
      expect(value.suggestedAction.length, `${key}.suggestedAction empty`).toBeGreaterThan(0);
    }
  });

  it('attaches custom details when provided', () => {
    const err = apiError('VALIDATION_FAILED', 'patients[0].cid is missing');
    expect(err.details).toBe('patients[0].cid is missing');
    expect(err.code).toBe('VALIDATION_FAILED');
  });

  it('omits details when not provided', () => {
    const err = apiError('CID_REQUIRED');
    expect('details' in err).toBe(false);
  });

  it('accepts structured details object', () => {
    const err = apiError('HOSPITAL_CODE_MISMATCH', { expected: '11004', received: '10737' });
    expect(err.details).toEqual({ expected: '11004', received: '10737' });
  });
});
