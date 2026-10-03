export { createTauriAdapter } from './TauriChatAdapter';
export type { TauriAdapterOptions } from './TauriChatAdapter';
export {
  createAntigravityChatAdapter,
  buildAntigravityPrompt,
} from './AntigravityChatAdapter';
export type { AntigravityAdapterOptions } from './AntigravityChatAdapter';
export { selectBackend } from './retrievalBackend';
export type { RetrievalBackend, RetrievalBackendKind } from './retrievalBackend';
export { LegacyIdbBackend } from './LegacyIdbBackend';
export { ReedyBackend } from './ReedyBackend';
export { ReedySourceStore } from './reedySourceStore';
export type { SourceItem } from './reedySourceStore';
