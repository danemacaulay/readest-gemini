import {
  AntigravityAuthError,
  AntigravityNotFoundError,
  AntigravityTimeoutError,
} from '@/services/ai/ask/antigravityClient';

export type AskErrorInfo = { message: string };

export function mapAskError(err: unknown): AskErrorInfo {
  if (
    err instanceof AntigravityNotFoundError ||
    err instanceof AntigravityAuthError ||
    err instanceof AntigravityTimeoutError
  ) {
    return { message: err.message };
  }
  if (err instanceof Error && err.message) return { message: err.message };
  return { message: String(err) };
}
