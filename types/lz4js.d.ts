declare module "lz4js" {
  export function decompressBound(source: Uint8Array): number;
  export function decompress(source: Uint8Array, maxSize?: number): Uint8Array;
}
