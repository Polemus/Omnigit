/**
 * How the code viewer shows a file, apart from the drawing (`image-view.tsx` and the file
 * screen) so the rules can be tested plain: as text, as a picture, as an SVG - a picture that
 * is also source - or not at all.
 *
 * Decided by the name, before anything is fetched, because the two reads differ: text is
 * decoded as UTF-8, and an image put through that decoding comes out as noise. A file whose
 * name promises nothing is read as text, and `textFromBase64` still refuses bytes that are
 * plainly not text.
 */

import { fileType } from './file-types';

export type FileView = 'text' | 'image' | 'svg' | 'none';

/** Formats with no drawing here - video, sound, fonts, documents, archives. */
const UNSHOWN = new Set(['video', 'audio', 'font', 'pdf', 'archive']);

export function fileView(nameOrPath: string): FileView {
  const name = baseName(nameOrPath);
  if (/\.svg$/i.test(name)) return 'svg';
  const { kind } = fileType(name);
  if (kind === 'image') return 'image';
  return UNSHOWN.has(kind) ? 'none' : 'text';
}

/**
 * What to call a file the viewer does not draw, and what the site lets you do with it - for
 * a sentence that says so rather than a screen of its bytes read as text.
 */
export function unshownKind(nameOrPath: string): { noun: string; verb: string } {
  switch (fileType(baseName(nameOrPath)).kind) {
    case 'video':
      return { noun: 'video', verb: 'play' };
    case 'audio':
      return { noun: 'sound file', verb: 'play' };
    case 'font':
      return { noun: 'font', verb: 'see' };
    case 'pdf':
      return { noun: 'PDF', verb: 'read' };
    case 'archive':
      return { noun: 'archive', verb: 'download' };
    default:
      return { noun: 'file', verb: 'see' };
  }
}

/** What the legend calls an image: `PNG`, `JPEG`, `WebP`… */
export function imageFormat(nameOrPath: string): string {
  const extension = baseName(nameOrPath).split('.').pop()?.toLowerCase() ?? '';
  return FORMATS[extension] ?? (extension.toUpperCase() || 'Image');
}

const FORMATS: Record<string, string> = {
  jpg: 'JPEG',
  jpeg: 'JPEG',
  webp: 'WebP',
  tif: 'TIFF',
  heif: 'HEIF',
  svg: 'SVG',
};

