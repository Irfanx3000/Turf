import { ENV } from "../config/configuration.js";

export interface GeoPointInput { lat: number; lng: number; }
export interface GeocodeResult { lat: number; lng: number; formattedAddress: string; }

/**
 * Maps provider abstraction. The mock adapter returns deterministic
 * coordinates so local development and tests never need API keys.
 */
export interface MapsProvider {
  readonly name: "google" | "mapbox" | "mock";
  geocode(query: string): Promise<GeocodeResult | null>;
}

export class MockMapsProvider implements MapsProvider {
  readonly name = "mock" as const;
  async geocode(query: string): Promise<GeocodeResult | null> {
    // Deterministic pseudo-coordinates inside Mumbai for dev/demo data.
    let h = 0;
    for (const ch of query) h = (h * 31 + ch.charCodeAt(0)) % 9973;
    return {
      lat: 19.0 + (h % 100) / 500,
      lng: 72.8 + (h % 77) / 400,
      formattedAddress: `${query} (approximate — mock geocoder)`,
    };
  }
}

export class GoogleMapsProvider implements MapsProvider {
  readonly name = "google" as const;
  constructor(private readonly apiKey: string) {}

  async geocode(query: string): Promise<GeocodeResult | null> {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${this.apiKey}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      status: string;
      results?: Array<{ formatted_address: string; geometry: { location: { lat: number; lng: number } } }>;
    };
    const first = data.results?.[0];
    if (data.status !== "OK" || !first) return null;
    return {
      lat: first.geometry.location.lat,
      lng: first.geometry.location.lng,
      formattedAddress: first.formatted_address,
    };
  }
}

export class MapboxProvider implements MapsProvider {
  readonly name = "mapbox" as const;
  constructor(private readonly token: string) {}

  async geocode(query: string): Promise<GeocodeResult | null> {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${this.token}&limit=1`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as { features?: Array<{ center: [number, number]; place_name: string }> };
    const first = data.features?.[0];
    if (!first) return null;
    return { lat: first.center[1]!, lng: first.center[0]!, formattedAddress: first.place_name };
  }
}

export function createMapsProvider(): MapsProvider {
  switch (ENV.MAPS_PROVIDER) {
    case "google":
      return ENV.GOOGLE_MAPS_API_KEY ? new GoogleMapsProvider(ENV.GOOGLE_MAPS_API_KEY) : new MockMapsProvider();
    case "mapbox":
      return ENV.MAPBOX_ACCESS_TOKEN ? new MapboxProvider(ENV.MAPBOX_ACCESS_TOKEN) : new MockMapsProvider();
    default:
      return new MockMapsProvider();
  }
}

export function mapsProviderName(): string {
  return createMapsProvider().name;
}
