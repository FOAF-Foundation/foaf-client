import { useEffect, useState } from 'react';
import { Image, View, type StyleProp, type ViewStyle } from 'react-native';
import { SymmetricPixelAvatar } from './SymmetricPixelAvatar';
import { useFoafTheme } from './FoafThemeProvider';
import { shouldShowImage } from './avatarFallback';
import type { FoafUiTheme } from './theme';

export { shouldShowImage } from './avatarFallback';

export interface UserAvatarProps {
  name: string;
  imageUrl?: string | null;
  size?: number;
  square?: boolean;
  style?: StyleProp<ViewStyle>;
  theme?: Partial<FoafUiTheme>;
}

export function UserAvatar({
  name,
  imageUrl,
  size = 44,
  square = false,
  style,
  theme,
}: UserAvatarProps) {
  // Context theme is read so the identicon inherits palettes from the provider;
  // a `theme` prop override wins and is forwarded to SymmetricPixelAvatar.
  useFoafTheme();
  const [failed, setFailed] = useState(false);
  const showImage = shouldShowImage(failed, imageUrl);
  const borderRadius = square ? Math.round(size * 0.18) : size / 2;

  useEffect(() => {
    setFailed(false);
  }, [imageUrl]);

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      {/* Identicon is the always-present base layer; the uploaded image (if any)
          overlays it once painted. This way a slow- or failed-loading image never
          exposes a blank gap — the identicon shows through underneath instead of
          flickering blank -> identicon on every remount (which a stale/broken
          imageUrl did, since `failed` resets to false on each mount). */}
      <SymmetricPixelAvatar name={name} size={size} square={square} theme={theme} />
      {showImage && (
        <Image
          source={{ uri: imageUrl as string }}
          onError={() => setFailed(true)}
          style={{ position: 'absolute', width: size, height: size }}
          accessibilityLabel={`${name} avatar`}
        />
      )}
    </View>
  );
}
