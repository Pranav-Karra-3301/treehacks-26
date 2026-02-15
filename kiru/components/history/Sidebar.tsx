import { useEffect, useCallback, useMemo } from 'react';
import { View, Text, Pressable, FlatList, ActivityIndicator } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { TaskSummary } from '../../lib/types';
import { colors, fonts } from '../../lib/theme';
import TaskRow from './TaskRow';

type SectionHeader = { _type: 'header'; title: string };
type FlatDataItem = TaskSummary | SectionHeader;

const SIDEBAR_WIDTH = 280;
const ANIM_DURATION = 250;

type Props = {
  open: boolean;
  onClose: () => void;
  tasks: TaskSummary[];
  loading: boolean;
  onSelectTask: (taskId: string) => void;
};

function groupByDate(tasks: TaskSummary[]): { title: string; data: TaskSummary[] }[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);

  const groups: { title: string; data: TaskSummary[] }[] = [];
  const todayTasks: TaskSummary[] = [];
  const yesterdayTasks: TaskSummary[] = [];
  const olderTasks: TaskSummary[] = [];

  for (const task of tasks) {
    const d = new Date(task.created_at);
    if (d >= today) todayTasks.push(task);
    else if (d >= yesterday) yesterdayTasks.push(task);
    else olderTasks.push(task);
  }

  if (todayTasks.length) groups.push({ title: 'Today', data: todayTasks });
  if (yesterdayTasks.length) groups.push({ title: 'Yesterday', data: yesterdayTasks });
  if (olderTasks.length) groups.push({ title: 'Older', data: olderTasks });

  return groups;
}

export default function Sidebar({ open, onClose, tasks, loading, onSelectTask }: Props) {
  const insets = useSafeAreaInsets();
  const translateX = useSharedValue(-SIDEBAR_WIDTH);
  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    if (open) {
      translateX.value = withTiming(0, { duration: ANIM_DURATION });
      backdropOpacity.value = withTiming(1, { duration: ANIM_DURATION });
    } else {
      translateX.value = withTiming(-SIDEBAR_WIDTH, { duration: ANIM_DURATION });
      backdropOpacity.value = withTiming(0, { duration: ANIM_DURATION });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const sidebarStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
    pointerEvents: backdropOpacity.value > 0.01 ? 'auto' as const : 'none' as const,
  }));

  const panGesture = Gesture.Pan()
    .activeOffsetX(-10)
    .onUpdate((e) => {
      const next = Math.min(0, e.translationX);
      translateX.value = next;
      backdropOpacity.value = 1 + next / SIDEBAR_WIDTH;
    })
    .onEnd((e) => {
      if (e.translationX < -60 || e.velocityX < -400) {
        translateX.value = withTiming(-SIDEBAR_WIDTH, { duration: 200 });
        backdropOpacity.value = withTiming(0, { duration: 200 });
        runOnJS(onClose)();
      } else {
        translateX.value = withTiming(0, { duration: 200 });
        backdropOpacity.value = withTiming(1, { duration: 200 });
      }
    });

  const flatData = useMemo(() => {
    const groups = groupByDate(tasks);
    const data: FlatDataItem[] = [];
    for (const group of groups) {
      data.push({ _type: 'header', title: group.title });
      for (const task of group.data) data.push(task);
    }
    return data;
  }, [tasks]);

  const renderItem = useCallback(
    ({ item }: { item: TaskSummary }) => (
      <TaskRow
        task={item}
        onPress={() => {
          onSelectTask(item.id);
          onClose();
        }}
      />
    ),
    [onSelectTask, onClose],
  );

  return (
    <>
      {/* Backdrop */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.25)',
            zIndex: 50,
          },
          backdropStyle,
        ]}
      >
        <Pressable
          style={{ flex: 1 }}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close sidebar"
        />
      </Animated.View>

      {/* Sidebar Panel */}
      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: 0,
              left: 0,
              bottom: 0,
              width: SIDEBAR_WIDTH,
              backgroundColor: colors.sidebarBg,
              zIndex: 51,
            },
            sidebarStyle,
          ]}
        >
          {/* Sidebar Header */}
          <View
            style={{
              paddingTop: insets.top + 16,
              paddingHorizontal: 20,
              paddingBottom: 16,
              borderBottomWidth: 0.5,
              borderBottomColor: 'rgba(0,0,0,0.06)',
            }}
          >
            <Text style={{ fontFamily: fonts.serifItalic, fontSize: 22, color: colors.gray950 }}>
              kiru
            </Text>
          </View>

          {/* Task List */}
          {loading ? (
            <ActivityIndicator color={colors.gray400} style={{ marginTop: 32 }} />
          ) : tasks.length === 0 ? (
            <Text
              style={{
                fontFamily: fonts.regular,
                fontSize: 13,
                color: colors.gray400,
                textAlign: 'center',
                paddingTop: 40,
              }}
            >
              No past negotiations
            </Text>
          ) : (
            <FlatList<FlatDataItem>
              data={flatData}
              keyExtractor={(item) => ('_type' in item ? `h-${item.title}` : item.id)}
              renderItem={({ item }) => {
                if ('_type' in item) {
                  return (
                    <Text
                      style={{
                        fontFamily: fonts.semibold,
                        fontSize: 11,
                        color: colors.gray400,
                        textTransform: 'uppercase',
                        letterSpacing: 0.8,
                        paddingHorizontal: 20,
                        paddingTop: 20,
                        paddingBottom: 6,
                      }}
                    >
                      {item.title}
                    </Text>
                  );
                }
                return renderItem({ item });
              }}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
            />
          )}
        </Animated.View>
      </GestureDetector>
    </>
  );
}
