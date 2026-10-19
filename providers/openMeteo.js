import GObject from 'gi://GObject';
import BaseProvider from './baseProvider.js';

import { localDayKey } from '../utils/insights.js';

// Marks strings for translation; they are translated when displayed.
const N_ = s => s;

const VARIABLES =
    'temperature_2m,apparent_temperature,relative_humidity_2m,' +
    'weather_code,pressure_msl,wind_speed_10m,wind_direction_10m,' +
    'wind_gusts_10m,uv_index,is_day';

// WMO weather codes -> [summary, day icon, night icon]
const CODES = {
    0: [N_('Clear sky'), 'weather-clear-symbolic', 'weather-clear-night-symbolic'],
    1: [N_('Mainly clear'), 'weather-few-clouds-symbolic', 'weather-few-clouds-night-symbolic'],
    2: [N_('Partly cloudy'), 'weather-few-clouds-symbolic', 'weather-few-clouds-night-symbolic'],
    3: [N_('Overcast'), 'weather-overcast-symbolic'],

    45: [N_('Fog'), 'weather-fog-symbolic'],
    48: [N_('Rime fog'), 'weather-fog-symbolic'],

    51: [N_('Light drizzle'), 'weather-showers-scattered-symbolic'],
    53: [N_('Drizzle'), 'weather-showers-scattered-symbolic'],
    55: [N_('Dense drizzle'), 'weather-showers-symbolic'],
    56: [N_('Freezing drizzle'), 'weather-freezing-rain-symbolic'],
    57: [N_('Dense freezing drizzle'), 'weather-freezing-rain-symbolic'],

    61: [N_('Light rain'), 'weather-showers-scattered-symbolic'],
    63: [N_('Rain'), 'weather-showers-symbolic'],
    65: [N_('Heavy rain'), 'weather-showers-symbolic'],
    66: [N_('Freezing rain'), 'weather-freezing-rain-symbolic'],
    67: [N_('Heavy freezing rain'), 'weather-freezing-rain-symbolic'],

    71: [N_('Light snow'), 'weather-snow-symbolic'],
    73: [N_('Snow'), 'weather-snow-symbolic'],
    75: [N_('Heavy snow'), 'weather-snow-symbolic'],
    77: [N_('Snow grains'), 'weather-snow-symbolic'],

    80: [N_('Light rain showers'), 'weather-showers-scattered-symbolic'],
    81: [N_('Rain showers'), 'weather-showers-symbolic'],
    82: [N_('Violent rain showers'), 'weather-showers-symbolic'],
    85: [N_('Snow showers'), 'weather-snow-symbolic'],
    86: [N_('Heavy snow showers'), 'weather-snow-symbolic'],

    95: [N_('Thunderstorm'), 'weather-storm-symbolic'],
    96: [N_('Thunderstorm with hail'), 'weather-storm-symbolic'],
    99: [N_('Thunderstorm with heavy hail'), 'weather-storm-symbolic'],
};

export default GObject.registerClass(
class OpenMeteoProvider extends BaseProvider {

    /* ---------------------------------------------------------
     * PROVIDER INFO
     * --------------------------------------------------------- */

    getName() {
        return 'Open‑Meteo';
    }

    getWebsite() {
        return 'https://open-meteo.com/';
    }

    /* ---------------------------------------------------------
     * URL
     * --------------------------------------------------------- */

    _buildUrl(lat, lon) {
        return `https://api.open-meteo.com/v1/forecast?` +
            `latitude=${lat}&longitude=${lon}` +
            `&current=${VARIABLES}` +
            `&hourly=${VARIABLES},precipitation,precipitation_probability` +
            `&daily=sunrise,sunset` +
            `&forecast_days=8` +
            `&wind_speed_unit=ms` +
            `&timeformat=unixtime` +
            `&timezone=auto`;
    }

    /* ---------------------------------------------------------
     * NORMALIZATION
     * --------------------------------------------------------- */

    _normalizeCurrent(json, locationName) {
        const c = json?.current;
        if (!c)
            return null;

        return {
            location: locationName,

            summary: this._codeToSummary(c.weather_code),
            icon: this._mapIcon(c.weather_code, c.is_day),

            temp: c.temperature_2m,
            feelsLike: c.apparent_temperature ?? null,
            humidity: c.relative_humidity_2m ?? null,
            pressure: c.pressure_msl ?? null,

            wind: {
                speed: c.wind_speed_10m,
                deg: c.wind_direction_10m,
            },
            gusts: c.wind_gusts_10m ?? null,
            uv: c.uv_index ?? null,

            sunrise: null,
            sunset: null,

            time: new Date(c.time * 1000).toISOString(),
        };
    }

    _normalizeSteps(json) {
        const h = json?.hourly;
        if (!h?.time)
            return [];

        return h.time.map((t, i) => ({
            time: t * 1000,
            hours: 1,

            temp: h.temperature_2m?.[i] ?? null,
            feelsLike: h.apparent_temperature?.[i] ?? null,
            humidity: h.relative_humidity_2m?.[i] ?? null,
            pressure: h.pressure_msl?.[i] ?? null,

            wind: {
                speed: h.wind_speed_10m?.[i] ?? null,
                deg: h.wind_direction_10m?.[i] ?? null,
            },
            gusts: h.wind_gusts_10m?.[i] ?? null,

            precip: h.precipitation?.[i] ?? null,
            precipProb: h.precipitation_probability?.[i] ?? null,
            uv: h.uv_index?.[i] ?? null,

            isDay: h.is_day?.[i] !== 0,
            summary: this._codeToSummary(h.weather_code?.[i]),
            icon: this._mapIcon(h.weather_code?.[i], h.is_day?.[i]),
        }));
    }

    _sunTimes(json) {
        const d = json?.daily;
        if (!d?.time)
            return null;

        const map = new Map();

        d.time.forEach((t, i) => {
            map.set(localDayKey(t * 1000), {
                sunrise: d.sunrise?.[i] ? d.sunrise[i] * 1000 : null,
                sunset: d.sunset?.[i] ? d.sunset[i] * 1000 : null,
                polar: null,
            });
        });

        return map;
    }

    /* ---------------------------------------------------------
     * ICONS + SUMMARY
     * --------------------------------------------------------- */

    _mapIcon(code, isDay = 1) {
        const entry = CODES[code];
        if (!entry)
            return 'weather-clear-symbolic';

        return isDay === 0 && entry[2] ? entry[2] : entry[1];
    }

    _codeToSummary(code) {
        return CODES[code]?.[0] ?? N_('Unknown');
    }
});
