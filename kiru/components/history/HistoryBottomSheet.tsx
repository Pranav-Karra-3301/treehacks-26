import { useCallback, useMemo, useState, forwardRef } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { BottomSheetModal, BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { ArrowLeft } from 'lucide-react-native';
import { listTasks, getTaskAnalysis } from '../../lib/api';
import type { TaskSummary, AnalysisPayload } from '../../lib/types';
import { colors, fonts } from '../../lib/theme';
import TaskRow from './TaskRow';
import AnalysisCard from '../analysis/AnalysisCard';
import AudioPlayer from '../audio/AudioPlayer';

type Props = {
  onLoadChat: (taskId: string) => void;
};

const HistoryBottomSheet = forwardRef<BottomSheetModal, Props>(({ onLoadChat }, ref) => {
  const snapPoints = useMemo(() => ['70%', '90%'], []);
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisPayload | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listTasks();
      setTasks(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSheetChange = useCallback(
    (index: number) => {
      if (index >= 0) {
        fetchTasks();
        setSelectedTask(null);
        setAnalysis(null);
      }
    },
    [fetchTasks],
  );

  const selectTask = useCallback(async (id: string) => {
    setSelectedTask(id);
    setAnalysis(null);
    setAnalysisLoading(true);
    try {
      const data = await getTaskAnalysis(id);
      setAnalysis(data);
    } catch {
      // no analysis
    } finally {
      setAnalysisLoading(false);
    }
  }, []);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.3} />
    ),
    [],
  );

  return (
    <BottomSheetModal
      ref={ref}
      snapPoints={snapPoints}
      onChange={handleSheetChange}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: colors.white, borderRadius: 20 }}
      handleIndicatorStyle={{ backgroundColor: colors.gray300, width: 36 }}
    >
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 pb-3 border-b border-gray-100">
        <View className="flex-row items-center gap-2">
          {selectedTask && (
            <Pressable
              onPress={() => {
                setSelectedTask(null);
                setAnalysis(null);
              }}
              className="h-7 w-7 items-center justify-center rounded-lg"
            >
              <ArrowLeft size={14} color={colors.gray400} />
            </Pressable>
          )}
          <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: colors.gray900 }}>
            {selectedTask ? 'Negotiation Detail' : 'History'}
          </Text>
        </View>
      </View>

      <BottomSheetScrollView contentContainerStyle={{ padding: 20 }}>
        {!selectedTask ? (
          loading ? (
            <ActivityIndicator color={colors.gray400} style={{ marginTop: 32 }} />
          ) : tasks.length === 0 ? (
            <Text
              className="text-center py-8"
              style={{ fontFamily: fonts.regular, fontSize: 13, color: colors.gray400 }}
            >
              No past negotiations
            </Text>
          ) : (
            <View className="gap-2">
              {tasks.map((t) => (
                <TaskRow key={t.id} task={t} onPress={() => selectTask(t.id)} />
              ))}
            </View>
          )
        ) : (
          <View className="gap-4">
            {analysisLoading ? (
              <ActivityIndicator color={colors.gray400} style={{ marginTop: 32 }} />
            ) : analysis ? (
              <>
                <AnalysisCard analysis={analysis} />
                <AudioPlayer taskId={selectedTask} />
                <Pressable
                  onPress={() => {
                    onLoadChat(selectedTask);
                    if (ref && typeof ref === 'object' && 'current' in ref) {
                      ref.current?.dismiss();
                    }
                  }}
                  className="rounded-xl bg-gray-900 py-3 items-center mt-2"
                >
                  <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: '#fff' }}>
                    View full conversation
                  </Text>
                </Pressable>
              </>
            ) : (
              <Text
                className="text-center py-8"
                style={{ fontFamily: fonts.regular, fontSize: 13, color: colors.gray400 }}
              >
                No analysis available
              </Text>
            )}
          </View>
        )}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
});

HistoryBottomSheet.displayName = 'HistoryBottomSheet';
export default HistoryBottomSheet;
