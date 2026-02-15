import { Component } from 'react';
import { View, Text, Pressable } from 'react-native';
import { colors, fonts } from '../lib/theme';

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
};

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  private handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.bg,
            paddingHorizontal: 32,
          }}
        >
          <Text
            style={{
              fontFamily: fonts.semibold,
              fontSize: 17,
              color: colors.gray900,
              marginBottom: 8,
            }}
          >
            Something went wrong
          </Text>
          <Text
            style={{
              fontFamily: fonts.regular,
              fontSize: 14,
              color: colors.gray500,
              textAlign: 'center',
              marginBottom: 24,
            }}
          >
            An unexpected error occurred. Please try again.
          </Text>
          <Pressable
            onPress={this.handleRetry}
            accessibilityRole="button"
            accessibilityLabel="Try again"
            style={{
              borderRadius: 99,
              backgroundColor: colors.gray900,
              paddingHorizontal: 24,
              paddingVertical: 12,
            }}
          >
            <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: '#fff' }}>
              Try again
            </Text>
          </Pressable>
        </View>
      );
    }

    return this.props.children;
  }
}
