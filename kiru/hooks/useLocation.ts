import { useState, useEffect, useRef } from 'react';
import * as Location from 'expo-location';

export function useLocation() {
  const [location, setLocation] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted' || cancelled) return;

        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Low,
        });
        if (cancelled) return;

        const { latitude, longitude } = pos.coords;
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&zoom=10`,
          { headers: { 'User-Agent': 'kiru-app' } },
        );
        if (!res.ok || cancelled) return;

        const data = await res.json();
        const addr = data.address || {};
        const city = addr.city || addr.town || addr.village || addr.county || '';
        const state = addr.state || '';
        if ((city || state) && !cancelled) {
          setLocation([city, state].filter(Boolean).join(', '));
        }
      } catch {
        // Location enrichment is best-effort
      }
    })();

    return () => {
      cancelled = true;
      mountedRef.current = false;
    };
  }, []);

  return location;
}
