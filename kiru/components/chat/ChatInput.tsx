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
          backgroundColor: colors.white,
          borderTopWidth: 0.5,
          borderTopColor: 'rgba(0,0,0,0.06)',
          paddingHorizontal: 16,
          paddingTop: 10,
          paddingBottom: 10,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: 10,
            borderRadius: 24,
            borderWidth: 1,
            borderColor: disabled ? colors.gray100 : colors.gray200,
            backgroundColor: colors.gray50,
            paddingHorizontal: 16,
            paddingVertical: 10,
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
              lineHeight: 21,
              color: disabled ? colors.gray400 : colors.gray900,
              minHeight: 24,
              maxHeight: 120,
              paddingTop: Platform.OS === 'ios' ? 2 : 0,
              paddingBottom: Platform.OS === 'ios' ? 2 : 0,
            }}
          />
          <Pressable
            onPress={handleSend}
            disabled={sendDisabled}
            style={{
              height: 32,
              width: 32,
              borderRadius: 16,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: sendDisabled ? colors.gray200 : colors.gray900,
            }}
          >
            <ArrowUp size={16} strokeWidth={2.5} color={sendDisabled ? colors.gray400 : '#fff'} />
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
