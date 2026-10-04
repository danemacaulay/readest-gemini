import type { AppService, FileSystem } from '@/types/system';

/** AppService keeps `fs` on implementations but not on the public interface. */
export function fileSystemFromAppService(appService: AppService): FileSystem {
  const fs = (appService as unknown as { fs?: FileSystem }).fs;
  if (!fs) {
    throw new Error('AppService filesystem is unavailable');
  }
  return fs;
}
