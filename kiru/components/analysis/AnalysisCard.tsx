import { View, Text } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Target, Zap, ArrowUpRight, Lightbulb } from 'lucide-react-native';
import type { AnalysisPayload, CallOutcome } from '../../lib/types';
import { colors, fonts, shadows } from '../../lib/theme';
import ScoreRing from './ScoreRing';
import ExpandableSection from './ExpandableSection';

const outcomeConfig: Record<CallOutcome, { colors: [string, string]; label: string }> = {
  success: { colors: [colors.emerald500, colors.emerald600], label: 'Success' },
  partial: { colors: [colors.amber500, colors.orange500], label: 'Partial' },
  failed: { colors: [colors.red500, colors.red600], label: 'Failed' },
  walkaway: { colors: [colors.red400, colors.red500], label: 'Walk-away' },
  unknown: { colors: [colors.gray400, colors.gray500], label: 'Pending' },
};

function Section({
  icon: Icon,
  title,
  children,
  delay = 0,
}: {
  icon: typeof Target;
  title: string;
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <Animated.View entering={FadeInDown.delay(delay).duration(300)}>
      <View className="flex-row items-center gap-1.5 mb-2">
        <Icon size={12} color={colors.gray400} />
        <Text
          style={{
            fontFamily: fonts.semibold,
            fontSize: 11,
            color: colors.gray400,
            textTransform: 'uppercase',
            letterSpacing: 1,
          }}
        >
          {title}
        </Text>
      </View>
      {children}
    </Animated.View>
  );
}

export default function AnalysisCard({ analysis }: { analysis: AnalysisPayload }) {
  const outcome = outcomeConfig[analysis.outcome] ?? outcomeConfig.unknown;

  return (
    <Animated.View
      entering={FadeInDown.duration(500)}
      className="rounded-2xl bg-white border border-gray-100 overflow-hidden"
      style={shadows.soft}
    >
      {/* Hero section */}
      <View className="px-5 pt-5 pb-4">
        <View className="flex-row items-start gap-4">
          <ScoreRing score={analysis.score} />
          <View className="flex-1 pt-1">
            <View className="flex-row items-center gap-2 mb-1.5">
              <View
                className="rounded-full px-2.5 py-0.5"
                style={{ backgroundColor: outcome.colors[0] }}
              >
                <Text style={{ fontFamily: fonts.semibold, fontSize: 10.5, color: '#fff' }}>
                  {outcome.label}
                </Text>
              </View>
            </View>
            {analysis.summary ? (
              <Text
                className="text-gray-600 leading-relaxed"
                style={{ fontFamily: fonts.regular, fontSize: 13 }}
              >
                {analysis.summary}
              </Text>
            ) : (
              <Text
                className="text-gray-400"
                style={{ fontFamily: fonts.regular, fontSize: 13, fontStyle: 'italic' }}
              >
                No summary available
              </Text>
            )}
            {analysis.score_reasoning ? (
              <Text
                className="text-gray-400 mt-1.5 leading-relaxed"
                style={{ fontFamily: fonts.regular, fontSize: 11.5 }}
              >
                {analysis.score_reasoning}
              </Text>
            ) : null}
          </View>
        </View>
      </View>

      {/* Divider */}
      <View className="mx-5 h-px bg-gray-200/60" />

      {/* Details */}
      <View className="px-5 py-4 gap-4">
        {/* Tactics */}
        {analysis.tactics_used?.length > 0 && (
          <Section icon={Zap} title="Tactics" delay={100}>
            <View className="flex-row flex-wrap gap-1.5">
              {analysis.tactics_used.map((t, i) => {
                const eff = t.effectiveness?.toLowerCase();
                const bg =
                  eff === 'high' ? colors.emerald50 : eff === 'medium' ? colors.amber50 : colors.gray100;
                const fg =
                  eff === 'high' ? colors.emerald600 : eff === 'medium' ? colors.amber700 : colors.gray600;
                return (
                  <View
                    key={i}
                    className="rounded-lg border border-gray-100 px-2 py-1"
                    style={{ backgroundColor: bg }}
                  >
                    <Text style={{ fontFamily: fonts.medium, fontSize: 11, color: fg }}>
                      {t.name}
                    </Text>
                  </View>
                );
              })}
            </View>
          </Section>
        )}

        {/* Key Moments */}
        {analysis.key_moments?.length > 0 && (
          <Section icon={Target} title="Key Moments" delay={150}>
            <View className="gap-1.5">
              {analysis.key_moments.map((m, i) => (
                <View key={i} className="flex-row items-start gap-2">
                  <View className="mt-1.5 h-1 w-1 rounded-full bg-gray-300" />
                  <Text
                    className="flex-1 text-gray-600 leading-relaxed"
                    style={{ fontFamily: fonts.regular, fontSize: 12.5 }}
                  >
                    {m}
                  </Text>
                </View>
              ))}
            </View>
          </Section>
        )}

        {/* Concessions */}
        {analysis.concessions?.length > 0 && (
          <ExpandableSection icon={ArrowUpRight} title="Concessions" delay={200}>
            <View className="gap-2">
              {analysis.concessions.map((c, i) => (
                <View key={i} className="rounded-lg bg-gray-50 px-3 py-2">
                  <View className="flex-row items-center gap-1.5">
                    <Text
                      style={{
                        fontFamily: fonts.semibold,
                        fontSize: 11,
                        color: colors.gray500,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                      }}
                    >
                      {c.party}
                    </Text>
                    {c.significance ? (
                      <Text style={{ fontFamily: fonts.regular, fontSize: 10, color: colors.gray400 }}>
                        / {c.significance}
                      </Text>
                    ) : null}
                  </View>
                  <Text
                    className="text-gray-600 mt-0.5 leading-relaxed"
                    style={{ fontFamily: fonts.regular, fontSize: 12.5 }}
                  >
                    {c.description}
                  </Text>
                </View>
              ))}
            </View>
          </ExpandableSection>
        )}

        {/* Suggestions */}
        {analysis.improvement_suggestions?.length > 0 && (
          <ExpandableSection icon={Lightbulb} title="Next Time" delay={250}>
            <View className="gap-1.5">
              {analysis.improvement_suggestions.map((s, i) => (
                <View key={i} className="flex-row items-start gap-2">
                  <View className="mt-1.5 h-1 w-1 rounded-full bg-gray-300" />
                  <Text
                    className="flex-1 text-gray-600 leading-relaxed"
                    style={{ fontFamily: fonts.regular, fontSize: 12.5 }}
                  >
                    {s}
                  </Text>
                </View>
              ))}
            </View>
          </ExpandableSection>
        )}
      </View>
    </Animated.View>
  );
}
