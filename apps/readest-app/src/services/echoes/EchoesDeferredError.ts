import type { EchoRetrieveTrace } from './types';

/** Thrown when retrieve keeps no usable sources — no agy call, no trail upsert. */
export class EchoesDeferredError extends Error {
  readonly code = 'echoes_deferred' as const;

  constructor(public readonly trace: EchoRetrieveTrace) {
    super('Nothing in your library points this direction');
    this.name = 'EchoesDeferredError';
  }
}
