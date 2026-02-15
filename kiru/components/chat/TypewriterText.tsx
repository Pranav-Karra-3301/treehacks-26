import { useState, useEffect, useRef, memo } from 'react';
import { Text, type TextStyle } from 'react-native';
import * as Haptics from 'expo-haptics';

type Props = {
  text: string;
  animate?: boolean;
  style?: TextStyle;
};

const BASE_CHAR_DELAY = 22;
const MAX_ANIMATION_MS = 2000;
const HAPTIC_EVERY_N = 4;

export default memo(function TypewriterText({ text, animate = true, style }: Props) {
  const [displayed, setDisplayed] = useState(animate ? '' : text);
  const indexRef = useRef(animate ? 0 : text.length);

  useEffect(() => {
    if (!animate || text.length === 0) {
      setDisplayed(text);
      return;
    }

    let mounted = true;
    let hapticCount = 0;
    const delay = Math.min(BASE_CHAR_DELAY, MAX_ANIMATION_MS / text.length);

    const timer = setInterval(() => {
      if (!mounted) {
        clearInterval(timer);
        return;
      }

      indexRef.current += 1;
      const idx = indexRef.current;
      setDisplayed(text.slice(0, idx));

      hapticCount += 1;
      if (hapticCount % HAPTIC_EVERY_N === 0) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
      }

      if (idx >= text.length) {
        clearInterval(timer);
      }
    }, delay);

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [text, animate]);

  return <Text style={style}>{displayed}</Text>;
});
