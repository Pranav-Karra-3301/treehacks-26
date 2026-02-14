import { View, Text, Pressable } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import type { TaskSummary, CallOutcome } from '../../lib/types';
import { colors, fonts, shadows } from '../../lib/theme';

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
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
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
      className="rounded-xl border border-gray-100 bg-white px-4 py-3"
      style={shadows.soft}
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 min-w-0">
          <Text
            numberOfLines={1}
            style={{ fontFamily: fonts.medium, fontSize: 13, color: colors.gray900 }}
          >
            {task.objective || 'Untitled'}
          </Text>
          <View className="flex-row items-center gap-2 mt-1">
            <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: badge.bg }}>
              <Text style={{ fontFamily: fonts.medium, fontSize: 10, color: badge.fg }}>
                {task.outcome}
              </Text>
            </View>
            {task.duration_seconds > 0 && (
              <Text style={{ fontFamily: fonts.regular, fontSize: 11, color: colors.gray400 }}>
                {formatDuration(task.duration_seconds)}
              </Text>
            )}
            <Text style={{ fontFamily: fonts.regular, fontSize: 11, color: colors.gray400 }}>
              {formatDate(task.created_at)}
            </Text>
          </View>
        </View>
        <ChevronRight size={14} color={colors.gray300} style={{ marginTop: 4 }} />
      </View>
    </Pressable>
  );
}
