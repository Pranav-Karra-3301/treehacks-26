import { useState, useRef, useCallback, useEffect } from 'react';
import {
  useAudioPlayer as useExpoPlayer,
  useAudioPlayerStatus,
  setAudioModeAsync,
} from 'expo-audio';
import type { AudioSource } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';

export function useAudioPlayer(uri: string) {
  const localUriRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const loadingRef = useRef(false);
  const [error, setError] = useState(false);

  const player = useExpoPlayer(null, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    mountedRef.current = true;
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      interruptionMode: 'duckOthers',
    }).catch(() => {});

    return () => {
      mountedRef.current = false;
      if (localUriRef.current) {
        FileSystem.deleteAsync(localUriRef.current, { idempotent: true }).catch(() => {});
      }
    };
  }, []);

  const load = useCallback(async () => {
    if (loadingRef.current || !mountedRef.current) return;
    loadingRef.current = true;
    try {
      const localPath = `${FileSystem.cacheDirectory}audio_${Date.now()}.wav`;
      const result = await FileSystem.downloadAsync(uri, localPath, {
        headers: { 'Accept': 'audio/wav, audio/*' },
      });

      if (!mountedRef.current) return;

      if (result.status !== 200) {
        setError(true);
        return;
      }

      // Clean up previous temp file
      if (localUriRef.current && localUriRef.current !== result.uri) {
        FileSystem.deleteAsync(localUriRef.current, { idempotent: true }).catch(() => {});
      }
      localUriRef.current = result.uri;

      player.replace(result.uri as AudioSource);
      setError(false);
    } catch {
      if (mountedRef.current) setError(true);
    } finally {
      loadingRef.current = false;
    }
  }, [uri, player]);

  useEffect(() => {
    load();
  }, [load]);

  // Reset position when playback finishes
  useEffect(() => {
    if (status.didJustFinish) {
      player.seekTo(0);
    }
  }, [status.didJustFinish, player]);

  const togglePlay = useCallback(() => {
    if (!status.isLoaded) {
      load();
      return;
    }
    if (status.playing) {
      player.pause();
    } else {
      player.play();
    }
  }, [status.isLoaded, status.playing, player, load]);

  const seek = useCallback(
    (seconds: number) => {
      player.seekTo(seconds);
    },
    [player],
  );

  return {
    playing: status.playing,
    duration: status.duration,
    position: status.currentTime,
    error,
    togglePlay,
    seek,
  };
}
