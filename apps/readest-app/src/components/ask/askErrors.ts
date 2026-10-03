import {
  AntigravityAuthError,
  AntigravityNotFoundError,
  AntigravityTimeoutError,
} from '@/services/ai/ask/antigravityClient';
import { LightRAGUnreachableError } from '@/services/ai/lightrag/client';

export type AskErrorInfo = {
  message: string;
  offerAskWithoutLibrary: boolean;
};

/** Map Ask / LightRAG failures to user-visible copy and recovery actions. */
export function mapAskError(err: unknown): AskErrorInfo {
  if (
    err instanceof AntigravityNotFoundError ||
    err instanceof AntigravityAuthError ||
    err instanceof AntigravityTimeoutError ||
    err instanceof LightRAGUnreachableError
  ) {
    return {
      message: err.message,
      offerAskWithoutLibrary: err instanceof LightRAGUnreachableError,
    };
  }
  if (err instanceof Error && err.message) {
    return { message: err.message, offerAskWithoutLibrary: false };
  }
  return { message: String(err), offerAskWithoutLibrary: false };
}
