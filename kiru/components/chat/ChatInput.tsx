import { useState, useCallback } from 'react';
import { View, TextInput, Pressable, Platform, KeyboardAvoidingView } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { ArrowUp } from 'lucide-react-native';
import { colors, fonts } from '../../lib/theme';
import * as Haptics from 'expo-haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  placeholder: string;
  disabled: boolean;
  sendDisabled: boolean;
};

export default function ChatInput({
  value,
  onChangeText,
  onSend,
  placeholder,
  disabled,
  sendDisabled,
}: Props) {
  const [focused, setFocused] = useState(false);
  const sendScale = useSharedValue(1);

  const sendAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: sendScale.value }],
  }));

  const handleSend = useCallback(() => {
    if (sendDisabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSend();
  }, [sendDisabled, onSend]);

  const onPressIn = useCallback(() => {
    sendScale.value = withSpring(0.85, { damping: 15, stiffness: 300 });
  }, [sendScale]);

  const onPressOut = useCallback(() => {
    sendScale.value = withSpring(1, { damping: 12, stiffness: 200 });
  }, [sendScale]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <View
        style={{
          backgroundColor: colors.bg,
          borderTopWidth: 0.5,
          borderTopColor: 'rgba(0,0,0,0.06)',
          paddingHorizontal: 16,
          paddingTop: 10,
          paddingBottom: 8,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: 10,
            borderRadius: 22,
            borderWidth: 1,
            borderColor: focused ? colors.gray300 : colors.gray200,
            backgroundColor: colors.white,
            paddingHorizontal: 14,
            paddingVertical: 8,
          }}
        >
          <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={colors.gray400}
            editable={!disabled}
            multiline
            maxLength={1000}
            returnKeyType="send"
            blurOnSubmit={false}
            onSubmitEditing={handleSend}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            accessibilityLabel="Message input"
            accessibilityHint={placeholder}
            style={{
              flex: 1,
              fontFamily: fonts.regular,
              fontSize: 16,
              lineHeight: 22,
              color: disabled ? colors.gray400 : colors.gray900,
              minHeight: 28,
              maxHeight: 120,
              paddingTop: Platform.OS === 'ios' ? 4 : 2,
              paddingBottom: Platform.OS === 'ios' ? 4 : 2,
            }}
          />
          <AnimatedPressable
            onPress={handleSend}
            onPressIn={onPressIn}
            onPressOut={onPressOut}
            disabled={sendDisabled}
            accessibilityRole="button"
            accessibilityLabel="Send message"
            accessibilityState={{ disabled: sendDisabled }}
            style={[
              {
                height: 30,
                width: 30,
                borderRadius: 15,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: sendDisabled ? colors.gray200 : colors.gray900,
                marginBottom: 1,
              },
              sendAnimStyle,
            ]}
          >
            <ArrowUp size={15} strokeWidth={2.5} color={sendDisabled ? colors.gray400 : '#fff'} />
          </AnimatedPressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
