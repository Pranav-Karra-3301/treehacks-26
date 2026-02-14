import { View, TextInput, Pressable, Platform, KeyboardAvoidingView } from 'react-native';
import { BlurView } from 'expo-blur';
import { ArrowUp } from 'lucide-react-native';
import { colors, fonts, shadows } from '../../lib/theme';
import * as Haptics from 'expo-haptics';

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
  const handleSend = () => {
    if (sendDisabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSend();
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <BlurView intensity={80} tint="light" className="border-t border-gray-200/60 px-5 py-3.5">
        <View
          className="flex-row items-end gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-2.5"
          style={shadows.soft}
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
            style={{
              flex: 1,
              fontFamily: fonts.regular,
              fontSize: 14,
              color: disabled ? colors.gray400 : colors.gray900,
              maxHeight: 120,
              paddingTop: Platform.OS === 'ios' ? 2 : 0,
              paddingBottom: Platform.OS === 'ios' ? 2 : 0,
            }}
          />
          <Pressable
            onPress={handleSend}
            disabled={sendDisabled}
            className="h-8 w-8 rounded-full items-center justify-center"
            style={[
              shadows.soft,
              {
                backgroundColor: sendDisabled ? colors.gray200 : colors.gray900,
              },
            ]}
          >
            <ArrowUp size={15} strokeWidth={2.5} color={sendDisabled ? colors.gray400 : '#fff'} />
          </Pressable>
        </View>
      </BlurView>
    </KeyboardAvoidingView>
  );
}
