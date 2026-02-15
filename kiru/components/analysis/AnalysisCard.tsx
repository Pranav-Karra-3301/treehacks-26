import { View, Text } from 'react-native';
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
}: {
  icon: typeof Target;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <Icon size={12} color={colors.gray400} />
        <Text
          style={{
            fontFamily: fonts.semibold,
            fontSize: 11,
            color: colors.gray400,
            textTransform: 'uppercase',
            letterSpacing: 0.8,
          }}
        >
          {title}
        </Text>
      </View>
      {children}
    </View>
  );
}

export default function AnalysisCard({ analysis }: { analysis: AnalysisPayload }) {
  const outcome = outcomeConfig[analysis.outcome] ?? outcomeConfig.unknown;

  return (
    <View
      style={{
        borderRadius: 16,
        backgroundColor: colors.white,
        borderWidth: 0.5,
        borderColor: 'rgba(0,0,0,0.06)',
        overflow: 'hidden',
      }}
    >
      {/* Hero section */}
      <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 16 }}>
          <View style={{ borderRadius: 12, backgroundColor: colors.gray50, padding: 8 }}>
            <ScoreRing score={analysis.score} />
          </View>
          <View style={{ flex: 1, paddingTop: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <View
                style={{
                  borderRadius: 99,
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                  backgroundColor: outcome.colors[0],
                }}
              >
                <Text style={{ fontFamily: fonts.semibold, fontSize: 10.5, color: '#fff' }}>
                  {outcome.label}
                </Text>
              </View>
            </View>
            {analysis.summary ? (
              <Text
                style={{ fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: colors.gray600 }}
              >
                {analysis.summary}
              </Text>
            ) : (
              <Text
                style={{ fontFamily: fonts.regular, fontSize: 13, color: colors.gray400, fontStyle: 'italic' }}
              >
                No summary available
              </Text>
            )}
            {analysis.score_reasoning ? (
              <Text
                style={{
                  fontFamily: fonts.regular,
                  fontSize: 11.5,
                  lineHeight: 16,
                  color: colors.gray400,
                  marginTop: 6,
                }}
              >
                {analysis.score_reasoning}
              </Text>
            ) : null}
          </View>
        </View>
      </View>

      {/* Divider */}
      <View style={{ marginHorizontal: 20, height: 0.5, backgroundColor: 'rgba(0,0,0,0.06)' }} />

      {/* Details */}
      <View style={{ paddingHorizontal: 20, paddingVertical: 16, gap: 16 }}>
        {/* Tactics */}
        {analysis.tactics_used?.length > 0 && (
          <Section icon={Zap} title="Tactics">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {analysis.tactics_used.map((t, i) => {
                const eff = t.effectiveness?.toLowerCase();
                const bg =
                  eff === 'high' ? colors.emerald50 : eff === 'medium' ? colors.amber50 : colors.gray100;
                const fg =
                  eff === 'high' ? colors.emerald600 : eff === 'medium' ? colors.amber700 : colors.gray600;
                return (
                  <View
                    key={i}
                    style={{
                      borderRadius: 8,
                      borderWidth: 0.5,
                      borderColor: 'rgba(0,0,0,0.04)',
                      backgroundColor: bg,
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                    }}
                  >
                    <Text style={{ fontFamily: fonts.medium, fontSize: 11.5, color: fg }}>
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
          <Section icon={Target} title="Key Moments">
            <View style={{ gap: 6 }}>
              {analysis.key_moments.map((m, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                  <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: colors.gray300, marginTop: 6 }} />
                  <Text
                    style={{ flex: 1, fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 18, color: colors.gray600 }}
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
          <ExpandableSection icon={ArrowUpRight} title="Concessions">
            <View style={{ gap: 8 }}>
              {analysis.concessions.map((c, i) => (
                <View key={i} style={{ borderRadius: 8, backgroundColor: colors.gray50, paddingHorizontal: 12, paddingVertical: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text
                      style={{
                        fontFamily: fonts.semibold,
                        fontSize: 10.5,
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
                    style={{ fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 18, color: colors.gray600, marginTop: 2 }}
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
          <ExpandableSection icon={Lightbulb} title="Next Time">
            <View style={{ gap: 6 }}>
              {analysis.improvement_suggestions.map((s, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                  <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: colors.gray300, marginTop: 6 }} />
                  <Text
                    style={{ flex: 1, fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 18, color: colors.gray600 }}
                  >
                    {s}
                  </Text>
                </View>
              ))}
            </View>
          </ExpandableSection>
        )}
      </View>
    </View>
  );
}
