import { useId } from 'react';
import Svg, { Defs, G, Mask, Rect } from 'react-native-svg';
import { defaultFoafTheme, useFoafTheme } from './FoafThemeProvider';
import type { FoafUiTheme } from './theme';

const SIZE = 80;
const CELL_SIZE = 8;

export interface SymmetricPixelAvatarProps {
  name: string;
  size?: number;
  square?: boolean;
  theme?: Partial<FoafUiTheme>;
}

function hashCode(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash &= hash;
  }
  return Math.abs(hash);
}

function pickPalette(seed: string, palettes: string[][]): string[] {
  return palettes[hashCode(seed) % palettes.length];
}

function pickColor(seed: string, n: number, palette: string[]): string {
  return palette[hashCode(`${seed}${n}`) % palette.length];
}

export function SymmetricPixelAvatar({
  name,
  size = 40,
  square = false,
  theme,
}: SymmetricPixelAvatarProps) {
  const contextTheme = useFoafTheme();
  const palettes =
    theme?.identiconPalettes ??
    contextTheme.identiconPalettes ??
    defaultFoafTheme.identiconPalettes!;
  const palette = pickPalette(name, palettes);
  const instanceId = useId().replace(/:/g, '');
  const maskId = `sym-pixel-${instanceId}-${square ? 'square' : 'circle'}`;
  const cells: Array<{ x: number; y: number; color: string }> = [];

  for (let y = 0; y < 10; y += 1) {
    for (let x = 0; x < 5; x += 1) {
      const color = pickColor(`${name}${x}${y}`, x * y, palette);
      cells.push({ x: x * CELL_SIZE, y: y * CELL_SIZE, color });
      cells.push({ x: (9 - x) * CELL_SIZE, y: y * CELL_SIZE, color });
    }
  }

  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      fill="none"
      role="img"
    >
      <Defs>
        <Mask
          id={maskId}
          maskUnits="userSpaceOnUse"
          x={0}
          y={0}
          width={SIZE}
          height={SIZE}
        >
          <Rect
            width={SIZE}
            height={SIZE}
            rx={square ? undefined : SIZE * 2}
            fill="#FFFFFF"
          />
        </Mask>
      </Defs>
      <G mask={`url(#${maskId})`}>
        {cells.map((cell, index) => (
          <Rect
            key={`${index}-${cell.x}-${cell.y}`}
            x={cell.x}
            y={cell.y}
            width={CELL_SIZE}
            height={CELL_SIZE}
            fill={cell.color}
          />
        ))}
      </G>
    </Svg>
  );
}
