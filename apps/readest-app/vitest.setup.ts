// jsdom + cross-realm Blobs (e.g. @zip.js/zip.js BlobWriter output):
// `instanceof Blob` is false for those objects, so `new Blob([zipBlob])` /
// `new File([zipBlob], name)` stringifies each part to the 13-byte
// "[object Blob]" (wrong .size / .arrayBuffer / .slice). That breaks Yomitan /
// EPUB / CBZ tests. Duck-type blob-like parts and materialize bytes correctly.
(() => {
  const OrigBlob = globalThis.Blob;
  const OrigFile = globalThis.File;
  if (typeof OrigBlob !== 'function' || typeof OrigFile !== 'function') return;

  type BlobLike = {
    size: number;
    slice: Blob['slice'];
    arrayBuffer: Blob['arrayBuffer'];
    text: Blob['text'];
    stream: Blob['stream'];
    bytes?: Blob['bytes'];
  };

  const isBlobLike = (value: unknown): value is BlobLike =>
    !!value &&
    typeof value === 'object' &&
    typeof (value as BlobLike).size === 'number' &&
    typeof (value as BlobLike).arrayBuffer === 'function' &&
    typeof (value as BlobLike).slice === 'function';

  const isForeignBlobLike = (value: unknown): value is BlobLike =>
    isBlobLike(value) &&
    typeof value !== 'string' &&
    !(value instanceof ArrayBuffer) &&
    !ArrayBuffer.isView(value) &&
    !(value instanceof OrigBlob);

  const partByteLength = (part: BlobPart): number => {
    if (typeof part === 'string') return new TextEncoder().encode(part).byteLength;
    if (part instanceof ArrayBuffer) return part.byteLength;
    if (ArrayBuffer.isView(part)) return part.byteLength;
    if (isBlobLike(part)) return part.size;
    return 0;
  };

  const partToBytes = async (part: BlobPart): Promise<Uint8Array> => {
    if (typeof part === 'string') return new TextEncoder().encode(part);
    if (part instanceof ArrayBuffer) return new Uint8Array(part);
    if (ArrayBuffer.isView(part)) {
      return new Uint8Array(part.buffer, part.byteOffset, part.byteLength);
    }
    if (isBlobLike(part)) return new Uint8Array(await part.arrayBuffer());
    return new Uint8Array(0);
  };

  const concatBytes = (chunks: Uint8Array[]): Uint8Array<ArrayBuffer> => {
    const total = chunks.reduce((n, c) => n + c.byteLength, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return out;
  };

  class Blob extends OrigBlob {
    readonly #parts: BlobPart[] | null;
    readonly #size: number;

    constructor(blobParts?: BlobPart[], options?: BlobPropertyBag) {
      const parts = blobParts ? [...blobParts] : [];
      if (!parts.some(isForeignBlobLike)) {
        super(blobParts, options);
        this.#parts = null;
        this.#size = super.size;
        return;
      }

      const size = parts.reduce((n, part) => n + partByteLength(part), 0);
      super([], options);
      this.#parts = parts;
      this.#size = size;
      Object.defineProperty(this, 'size', {
        configurable: true,
        enumerable: true,
        get: () => this.#size,
      });
    }

    override slice(start?: number, end?: number, contentType?: string): Blob {
      if (!this.#parts) return super.slice(start, end, contentType);
      const from = Math.max(0, start ?? 0);
      const to = Math.min(this.#size, end ?? this.#size);

      const view: BlobLike = {
        size: Math.max(0, to - from),
        arrayBuffer: async () => {
          const bytes = new Uint8Array(await this.arrayBuffer());
          return bytes.slice(from, to).buffer;
        },
        slice: (s?: number, e?: number, t?: string) =>
          this.slice(from + (s ?? 0), e === undefined ? to : from + e, t ?? contentType),
        text: async () => new TextDecoder().decode(new Uint8Array(await view.arrayBuffer())),
        stream: () =>
          new ReadableStream({
            async start(controller) {
              controller.enqueue(new Uint8Array(await view.arrayBuffer()));
              controller.close();
            },
          }),
      };
      return new Blob(
        [view as unknown as BlobPart],
        contentType ? { type: contentType } : undefined,
      );
    }

    override async arrayBuffer(): Promise<ArrayBuffer> {
      if (!this.#parts) return super.arrayBuffer();
      const chunks = await Promise.all(this.#parts.map(partToBytes));
      return concatBytes(chunks).buffer;
    }

    override async bytes(): Promise<Uint8Array<ArrayBuffer>> {
      if (!this.#parts) return super.bytes();
      return concatBytes(await Promise.all(this.#parts.map(partToBytes)));
    }

    override async text(): Promise<string> {
      if (!this.#parts) return super.text();
      return new TextDecoder().decode(await this.bytes());
    }

    override stream(): ReadableStream<Uint8Array<ArrayBuffer>> {
      if (!this.#parts) return super.stream();
      const parts = this.#parts;
      return new ReadableStream({
        async start(controller) {
          for (const part of parts) {
            controller.enqueue(await partToBytes(part));
          }
          controller.close();
        },
      });
    }
  }

  class File extends OrigFile {
    readonly #backing: BlobLike | null;

    constructor(fileBits: BlobPart[], fileName: string, options?: FilePropertyBag) {
      const only = fileBits.length === 1 ? fileBits[0] : undefined;
      const useBacking =
        only !== undefined &&
        typeof only !== 'string' &&
        !(only instanceof ArrayBuffer) &&
        !ArrayBuffer.isView(only) &&
        isBlobLike(only);

      if (useBacking) {
        super([new Uint8Array(0)], fileName, options);
        this.#backing = only;
        Object.defineProperty(this, 'size', {
          configurable: true,
          enumerable: true,
          get: () => this.#backing!.size,
        });
        return;
      }

      super(fileBits, fileName, options);
      this.#backing = null;
    }

    override slice(start?: number, end?: number, contentType?: string): Blob {
      return this.#backing
        ? this.#backing.slice(start, end, contentType)
        : super.slice(start, end, contentType);
    }

    override arrayBuffer(): Promise<ArrayBuffer> {
      return this.#backing ? this.#backing.arrayBuffer() : super.arrayBuffer();
    }

    override bytes(): Promise<Uint8Array<ArrayBuffer>> {
      if (this.#backing?.bytes) return this.#backing.bytes();
      if (this.#backing) {
        return this.#backing.arrayBuffer().then((buf) => new Uint8Array(buf));
      }
      return super.bytes();
    }

    override text(): Promise<string> {
      return this.#backing ? this.#backing.text() : super.text();
    }

    override stream(): ReadableStream<Uint8Array<ArrayBuffer>> {
      return this.#backing ? this.#backing.stream() : super.stream();
    }
  }

  globalThis.Blob = Blob as typeof OrigBlob;
  globalThis.File = File as typeof OrigFile;
})();

// jsdom does not implement the CSS namespace; foliate-js TTS uses CSS.escape
// (mark[name="…"] lookups). Provide the standard polyfill so those paths work.
const globalWithCSS = globalThis as { CSS?: { escape?: (value: string) => string } };
if (!globalWithCSS.CSS) globalWithCSS.CSS = {};
if (typeof globalWithCSS.CSS.escape !== 'function') {
  globalWithCSS.CSS.escape = (value: string): string => {
    const string = String(value);
    const length = string.length;
    const firstCodeUnit = string.charCodeAt(0);
    let result = '';
    let index = -1;
    while (++index < length) {
      const codeUnit = string.charCodeAt(index);
      if (codeUnit === 0x0000) {
        result += '�';
      } else if (
        (codeUnit >= 0x0001 && codeUnit <= 0x001f) ||
        codeUnit === 0x007f ||
        (index === 0 && codeUnit >= 0x0030 && codeUnit <= 0x0039) ||
        (index === 1 && codeUnit >= 0x0030 && codeUnit <= 0x0039 && firstCodeUnit === 0x002d)
      ) {
        result += '\\' + codeUnit.toString(16) + ' ';
      } else if (index === 0 && length === 1 && codeUnit === 0x002d) {
        result += '\\' + string.charAt(index);
      } else if (
        codeUnit >= 0x0080 ||
        codeUnit === 0x002d ||
        codeUnit === 0x005f ||
        (codeUnit >= 0x0030 && codeUnit <= 0x0039) ||
        (codeUnit >= 0x0041 && codeUnit <= 0x005a) ||
        (codeUnit >= 0x0061 && codeUnit <= 0x007a)
      ) {
        result += string.charAt(index);
      } else {
        result += '\\' + string.charAt(index);
      }
    }
    return result;
  };
}

// matchMedia mock
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

// jsdom reports these unimplemented methods to its virtual console even when
// the calling test passes. Tests that need media behavior replace them locally.
if (typeof HTMLMediaElement !== 'undefined') {
  HTMLMediaElement.prototype.play = () => Promise.resolve();
  HTMLMediaElement.prototype.pause = () => {};
  HTMLMediaElement.prototype.load = () => {};
}
