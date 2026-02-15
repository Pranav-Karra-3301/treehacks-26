import { useState, useRef, useCallback, useEffect } from 'react';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';

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
  const mountedRef = useRef(true);
  const [state, setState] = useState<AudioState>({
    playing: false,
    duration: 0,
    position: 0,
    error: false,
  });

  useEffect(() => {
    mountedRef.current = true;
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    }).catch(() => {});

    return () => {
      mountedRef.current = false;
      soundRef.current?.unloadAsync();
      if (localUriRef.current) {
        FileSystem.deleteAsync(localUriRef.current, { idempotent: true }).catch(() => {});
      }
    };
  }, []);

  const load = useCallback(async () => {
    if (loadingRef.current || !mountedRef.current) return;
    loadingRef.current = true;
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }

      const localPath = `${FileSystem.cacheDirectory}audio_${Date.now()}.wav`;
      const result = await FileSystem.downloadAsync(uri, localPath, {
        headers: {
          'ngrok-skip-browser-warning': '1',
          'Accept': 'audio/wav, audio/*',
        },
      });

      if (!mountedRef.current) return;

      if (result.status !== 200) {
        setState((prev) => ({ ...prev, error: true }));
        return;
      }

      // Clean up previous temp file
      if (localUriRef.current && localUriRef.current !== result.uri) {
        FileSystem.deleteAsync(localUriRef.current, { idempotent: true }).catch(() => {});
      }
      localUriRef.current = result.uri;

      const { sound } = await Audio.Sound.createAsync(
        { uri: result.uri },
        { shouldPlay: false, progressUpdateIntervalMillis: 250 },
        (status) => {
          if (!mountedRef.current || !status.isLoaded) return;
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

      if (!mountedRef.current) {
        sound.unloadAsync();
        return;
      }

      soundRef.current = sound;
      setState((prev) => ({ ...prev, error: false }));
    } catch {
      if (mountedRef.current) {
        setState((prev) => ({ ...prev, error: true }));
      }
    } finally {
      loadingRef.current = false;
    }
  }, [uri]);

  useEffect(() => {
    load();
  }, [load]);

  const togglePlay = useCallback(async () => {
    let sound = soundRef.current;
    if (!sound) {
      try {
        await load();
        sound = soundRef.current;
      } catch {
        return;
      }
    }
    if (!sound) return;

    try {
      const status = await sound.getStatusAsync();
      if (!status.isLoaded) {
        await load();
        sound = soundRef.current;
        if (!sound) return;
      }

      if (playingRef.current) {
        await sound.pauseAsync();
      } else {
        if (status.isLoaded && status.positionMillis === status.durationMillis) {
          await sound.setPositionAsync(0);
        }
        await sound.playAsync();
      }
    } catch {
      try {
        await load();
      } catch {
        // give up
      }
    }
  }, [load]);

  const seek = useCallback(async (seconds: number) => {
    const sound = soundRef.current;
    if (!sound) return;
    try {
      await sound.setPositionAsync(seconds * 1000);
    } catch {
      // ignore seek errors on unloaded sound
    }
  }, []);

  return { ...state, togglePlay, seek };
}
