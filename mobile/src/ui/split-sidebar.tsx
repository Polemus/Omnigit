/** Non-iOS fallback; the Split View shell is never rendered on these platforms. */

export type SplitDestination = '/' | '/inbox' | '/search' | '/settings';

export function SplitSidebar({ onSelect: _onSelect }: { onSelect: (to: SplitDestination) => void }) {
  return null;
}
