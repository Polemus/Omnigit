/**
 * Compatibility exports for the components concerned only with text size. Appearance,
 * bold text and size now belong to one persisted display-preferences provider.
 */

export {
  LARGEST_TEXT_SCALE,
  SMALLEST_TEXT_SCALE,
  useTextScale,
  useTextScaleSetting,
} from './display-preferences';
