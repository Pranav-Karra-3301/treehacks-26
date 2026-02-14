import { View, Text, Pressable, Linking } from 'react-native';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { Phone, ArrowRight, Globe } from 'lucide-react-native';
import type { BusinessResult } from '../../lib/types';
import { colors, fonts, shadows } from '../../lib/theme';
import BizIcon from './BizIcon';
import * as Haptics from 'expo-haptics';

type Props = {
  results: BusinessResult[];
  onCall: (result: BusinessResult, phone: string) => void;
  onSkip: () => void;
};

function cleanSnippet(raw: string): string {
  return raw
    .replace(/!\[.*?\]/g, '')
    .replace(/\[!\[.*?\]\]/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]/g, '$1')
    .replace(/#{1,6}\s*/g, '')
    .replace(/\*{1,3}/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s|*#\-]+/, '')
    .trim();
}

function formatPhone(phone: string): string {
  const d = phone.replace(/\D/g, '');
  if (d.length === 11 && d[0] === '1') {
    return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  }
  if (d.length === 10) {
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }
  return phone;
}

function displayDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export default function SearchResultCards({ results, onCall, onSkip }: Props) {
  const withPhone = results.filter((r) => r.phone_numbers.length > 0);
  const display = (withPhone.length > 0 ? withPhone : results).slice(0, 4);

  return (
    <View className="gap-2">
      <View className="gap-1.5">
        {display.map((result, i) => {
          const phone = result.phone_numbers[0] ?? null;
          const snippet = result.snippet ? cleanSnippet(result.snippet) : '';
          const domain = result.url ? displayDomain(result.url) : '';

          return (
            <Animated.View
              key={result.url ?? `result-${i}`}
              entering={FadeInDown.delay(i * 50).duration(250)}
              className="flex-row items-center gap-2.5 rounded-xl bg-white border border-gray-100 pl-2.5 pr-2 py-2"
              style={shadows.soft}
            >
              <BizIcon url={result.url} title={result.title || 'Untitled'} />

              <View className="flex-1 min-w-0">
                <View className="flex-row items-center gap-1.5">
                  <Text
                    numberOfLines={1}
                    style={{ fontFamily: fonts.medium, fontSize: 13, color: colors.gray900, flex: 1 }}
                  >
                    {result.title || 'Untitled'}
                  </Text>
                  {domain ? (
                    <Pressable
                      onPress={() => result.url && Linking.openURL(result.url)}
                      className="flex-row items-center gap-0.5"
                    >
                      <Globe size={9} color={colors.gray300} />
                    </Pressable>
                  ) : null}
                </View>
                {snippet ? (
                  <Text
                    numberOfLines={1}
                    className="mt-0.5"
                    style={{ fontFamily: fonts.regular, fontSize: 11.5, color: colors.gray400, lineHeight: 16 }}
                  >
                    {snippet}
                  </Text>
                ) : null}
                {phone ? (
                  <Text
                    className="mt-0.5"
                    style={{
                      fontFamily: fonts.regular,
                      fontSize: 11,
                      color: colors.gray400,
                      fontVariant: ['tabular-nums'],
                    }}
                  >
                    {formatPhone(phone)}
                  </Text>
                ) : null}
              </View>

              {phone && (
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    onCall(result, phone);
                  }}
                  className="flex-row items-center gap-1 rounded-lg bg-gray-900 pl-2.5 pr-3 py-1.5"
                >
                  <Phone size={10} strokeWidth={2.5} color="#fff" />
                  <Text style={{ fontFamily: fonts.medium, fontSize: 11.5, color: '#fff' }}>
                    Call
                  </Text>
                </Pressable>
              )}
            </Animated.View>
          );
        })}
      </View>

      <Animated.View entering={FadeIn.delay(display.length * 50 + 80).duration(250)}>
        <Pressable
          onPress={onSkip}
          className="flex-row items-center gap-1 self-center pt-0.5 pb-1"
        >
          <Text style={{ fontFamily: fonts.regular, fontSize: 11, color: colors.gray400 }}>
            I have my own number
          </Text>
          <ArrowRight size={10} color={colors.gray400} />
        </Pressable>
      </Animated.View>
    </View>
  );
}
