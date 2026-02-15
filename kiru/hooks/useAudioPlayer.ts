import { useState, useRef, useCallback, useEffect } from 'react';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';

type AudioState = {
  playing: boolean;
  duration: number;
  position: number;
  error: boolean;
};

export function useAudioPlayer(uri: string) {
  const soundRef = useRef<Audio.Sound | null>(null);
  const playingRef = useRef(false);
  const loadingRef = useRef(false);
  const localUriRef = useRef<string | null>(null);
  const [state, setState] = useState<AudioState>({
    playing: false,
    duration: 0,
    position: 0,
    error: false,
  });

  useEffect(() => {
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    }).catch((e) => console.warn('[AudioPlayer] setAudioModeAsync failed:', e));

    return () => {
      soundRef.current?.unloadAsync();
      // Clean up temp file
      if (localUriRef.current) {
        FileSystem.deleteAsync(localUriRef.current, { idempotent: true }).catch(() => {});
      }
    };
  }, []);

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      console.log('[AudioPlayer] Downloading audio from:', uri);

      // Download with ngrok-skip-browser-warning header to bypass interstitial
      const localPath = `${FileSystem.cacheDirectory}audio_${Date.now()}.wav`;
      const result = await FileSystem.downloadAsync(uri, localPath, {
        headers: {
          'ngrok-skip-browser-warning': '1',
          'Accept': 'audio/wav, audio/*',
        },
      });

      if (result.status !== 200) {
        console.warn('[AudioPlayer] Download failed, status:', result.status);
        setState((prev) => ({ ...prev, error: true }));
        return;
      }

      // Clean up previous temp file
      if (localUriRef.current && localUriRef.current !== result.uri) {
        FileSystem.deleteAsync(localUriRef.current, { idempotent: true }).catch(() => {});
      }
      localUriRef.current = result.uri;

      console.log('[AudioPlayer] Downloaded to:', result.uri);

      const { sound } = await Audio.Sound.createAsync(
        { uri: result.uri },
        { shouldPlay: false, progressUpdateIntervalMillis: 250 },
        (status) => {
          if (!status.isLoaded) return;
          playingRef.current = status.isPlaying;
          setState((prev) => ({
            ...prev,
            playing: status.isPlaying,
            duration: (status.durationMillis ?? 0) / 1000,
            position: (status.positionMillis ?? 0) / 1000,
          }));
          if (status.didJustFinish) {
            playingRef.current = false;
            setState((prev) => ({ ...prev, playing: false, position: 0 }));
          }
        },
      );
      soundRef.current = sound;
      setState((prev) => ({ ...prev, error: false }));
      console.log('[AudioPlayer] Sound loaded successfully');
    } catch (e) {
      console.warn('[AudioPlayer] Load error:', e);
      setState((prev) => ({ ...prev, error: true }));
    } finally {
      loadingRef.current = false;
    }
  }, [uri]);

  useEffect(() => {
    load();
  }, [load]);

  const togglePlay = useCallback(async () => {
    console.log('[AudioPlayer] togglePlay called, playing:', playingRef.current);
    let sound = soundRef.current;
    if (!sound) {
      console.log('[AudioPlayer] No sound ref, attempting reload...');
      try {
        await load();
        sound = soundRef.current;
      } catch {
        return;
      }
    }
    if (!sound) {
      console.warn('[AudioPlayer] Still no sound after reload');
      return;
    }

    try {
      const status = await sound.getStatusAsync();
      console.log('[AudioPlayer] Status:', JSON.stringify(status).slice(0, 200));
      if (!status.isLoaded) {
        console.log('[AudioPlayer] Sound not loaded, reloading...');
        await load();
        sound = soundRef.current;
        if (!sound) return;
      }

      if (playingRef.current) {
        await sound.pauseAsync();
        console.log('[AudioPlayer] Paused');
      } else {
        if (status.isLoaded && status.positionMillis === status.durationMillis) {
          await sound.setPositionAsync(0);
        }
        await sound.playAsync();
        console.log('[AudioPlayer] Playing');
      }
    } catch (e) {
      console.warn('[AudioPlayer] Toggle error:', e);
      try {
        await load();
      } catch {
        // give up
      }
    }
  }, [load]);

  const seek = useCallback(
    async (seconds: number) => {
      const sound = soundRef.current;
      if (!sound) return;
      try {
        await sound.setPositionAsync(seconds * 1000);
      } catch {
        // ignore seek errors
      }
    },
    [],
  );

  return { ...state, togglePlay, seek };
}
