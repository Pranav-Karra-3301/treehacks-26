import { View, Text, Pressable } from 'react-native';
import type { TaskSummary, CallOutcome } from '../../lib/types';
import { colors, fonts } from '../../lib/theme';

const outcomeBadge: Record<CallOutcome, { bg: string; fg: string; border: string }> = {
  success: { bg: colors.emerald50, fg: colors.emerald600, border: '#d1fae5' },
  partial: { bg: colors.amber50, fg: colors.amber700, border: colors.amber100 },
  failed: { bg: colors.red50, fg: colors.red600, border: '#fecaca' },
  walkaway: { bg: colors.red50, fg: colors.red600, border: '#fecaca' },
  unknown: { bg: colors.gray100, fg: colors.gray500, border: colors.gray200 },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

type Props = {
  task: TaskSummary;
  onPress: () => void;
};

export default function TaskRow({ task, onPress }: Props) {
  const badge = outcomeBadge[task.outcome] ?? outcomeBadge.unknown;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: 20,
        paddingVertical: 12,
        marginHorizontal: 8,
        borderRadius: 10,
        backgroundColor: pressed ? colors.gray100 : 'transparent',
      })}
    >
      <Text
        numberOfLines={1}
        style={{ fontFamily: fonts.medium, fontSize: 14, color: colors.gray900 }}
      >
        {task.objective || 'Untitled'}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
        <View
          style={{
            borderRadius: 99,
            paddingHorizontal: 7,
            paddingVertical: 2,
            backgroundColor: badge.bg,
            borderWidth: 0.5,
            borderColor: badge.border,
          }}
        >
          <Text style={{ fontFamily: fonts.medium, fontSize: 10, color: badge.fg }}>
            {task.outcome}
          </Text>
        </View>
        <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: colors.gray400 }}>
          {formatDate(task.created_at)}
        </Text>
      </View>
    </Pressable>
  );
}
