import { View, Text, Pressable, Linking } from 'react-native';
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
    <View style={{ gap: 8 }}>
      <View style={{ gap: 8 }}>
        {display.map((result, i) => {
          const phone = result.phone_numbers[0] ?? null;
          const snippet = result.snippet ? cleanSnippet(result.snippet) : '';
          const domain = result.url ? displayDomain(result.url) : '';

          return (
            <View
              key={result.url ?? `result-${i}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                borderRadius: 16,
                backgroundColor: colors.white,
                borderWidth: 0.5,
                borderColor: 'rgba(0,0,0,0.06)',
                paddingLeft: 12,
                paddingRight: 10,
                paddingVertical: 10,
                ...shadows.soft,
              }}
            >
              <BizIcon url={result.url} title={result.title || 'Untitled'} />

              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text
                    numberOfLines={1}
                    style={{ fontFamily: fonts.medium, fontSize: 14, color: colors.gray900, flex: 1 }}
                  >
                    {result.title || 'Untitled'}
                  </Text>
                  {domain ? (
                    <Pressable
                      onPress={() => result.url && Linking.openURL(result.url)}
                      hitSlop={8}
                    >
                      <Globe size={11} color={colors.gray300} />
                    </Pressable>
                  ) : null}
                </View>
                {snippet ? (
                  <Text
                    numberOfLines={1}
                    style={{ fontFamily: fonts.regular, fontSize: 12, color: colors.gray400, lineHeight: 17, marginTop: 2 }}
                  >
                    {snippet}
                  </Text>
                ) : null}
                {phone ? (
                  <Text
                    style={{
                      fontFamily: fonts.regular,
                      fontSize: 11.5,
                      color: colors.gray400,
                      fontVariant: ['tabular-nums'],
                      marginTop: 3,
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
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 5,
                    borderRadius: 99,
                    backgroundColor: colors.gray950,
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    opacity: pressed ? 0.8 : 1,
                  })}
                >
                  <Phone size={11} strokeWidth={2.5} color="#fff" />
                  <Text style={{ fontFamily: fonts.medium, fontSize: 12, color: '#fff' }}>
                    Call
                  </Text>
                </Pressable>
              )}
            </View>
          );
        })}
      </View>

      <Pressable
        onPress={onSkip}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          alignSelf: 'center',
          paddingVertical: 6,
        }}
      >
        <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: colors.gray400 }}>
          I have my own number
        </Text>
        <ArrowRight size={11} color={colors.gray400} />
      </Pressable>
    </View>
  );
}
