/**
 * Telling the platform's own text what size to draw at.
 *
 * Nothing to do here: iOS pins Dynamic Type on each `Host` instead (`src/ui/host.ios.tsx`),
 * and the web has no native rows at all. Android's version does the work.
 */

export function useNativeTextScale(_scale: number): void {}
