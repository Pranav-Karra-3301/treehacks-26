// Must be imported BEFORE global.css / NativeWind to suppress warnings
// from react-native-css-interop accessing deprecated RN SafeAreaView.
const origWarn = console.warn;
console.warn = (...args: unknown[]) => {
  if (
    typeof args[0] === 'string' &&
    args[0].includes('SafeAreaView has been deprecated')
  ) {
    return;
  }
  origWarn.apply(console, args);
};
