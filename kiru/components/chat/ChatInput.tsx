import { View, TextInput, Pressable, Platform, KeyboardAvoidingView } from 'react-native';
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
      <View
        style={{
          backgroundColor: colors.bg,
          borderTopWidth: 0.5,
          borderTopColor: 'rgba(0,0,0,0.06)',
          paddingHorizontal: 16,
          paddingVertical: 12,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: 10,
            borderRadius: 22,
            borderWidth: 1,
            borderColor: colors.gray200,
            backgroundColor: colors.white,
            paddingHorizontal: 16,
            paddingVertical: 10,
            ...shadows.soft,
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
            style={{
              flex: 1,
              fontFamily: fonts.regular,
              fontSize: 15,
              color: disabled ? colors.gray400 : colors.gray900,
              maxHeight: 120,
              paddingTop: Platform.OS === 'ios' ? 2 : 0,
              paddingBottom: Platform.OS === 'ios' ? 2 : 0,
            }}
          />
          <Pressable
            onPress={handleSend}
            disabled={sendDisabled}
            style={{
              height: 28,
              width: 28,
              borderRadius: 14,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: sendDisabled ? colors.gray200 : colors.gray900,
            }}
          >
            <ArrowUp size={14} strokeWidth={2.5} color={sendDisabled ? colors.gray400 : '#fff'} />
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
