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
    return () => {
      soundRef.current?.unloadAsync();
    };
  }, []);

  const load = useCallback(async () => {
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
      }
      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: false },
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
      if (playingRef.current) {
        await sound.pauseAsync();
      } else {
        await sound.playAsync();
      }
    } catch {
      // Sound may have been unloaded — try to reload
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
