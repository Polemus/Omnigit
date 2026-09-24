/**
 * Images from repositories, written where `expo-image` can draw them.
 *
 * A site hands a file over as base64 inside JSON, and a `data:` URI would be the obvious way
 * on to the screen - but on Android `expo-image` reads a `data:` URI through a loader of its
 * own that produces bytes in memory, and the SVG decoder is registered only for a stream, so
 * an SVG drawn that way is simply never decoded. A file is read the same way everywhere, on
 * both platforms, for every format. So the bytes go to a file in the cache and the image is
 * drawn from there.
 *
 * Each file is named by a hash of its content: the same picture on two branches is one file,
 * and a picture that changes gets a new name - so no image cache, ours or the platform's,
 * can go on showing the old one. The folder is emptied the first time it is used after a
 * launch, which bounds it by one session's browsing and never deletes a file something on
 * screen is still showing.
 */

import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

import { textFromBase64 } from '../hosts/provider';
import {
  base64Bytes,
  bytesFromBase64,
  drawableSvg,
  imageSize,
  isLfsPointer,
  JPEG_HEADER_LIMIT,
  svgSize,
  type Size,
} from '../ui/file-view';

/** Past this a picture is not worth holding in memory to draw on a phone. */
const MAX_BYTES = 20 * 1024 * 1024;

export type FilePreview =
  | {
      kind: 'ready';
      /** The `file://` copy to draw. */
      uri: string;
      /** The file's size, from the bytes the site sent. */
      bytes: number;
      /**
       * The picture's own size, where its header or its root element says: pixels for a
       * raster, user units for an SVG. Unknown for the formats with no header read here.
       */
      size?: Size;
      /** An SVG's source, for its Source view - it is text as well as a picture. */
      source?: string;
    }
  /** A Git LFS pointer stands where the file should be; the site serves no more. */
  | { kind: 'lfs' }
  | { kind: 'too-large'; bytes: number };

let swept = false;

export async function writePreview(base64: string, path: string): Promise<FilePreview> {
  const bytes = base64Bytes(base64);
  if (bytes > MAX_BYTES) return { kind: 'too-large', bytes };

  // An LFS pointer is a few lines of text, so only a small file is worth decoding to check.
  const isSvg = /\.svg$/i.test(path);
  const text = isSvg || bytes < 1024 ? textFromBase64(base64) : undefined;
  if (text !== undefined && isLfsPointer(text)) return { kind: 'lfs' };

  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, base64);
  // Kept only so the file says what it is to anyone looking; both decoders sniff the bytes.
  const extension = /\.([a-z0-9]{1,8})$/i.exec(path)?.[1]?.toLowerCase();
  const file = new File(previewFolder(), extension ? `${digest}.${extension}` : digest);

  if (!file.exists) {
    try {
      file.create({ intermediates: true });
      if (isSvg && text !== undefined) file.write(drawableSvg(text));
      else file.write(base64, { encoding: 'base64' });
    } catch (error) {
      // Half a file would be drawn from for the rest of the session: its name says it is
      // complete, so nothing would ever write it again.
      try {
        if (file.exists) file.delete();
      } catch {
        // Nothing more to be done; the query fails either way, and its retry starts again.
      }
      throw error;
    }
  }

  const size = isSvg
    ? text !== undefined
      ? svgSize(text)
      : undefined
    : imageSize(bytesFromBase64(base64, /\.jpe?g$/i.test(path) ? JPEG_HEADER_LIMIT : 64));

  return { kind: 'ready', uri: file.uri, bytes, size, source: isSvg ? text : undefined };
}

/** A preview's bytes again, for putting the picture on the clipboard. */
export function previewBase64(uri: string): Promise<string> {
  return new File(uri).base64();
}

function previewFolder(): Directory {
  const folder = new Directory(Paths.cache, 'previews');
  if (!swept) {
    swept = true;
    try {
      if (folder.exists) folder.delete();
    } catch {
      // A folder that will not go leaves last session's pictures in the cache, which the
      // system clears on its own when it needs the space.
    }
  }
  if (!folder.exists) folder.create({ intermediates: true, idempotent: true });
  return folder;
}
