/**
 * A picture from a repository, drawn whole - what the code viewer shows for a file that is an
 * image rather than text.
 *
 * Fitted to the space it has and centred (`fittedSize`): a raster shrunk to fit but never
 * enlarged past its own size, a vector drawn to fill the space. Under it, wherever it is
 * transparent, a checkerboard, as every image editor draws transparency - without one a dark
 * icon on the dark theme is simply not there. On iOS a pinch zooms it, with UIKit's own
 * zooming scroll view; Android's scroll view has no zoom, so there it is shown fitted.
 *
 * Its size comes from the file where the file says (`imageSize`, `svgSize`), so the frame
 * is right before the first pixel is decoded and nothing jumps. A format with no header read
 * here waits for the decoder to say, hidden until it has.
 */

import { Image, type ImageLoadEventData } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { Spacing, type Palette } from '../theme/tokens';
import { usePalette } from '../theme/use-palette';
import { fittedSize, type Size } from './file-view';
import { useBottomClearance } from './screen';

/** About this many squares under the largest picture, whatever its size. */
const SQUARES = 300;

export function ImageView({
  uri,
  name,
  vector,
  size,
  opaque = false,
  atBottom = true,
  onLoad,
  onError,
}: {
  uri: string;
  /** The file's name, which is all a screen reader can be told about a picture. */
  name: string;
  /** An SVG, which fills the space rather than stopping at its own size. */
  vector: boolean;
  /** Its own size, where the file says. */
  size?: Size;
  /** No transparency to show - a JPEG - so no checkerboard under it. */
  opaque?: boolean;
  /**
   * Whether it reaches the bottom of the screen, and so has to keep clear of the home
   * indicator. Not the upper of two pictures stacked one over the other.
   */
  atBottom?: boolean;
  /** Once decoded: whether it moves, which only the decoder knows. */
  onLoad?: (animated: boolean) => void;
  onError: () => void;
}) {
  const palette = usePalette();
  const clearance = useBottomClearance();
  const [space, setSpace] = useState<Size>();
  const [decoded, setDecoded] = useState<Size>();

  const natural = size ?? decoded;
  // Clear of the home indicator and the gesture bar, which the reader runs underneath. The
  // three buttons are the strip's room rather than this one's, so this is what is left.
  const bottom = atBottom ? clearance : 0;
  const available = space && {
    width: space.width - Spacing.four * 2,
    height: space.height - Spacing.four * 2 - bottom,
  };
  const frame = available && (natural ? fittedSize(natural, available, vector) : available);

  const handleLoad = (event: ImageLoadEventData) => {
    // The first answer only. Android decodes to fit the view, so an answer taken again after
    // the frame has shrunk to it could shrink the frame again, and again.
    const answer = { width: event.source.width, height: event.source.height };
    setDecoded((current) => current ?? answer);
    onLoad?.(!!event.source.isAnimated);
  };

  const picture = frame ? (
    <View style={{ width: frame.width, height: frame.height }}>
      {natural && !opaque ? <Checkerboard size={frame} palette={palette} /> : null}
      <Image
        source={{ uri }}
        style={[StyleSheet.absoluteFill, natural ? null : styles.hidden]}
        contentFit="contain"
        // The file is named by its content, so a memory cache can never show a stale one;
        // the platform's disk cache would only be a second copy of a file already on disk.
        cachePolicy="memory"
        transition={120}
        accessible
        accessibilityLabel={name}
        onLoad={handleLoad}
        onError={onError}
      />
    </View>
  ) : null;

  return (
    <View
      style={styles.fill}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setSpace({ width, height });
      }}>
      {space && process.env.EXPO_OS === 'ios' ? (
        <ScrollView
          style={styles.fill}
          contentContainerStyle={[
            styles.centre,
            { width: space.width, height: space.height, paddingBottom: bottom },
          ]}
          maximumZoomScale={10}
          minimumZoomScale={1}
          bouncesZoom
          centerContent
          alwaysBounceVertical={false}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior="never">
          {picture}
        </ScrollView>
      ) : space ? (
        <View style={[styles.fill, styles.centre, { paddingBottom: bottom }]}>
          {picture}
        </View>
      ) : null}

      {natural ? null : (
        <View style={[StyleSheet.absoluteFill, styles.centre]} pointerEvents="none">
          <ActivityIndicator color={palette.textSecondary} />
        </View>
      )}
    </View>
  );
}

/**
 * Squares of two greys, as big as they need to be to keep their number near `SQUARES`: one
 * view per dark square over a light ground, so a handful under an icon and never much more
 * than a hundred and fifty under a picture that fills the screen.
 */
function Checkerboard({ size, palette }: { size: Size; palette: Palette }) {
  const square = Math.max(12, Math.ceil(Math.sqrt((size.width * size.height) / SQUARES)));
  const columns = Math.ceil(size.width / square);
  const rows = Math.ceil(size.height / square);

  const squares = [];
  for (let row = 0; row < rows; row++) {
    for (let column = row % 2; column < columns; column += 2) {
      squares.push(
        <View
          key={`${row}:${column}`}
          style={{
            position: 'absolute',
            left: column * square,
            top: row * square,
            width: square,
            height: square,
            backgroundColor: palette.separator,
          }}
        />
      );
    }
  }

  return (
    <View
      style={[StyleSheet.absoluteFill, styles.board, { backgroundColor: palette.surface }]}
      pointerEvents="none">
      {squares}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  centre: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  hidden: {
    opacity: 0,
  },
  board: {
    overflow: 'hidden',
  },
});