/** `512 B`, `42 KB`, `1.2 MB` - as the file browser lists sizes. */
export function describeSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** How many bytes a base64 string decodes to, without decoding it. */
export function base64Bytes(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

export interface Size {
  width: number;
  height: number;
}

/**
 * The size to draw a picture at in the space it has, centred.
 *
 * A raster image is shrunk to fit and never enlarged: an icon blown up to fill a phone is a
 * blur that tells nobody what the icon looks like. A vector has no size it loses anything
 * by leaving, so it fills the space - a 24-unit icon drawn at 24 points is a speck.
 */
export function fittedSize(natural: Size, space: Size, vector: boolean): Size {
  if (natural.width <= 0 || natural.height <= 0 || space.width <= 0 || space.height <= 0) {
    return { width: Math.max(0, space.width), height: Math.max(0, space.height) };
  }
  const fit = Math.min(space.width / natural.width, space.height / natural.height);
  const scale = vector ? fit : Math.min(1, fit);
  return {
    width: Math.round(natural.width * scale),
    height: Math.round(natural.height * scale),
  };
}

/**
 * An SVG's own size, from its root element: `width` and `height`, or else its `viewBox`,
 * whose proportions also complete a root that names only one of the two.
 *
 * Needed because Android's decoder draws an SVG at whatever size it is asked for, and then
 * reports that size back - the size of the view, rather than of the drawing. Units other
 * than pixels are not converted: a percentage says nothing about the drawing, and `mm` would
 * be a guess at a screen's density.
 */
export function svgSize(source: string): Size | undefined {
  const root = /<svg\b[^>]*>/i.exec(source)?.[0];
  if (!root) return undefined;

  const attribute = (name: string) =>
    new RegExp(`\\s${name}\\s*=\\s*(["'])([^"']*)\\1`, 'i').exec(root)?.[2];

  const box = attribute('viewBox')
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  const viewBox =
    box && box.length === 4 && box.every(Number.isFinite) && box[2] > 0 && box[3] > 0
      ? { width: box[2], height: box[3] }
      : undefined;

  const width = pixels(attribute('width'));
  const height = pixels(attribute('height'));

  if (width && height) return { width, height };
  if (viewBox && width) return { width, height: (width * viewBox.height) / viewBox.width };
  if (viewBox && height) return { width: (height * viewBox.width) / viewBox.height, height };
  return viewBox;
}

/**
 * An SVG as iOS's decoder will recognise one.
 *
 * SDWebImage calls data an SVG only when its first byte is `<` and `</svg>` sits within its
 * last hundred bytes, so a byte-order mark, a blank first line or a comment after the closing
 * tag each leave a perfectly good drawing undrawn - silently, as a failed load. Nothing
 * before the first tag or after the last closing one is part of the drawing.
 */
export function drawableSvg(source: string): string {
  const start = source.indexOf('<');
  const end = source.lastIndexOf('</svg>');
  if (start < 0 || end < start) return source;
  return source.slice(start, end + '</svg>'.length);
}

/**
 * Whether text is a Git LFS pointer rather than the file: what a repository that keeps its
 * images in LFS holds in their place, and what the sites' contents APIs then serve.
 */
export function isLfsPointer(text: string): boolean {
  return text.startsWith('version https://git-lfs.github.com/spec/');
}

/**
 * The first `limit` bytes a base64 string decodes to - enough for an image's header without
 * decoding a megabyte to read twenty of them.
 */
export function bytesFromBase64(base64: string, limit = Infinity): Uint8Array {
  const prefix = Number.isFinite(limit) ? base64.slice(0, Math.ceil(limit / 3) * 4) : base64;
  try {
    return Uint8Array.from(atob(prefix), (char) => char.charCodeAt(0));
  } catch {
    return new Uint8Array(0);
  }
}

/**
 * How far into a JPEG its size may be: past the EXIF block, and the thumbnail and colour
 * profile a camera writes before the frame header.
 */
export const JPEG_HEADER_LIMIT = 512 * 1024;

/**
 * A raster image's pixel size, read from its header: PNG, GIF, JPEG, WebP and BMP, which is
 * nearly every picture a repository holds. Read rather than taken from the decoder, because
 * Android's decodes a large image at the size of the view it is going into and reports that
 * instead - which is right for memory and wrong for saying how big the image is.
 */
export function imageSize(bytes: Uint8Array): Size | undefined {
  const at = (index: number) => bytes[index] ?? 0;
  const u16be = (index: number) => (at(index) << 8) | at(index + 1);
  const u16le = (index: number) => at(index) | (at(index + 1) << 8);
  const u24le = (index: number) => at(index) | (at(index + 1) << 8) | (at(index + 2) << 16);
  const i32le = (index: number) =>
    at(index) | (at(index + 1) << 8) | (at(index + 2) << 16) | (at(index + 3) << 24);
  const u32be = (index: number) =>
    at(index) * 0x1000000 + ((at(index + 1) << 16) | (at(index + 2) << 8) | at(index + 3));
  const ascii = (index: number, length: number) =>
    String.fromCharCode(...bytes.subarray(index, index + length));
  const sized = (width: number, height: number) =>
    width > 0 && height > 0 ? { width, height } : undefined;

  // PNG: the signature, then the IHDR chunk, which the format requires to come first.
  if (at(0) === 0x89 && ascii(1, 3) === 'PNG') return sized(u32be(16), u32be(20));

  // GIF87a and GIF89a: the logical screen.
  if (ascii(0, 3) === 'GIF') return sized(u16le(6), u16le(8));

  // BMP: an OS/2 header holds 16-bit sizes, every later one 32-bit - and a negative height
  // is a bitmap stored top-down, not a smaller one.
  if (ascii(0, 2) === 'BM') {
    if (i32le(14) === 12) return sized(u16le(18), u16le(20));
    return sized(Math.abs(i32le(18)), Math.abs(i32le(22)));
  }

  // WebP: a RIFF container, then lossy, lossless or extended.
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    const chunk = ascii(12, 4);
    if (chunk === 'VP8 ') return sized(u16le(26) & 0x3fff, u16le(28) & 0x3fff);
    if (chunk === 'VP8L') {
      const packed = (at(21) | (at(22) << 8) | (at(23) << 16) | (at(24) << 24)) >>> 0;
      return sized((packed & 0x3fff) + 1, ((packed >>> 14) & 0x3fff) + 1);
    }
    if (chunk === 'VP8X') return sized(u24le(24) + 1, u24le(27) + 1);
    return undefined;
  }

  // JPEG: walk the segments to the first start-of-frame, which holds the size.
  if (at(0) === 0xff && at(1) === 0xd8) {
    let index = 2;
    while (index + 8 < bytes.length) {
      if (at(index) !== 0xff) return undefined;
      const marker = at(index + 1);
      // Padding between segments.
      if (marker === 0xff) {
        index += 1;
        continue;
      }
      // Markers that stand alone, with no length after them.
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
        index += 2;
        continue;
      }
      // The scan, or the end, before any frame: there is no size to find.
      if (marker === 0xd9 || marker === 0xda) return undefined;
      // SOF0 to SOF15, less the three markers in that range that are not frames.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return sized(u16be(index + 7), u16be(index + 5));
      }
      index += 2 + u16be(index + 2);
    }
  }

  return undefined;
}

function pixels(value: string | undefined): number | undefined {
  const match = /^\s*(\d*\.?\d+)\s*(px)?\s*$/i.exec(value ?? '');
  const parsed = match ? Number(match[1]) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}
