import { describe, expect, it } from 'vitest';
import {
  AntigravityAuthError,
  AntigravityEmptyResponseError,
  AntigravityNotFoundError,
  AntigravityTimeoutError,
} from '../../services/ai/ask/antigravityClient';
import { mapAskError } from '../../components/ask/askErrors';

describe('mapAskError', () => {
  it('surfaces Antigravity error messages', () => {
    expect(mapAskError(new AntigravityNotFoundError('/bin/agy')).message).toContain(
      'agy not found',
    );
    expect(mapAskError(new AntigravityAuthError()).message).toContain('not authenticated');
    expect(mapAskError(new AntigravityTimeoutError()).message).toContain('timed out');
    expect(mapAskError(new AntigravityEmptyResponseError()).message).toContain('no answer');
  });

  it('falls back for unknown errors', () => {
    expect(mapAskError(new Error('boom')).message).toBe('boom');
  });
});
