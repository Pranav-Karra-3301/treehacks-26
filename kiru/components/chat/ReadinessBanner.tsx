import { View, Text } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { AlertTriangle } from 'lucide-react-native';
import { colors, fonts } from '../../lib/theme';

type Props = {
  warning: string;
};

export default function ReadinessBanner({ warning }: Props) {
  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      className="flex-row items-center justify-center gap-2 bg-amber-50 border-b border-amber-100 px-4 py-2"
    >
      <AlertTriangle size={13} color={colors.amber500} />
      <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: colors.amber700 }}>
        {warning} — calls may run in dry-run mode
      </Text>
    </Animated.View>
  );
}
