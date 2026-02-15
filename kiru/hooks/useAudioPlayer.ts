import { useState, useRef, useCallback, useEffect } from 'react';
import { Audio } from 'expo-av';

type AudioState = {
  playing: boolean;
  duration: number;
  position: number;
  error: boolean;
};

export function useAudioPlayer(uri: string) {
  const soundRef = useRef<Audio.Sound | null>(null);
  const playingRef = useRef(false);
  const [state, setState] = useState<AudioState>({
    playing: false,
    duration: 0,
    position: 0,
    error: false,
  });

  useEffect(() => {
    // Configure audio mode for playback
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    }).catch(() => {});

    return () => {
      soundRef.current?.unloadAsync();
    };
  }, []);

  const load = useCallback(async () => {
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      const { sound } = await Audio.Sound.createAsync(
        { uri },
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
    } catch {
      setState((prev) => ({ ...prev, error: true }));
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
        // If at end, seek to start before playing
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
