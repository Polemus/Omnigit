/**
 * Liquid Glass where the platform has it, and something honest where it does not.
 *
 * `GlassView` is iOS 26 and above. Everywhere else - older iOS, every Android, web - it
 * falls back to a plain `View`, which would be *transparent*, and a floating bar with a
 * list scrolling under it needs to be readable rather than pretty. So the fallback is
 * chosen here rather than left to the library: a tinted, bordered surface that reads as
 * raised without pretending to refract anything.
 */

import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { StyleSheet, View, type ViewProps } from 'react-native';

import { Radius } from '../theme/tokens';
import { usePalette } from '../theme/use-palette';

/** True once, at module load: the OS does not gain Liquid Glass while the app is open. */
export const hasGlass = isLiquidGlassAvailable();

interface GlassSurfaceProps extends ViewProps {
  /** `clear` for a bar over content, `regular` for a panel that holds its own. */
  variant?: 'clear' | 'regular';
  /** Rounds both the glass and the fallback identically. */
  radius?: number;
  /** Whether the glass reacts to touches, which only makes sense for a control. */
  interactive?: boolean;
}

export function GlassSurface({
  variant = 'regular',
  radius = Radius.large,
  interactive = false,
  style,
  children,
  ...rest
}: GlassSurfaceProps) {
  const palette = usePalette();

  if (hasGlass) {
    return (
      <GlassView
        glassEffectStyle={variant}
        isInteractive={interactive}
        style={[{ borderRadius: radius }, style]}
        {...rest}>
        {children}
      </GlassView>
    );
  }

  return (
    <View
      style={[
        {
          borderRadius: radius,
          backgroundColor: palette.glassFallback,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: palette.separator,
        },
        style,
      ]}
      {...rest}>
      {children}
    </View>
  );
}
