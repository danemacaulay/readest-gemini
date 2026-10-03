import { describe, expect, it } from 'vitest';
import {
  AntigravityAuthError,
  AntigravityNotFoundError,
  AntigravityTimeoutError,
} from '../../services/ai/ask/antigravityClient';
import { LightRAGUnreachableError } from '../../services/ai/lightrag/client';
import { mapAskError } from '../../components/ask/askErrors';

describe('mapAskError', () => {
  it('surfaces Antigravity error messages exactly', () => {
    expect(mapAskError(new AntigravityNotFoundError('/bin/agy')).message).toContain(
      'agy not found',
    );
    expect(mapAskError(new AntigravityAuthError()).message).toContain('not authenticated');
    expect(mapAskError(new AntigravityTimeoutError()).message).toContain('timed out');
    expect(mapAskError(new AntigravityTimeoutError()).offerAskWithoutLibrary).toBe(false);
  });

  it('offers Ask without library for LightRAGUnreachableError', () => {
    const info = mapAskError(new LightRAGUnreachableError('http://127.0.0.1:8765'));
    expect(info.offerAskWithoutLibrary).toBe(true);
    expect(info.message).toContain('unreachable');
  });
});
