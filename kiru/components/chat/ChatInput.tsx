import { View, TextInput, Pressable, Platform, KeyboardAvoidingView } from 'react-native';
import { ArrowUp } from 'lucide-react-native';
import { colors, fonts } from '../../lib/theme';
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
            borderColor: colors.gray200,
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
          <Pressable
            onPress={handleSend}
            disabled={sendDisabled}
            style={{
              height: 30,
              width: 30,
              borderRadius: 15,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: sendDisabled ? colors.gray200 : colors.gray900,
              marginBottom: 1,
            }}
          >
            <ArrowUp size={15} strokeWidth={2.5} color={sendDisabled ? colors.gray400 : '#fff'} />
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
