import { describe, it, expect } from 'vitest'
import { latLngToUtmEasting, latLngToUtmNorthing } from '@/lib/utm'

describe('latLngToUtmEasting / latLngToUtmNorthing', () => {
  describe('BA pin (-34.6037, -58.3816) — Southern hemisphere, zone 21H', () => {
    it('returns the UTM Easting for Buenos Aires', () => {
      expect(latLngToUtmEasting(-34.6037, -58.3816)).toBe('373317.50')
    })

    it('returns the UTM Northing for Buenos Aires', () => {
      expect(latLngToUtmNorthing(-34.6037, -58.3816)).toBe('6170036.17')
    })
  })

  describe('NY pin (40.7128, -74.0060) — Northern hemisphere, zone 18T', () => {
    it('returns the Easting for New York', () => {
      expect(latLngToUtmEasting(40.7128, -74.0060)).toBe('583959.37')
    })

    it('returns a Northing below 1e7 (northern-hemisphere sanity)', () => {
      const northing = latLngToUtmNorthing(40.7128, -74.0060)
      expect(northing).toBe('4507351.00')
      expect(Number(northing)).toBeLessThan(1e7)
    })
  })

  describe('invalid input returns null', () => {
    it('lat 85 (out of UTM-valid range [-80, 84])', () => {
      expect(latLngToUtmEasting(85, 0)).toBeNull()
    })

    it('lat 91 (out of geographic range)', () => {
      expect(latLngToUtmEasting(91, 0)).toBeNull()
    })

    it('lng 181 (out of range)', () => {
      expect(latLngToUtmEasting(0, 181)).toBeNull()
    })

    it('NaN lat', () => {
      expect(latLngToUtmEasting(NaN, 0)).toBeNull()
    })

    it('NaN lng', () => {
      expect(latLngToUtmEasting(0, NaN)).toBeNull()
    })

    it('Infinity lat', () => {
      expect(latLngToUtmEasting(Infinity, 0)).toBeNull()
    })

    it('northing mirrors the same guard', () => {
      expect(latLngToUtmNorthing(85, 0)).toBeNull()
    })
  })

  describe('output format', () => {
    it('easting is a base-10 string with exactly 2 decimals (no commas, no sci-notation)', () => {
      expect(latLngToUtmEasting(-34.6037, -58.3816)).toMatch(/^\d+\.\d{2}$/)
    })

    it('northing is a base-10 string with exactly 2 decimals', () => {
      expect(latLngToUtmNorthing(-34.6037, -58.3816)).toMatch(/^\d+\.\d{2}$/)
    })
  })
})
