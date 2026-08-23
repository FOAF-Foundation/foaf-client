import { useEffect, useState } from 'react';
import { Image, View, type StyleProp, type ViewStyle } from 'react-native';
import { SymmetricPixelAvatar } from './SymmetricPixelAvatar';
import type { UserAvatarProps } from './UserAvatar';
import { shouldShowImage } from './avatarFallback';
import { useFoafTheme } from './FoafThemeProvider';

export type { UserAvatarProps } from './UserAvatar';

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
      {/* Web swap form: show the image OR the identicon (no overlay). onError
          flips `failed`, which swaps in the identicon (EC-6). */}
      {showImage ? (
        <Image
          source={{ uri: imageUrl as string }}
          onError={() => setFailed(true)}
          style={{ width: size, height: size }}
          accessibilityLabel={`${name} avatar`}
        />
      ) : (
        <SymmetricPixelAvatar name={name} size={size} square={square} theme={theme} />
      )}
    </View>
  );
}
