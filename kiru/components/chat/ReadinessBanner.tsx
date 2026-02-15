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
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        backgroundColor: colors.amber50,
        borderBottomWidth: 0.5,
        borderBottomColor: colors.amber100,
        paddingHorizontal: 16,
        paddingVertical: 6,
      }}
    >
      <AlertTriangle size={12} color={colors.amber500} />
      <Text style={{ fontFamily: fonts.regular, fontSize: 11, color: colors.amber700 }}>
        {warning} — calls may run in dry-run mode
      </Text>
    </Animated.View>
  );
}
