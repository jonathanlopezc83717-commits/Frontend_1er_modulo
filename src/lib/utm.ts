import { fromLatLon } from 'utm'

export function latLngToUtmEasting(lat: number, lng: number): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -80 || lat > 84 || lng < -180 || lng > 180) return null
  return fromLatLon(lat, lng).easting.toFixed(2)
}

export function latLngToUtmNorthing(lat: number, lng: number): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -80 || lat > 84 || lng < -180 || lng > 180) return null
  return fromLatLon(lat, lng).northing.toFixed(2)
}
