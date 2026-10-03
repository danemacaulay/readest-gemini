import { describe, expect, it } from 'vitest';
import {
  CALIBRE_RAG_SCOPE,
  CALIBREDB_SCOPE,
  VENV_CALIBRE_RAG,
  calibreToolPathPrefixes,
  mergeCalibreToolPathEnv,
  resolveCalibreShellScope,
} from '@/services/ai/lightrag/shellScopes';

describe('resolveCalibreShellScope', () => {
  describe('calibredb', () => {
    it('maps empty, basename, and default absolute path to calibredb scope', () => {
      expect(resolveCalibreShellScope('calibredb', '')).toBe(CALIBREDB_SCOPE);
      expect(resolveCalibreShellScope('calibredb', 'calibredb')).toBe(CALIBREDB_SCOPE);
      expect(
        resolveCalibreShellScope('calibredb', '/Applications/calibre.app/Contents/MacOS/calibredb'),
      ).toBe(CALIBREDB_SCOPE);
    });

    it('passes through custom allowlist names', () => {
      expect(resolveCalibreShellScope('calibredb', 'my-custom-calibredb')).toBe(
        'my-custom-calibredb',
      );
    });
  });

  describe('calibre-rag', () => {
    it('maps empty and basename to calibre-rag scope', () => {
      expect(resolveCalibreShellScope('calibre-rag', '')).toBe(CALIBRE_RAG_SCOPE);
      expect(resolveCalibreShellScope('calibre-rag', 'calibre-rag')).toBe(CALIBRE_RAG_SCOPE);
    });

    it('maps venv absolute path to calibre-rag-venv', () => {
      expect(resolveCalibreShellScope('calibre-rag', VENV_CALIBRE_RAG)).toBe('calibre-rag-venv');
    });
  });
});

describe('mergeCalibreToolPathEnv', () => {
  it('prepends lib-rag venv bin and Calibre.app MacOS', () => {
    const prefixes = calibreToolPathPrefixes();
    expect(prefixes[0]).toBe('/Users/danemacaulay/projects/lib-rag/.venv/bin');
    expect(prefixes[1]).toBe('/Applications/calibre.app/Contents/MacOS');

    const merged = mergeCalibreToolPathEnv('/usr/bin:/bin');
    expect(merged.startsWith(`${prefixes[0]}:${prefixes[1]}:`)).toBe(true);
    expect(merged).toContain('/usr/bin');
  });
});
