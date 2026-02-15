import { useEffect, useCallback } from 'react';
import { View, Text, Pressable, FlatList, ActivityIndicator } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Plus } from 'lucide-react-native';
import type { TaskSummary } from '../../lib/types';
import { colors, fonts } from '../../lib/theme';
import TaskRow from './TaskRow';

const SIDEBAR_WIDTH = 300;

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
  const translateX = useSharedValue(-SIDEBAR_WIDTH);
  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    if (open) {
      translateX.value = withSpring(0, { damping: 25, stiffness: 200 });
      backdropOpacity.value = withTiming(1, { duration: 250 });
    } else {
      translateX.value = withSpring(-SIDEBAR_WIDTH, { damping: 25, stiffness: 200 });
      backdropOpacity.value = withTiming(0, { duration: 200 });
    }
  }, [open, translateX, backdropOpacity]);

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
        translateX.value = withSpring(-SIDEBAR_WIDTH, { damping: 25, stiffness: 200 });
        backdropOpacity.value = withTiming(0, { duration: 200 });
        runOnJS(onClose)();
      } else {
        translateX.value = withSpring(0, { damping: 25, stiffness: 200 });
        backdropOpacity.value = withTiming(1, { duration: 200 });
      }
    });

  const groups = groupByDate(tasks);

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

  const flatData: (TaskSummary | { _header: string })[] = [];
  for (const group of groups) {
    flatData.push({ _header: group.title } as any);
    for (const task of group.data) flatData.push(task);
  }

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
            backgroundColor: 'rgba(0,0,0,0.3)',
            zIndex: 50,
          },
          backdropStyle,
        ]}
      >
        <Pressable style={{ flex: 1 }} onPress={onClose} />
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
              backgroundColor: colors.white,
              zIndex: 51,
              borderRightWidth: 0.5,
              borderRightColor: 'rgba(0,0,0,0.06)',
            },
            sidebarStyle,
          ]}
        >
          {/* Sidebar Header */}
          <View
            style={{
              paddingTop: 64,
              paddingHorizontal: 20,
              paddingBottom: 16,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text style={{ fontFamily: fonts.serifBoldItalic, fontSize: 26, color: colors.gray950, letterSpacing: -0.5 }}>
              kiru
            </Text>
            <Pressable
              onPress={onClose}
              style={{
                height: 32,
                width: 32,
                borderRadius: 8,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.gray100,
              }}
              hitSlop={4}
            >
              <Plus size={16} color={colors.gray500} style={{ transform: [{ rotate: '45deg' }] }} />
            </Pressable>
          </View>

          {/* Task List */}
          {loading ? (
            <ActivityIndicator color={colors.gray400} style={{ marginTop: 32 }} />
          ) : tasks.length === 0 ? (
            <View style={{ paddingTop: 60, alignItems: 'center' }}>
              <Text
                style={{
                  fontFamily: fonts.regular,
                  fontSize: 14,
                  color: colors.gray400,
                  textAlign: 'center',
                }}
              >
                No past negotiations
              </Text>
            </View>
          ) : (
            <FlatList
              data={flatData}
              keyExtractor={(item, i) => ('_header' in item ? `h-${i}` : (item as TaskSummary).id)}
              renderItem={({ item }) => {
                if ('_header' in item) {
                  return (
                    <Text
                      style={{
                        fontFamily: fonts.semibold,
                        fontSize: 11,
                        color: colors.gray400,
                        textTransform: 'uppercase',
                        letterSpacing: 0.8,
                        paddingHorizontal: 20,
                        paddingTop: 24,
                        paddingBottom: 8,
                      }}
                    >
                      {(item as any)._header}
                    </Text>
                  );
                }
                return renderItem({ item: item as TaskSummary });
              }}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 40 }}
            />
          )}
        </Animated.View>
      </GestureDetector>
    </>
  );
}
