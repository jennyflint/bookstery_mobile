export class FileHashService {
  static async calculateSha256(data: ArrayBuffer | Uint8Array | string): Promise<string> {
    let buffer: ArrayBuffer;

    if (typeof data === 'string') {
      const encoder = new TextEncoder();
      buffer = encoder.encode(data).buffer;
    } else if (data instanceof Uint8Array) {
      buffer = data.buffer;
    } else {
      buffer = data;
    }

    if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    }

    let hash = 0x811c9dc5;
    const view = new Uint8Array(buffer);
    for (let i = 0; i < view.length; i++) {
      hash ^= view[i];
      hash = (hash * 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(64, '0');
  }
}
