import { useState } from 'react';
import { View, Text, Image } from 'react-native';
import { fonts } from '../../lib/theme';

function faviconUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
  } catch {
    return null;
  }
}

function initialColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 45%, 88%)`;
}

type Props = {
  url?: string | null;
  title: string;
};

export default function BizIcon({ url, title }: Props) {
  const [failed, setFailed] = useState(false);
  const src = url ? faviconUrl(url) : null;
  const letter = (title || '?')[0].toUpperCase();

  if (src && !failed) {
    return (
      <Image
        source={{ uri: src }}
        style={{ width: 28, height: 28, borderRadius: 6 }}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <View
      style={{
        width: 28,
        height: 28,
        borderRadius: 6,
        backgroundColor: initialColor(title),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: 'rgba(0,0,0,0.5)' }}>
        {letter}
      </Text>
    </View>
  );
}
