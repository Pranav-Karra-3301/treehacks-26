import { useState, useEffect } from 'react';
import * as Location from 'expo-location';

export function useLocation() {
  const [location, setLocation] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;

        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Low,
        });
        const { latitude, longitude } = pos.coords;

        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&zoom=10`,
          { headers: { 'User-Agent': 'kiru-app' } },
        );
        if (!res.ok) return;

        const data = await res.json();
        const addr = data.address || {};
        const city = addr.city || addr.town || addr.village || addr.county || '';
        const state = addr.state || '';
        if (city || state) {
          setLocation([city, state].filter(Boolean).join(', '));
        }
      } catch {
        // Location enrichment is best-effort
      }
    })();
  }, []);

  return location;
}
