import { memo } from 'react';
import { View, Text, Pressable } from 'react-native';
import type { TaskSummary, CallOutcome } from '../../lib/types';
import { colors, fonts } from '../../lib/theme';

const outcomeBadge: Record<CallOutcome, { bg: string; fg: string }> = {
  success: { bg: colors.emerald50, fg: colors.emerald600 },
  partial: { bg: colors.amber50, fg: colors.amber700 },
  failed: { bg: colors.red50, fg: colors.red600 },
  walkaway: { bg: colors.red50, fg: colors.red600 },
  unknown: { bg: colors.gray100, fg: colors.gray500 },
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

export default memo(function TaskRow({ task, onPress }: Props) {
  const badge = outcomeBadge[task.outcome] ?? outcomeBadge.unknown;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${task.objective || 'Untitled'}, ${task.outcome}, ${formatDate(task.created_at)}`}
      style={{
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderBottomWidth: 0.5,
        borderBottomColor: 'rgba(0,0,0,0.06)',
      }}
    >
      <Text
        numberOfLines={1}
        style={{ fontFamily: fonts.medium, fontSize: 13, color: colors.gray900 }}
      >
        {task.objective || 'Untitled'}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
        <View
          style={{
            borderRadius: 99,
            paddingHorizontal: 6,
            paddingVertical: 1,
            backgroundColor: badge.bg,
          }}
        >
          <Text style={{ fontFamily: fonts.medium, fontSize: 10, color: badge.fg }}>
            {task.outcome}
          </Text>
        </View>
        <Text style={{ fontFamily: fonts.regular, fontSize: 11, color: colors.gray400 }}>
          {formatDate(task.created_at)}
        </Text>
      </View>
    </Pressable>
  );
});
