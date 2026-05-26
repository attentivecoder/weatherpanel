// providers/openMeteo.js
import GObject from 'gi://GObject';
import BaseProvider from './baseProvider.js';

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
        return (
            `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
            `&current_weather=true` +
            `&hourly=temperature_2m,weathercode,pressure_msl,windspeed_10m,winddirection_10m,windgusts_10m` +
            `&daily=weathercode,temperature_2m_max,temperature_2m_min,sunrise,sunset` +
            `&timezone=auto`
        );
    }

    /* ---------------------------------------------------------
     * NORMALIZATION — CURRENT
     * --------------------------------------------------------- */

    _normalizeCurrent(json, locationName) {
        if (!json || !json.current_weather)
            return null;

        const c = json.current_weather;
        const hourly = json.hourly;

        // Find matching hourly index
        let idx = -1;
        if (hourly?.time?.length)
            idx = hourly.time.findIndex(t => t === c.time);

        const getHourly = (arr) =>
            (idx >= 0 && arr?.[idx] !== undefined)
                ? arr[idx]
                : arr?.[0] ?? null;

        const pressure = getHourly(hourly?.pressure_msl);
        const gusts = getHourly(hourly?.windgusts_10m);

        return {
            location: locationName,

            summary: this._codeToSummary(c.weathercode),
            icon: this._mapIcon(c.weathercode),

            temp: c.temperature,

            wind: {
                speed: c.windspeed,
                deg: c.winddirection,
            },

            pressure: pressure,
            gusts: gusts ? { speed: gusts, deg: null } : null,

            sunrise: json.daily?.sunrise?.[0] ?? null,
            sunset: json.daily?.sunset?.[0] ?? null,

            time: c.time,
        };
    }

    /* ---------------------------------------------------------
     * NORMALIZATION — FORECAST
     * --------------------------------------------------------- */

    _normalizeForecast(json) {
        if (!json || !json.hourly)
            return [];

        const hourly = json.hourly;
        if (!hourly.time)
            return [];

        const now = new Date();
        const result = [];
        const days = new Map();

        for (let i = 0; i < hourly.time.length; i++) {
            const date = new Date(hourly.time[i]);

            if (date < now)
                continue;

            // 3‑hour steps
            if (date.getHours() % 3 !== 0)
                continue;

            const dayKey = date.toISOString().split('T')[0];

            if (!days.has(dayKey))
                days.set(dayKey, []);

            days.get(dayKey).push({
                time: date.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit'
                }),
                temp: hourly.temperature_2m[i],
                summary: this._codeToSummary(hourly.weathercode[i]),
                icon: this._mapIcon(hourly.weathercode[i]),
                wind: {
                    speed: hourly.windspeed_10m[i],
                    deg: hourly.winddirection_10m[i],
                },
                pressure: hourly.pressure_msl[i],
            });
        }

        for (const [key, entries] of days.entries()) {
            const date = new Date(key);

            if (!entries.length)
                continue;

            result.push({
                day: date.toLocaleDateString(undefined, { weekday: 'short' }),
                entries,
            });
        }

        return result.slice(0, 4);
    }

    /* ---------------------------------------------------------
     * ICONS + SUMMARY
     * --------------------------------------------------------- */

    _mapIcon(code) {
        const map = {
            0: 'weather-clear-symbolic',
            1: 'weather-few-clouds-symbolic',
            2: 'weather-overcast-symbolic',
            3: 'weather-overcast-symbolic',

            45: 'weather-fog-symbolic',
            48: 'weather-fog-symbolic',

            51: 'weather-showers-symbolic',
            53: 'weather-showers-symbolic',
            55: 'weather-showers-symbolic',

            61: 'weather-showers-symbolic',
            63: 'weather-showers-symbolic',
            65: 'weather-showers-symbolic',

            71: 'weather-snow-symbolic',
            73: 'weather-snow-symbolic',
            75: 'weather-snow-symbolic',

            95: 'weather-storm-symbolic',
            96: 'weather-storm-symbolic',
            99: 'weather-storm-symbolic',
        };

        return map[code] ?? 'weather-clear-symbolic';
    }

    _codeToSummary(code) {
        const map = {
            0: 'Clear sky',
            1: 'Mainly clear',
            2: 'Partly cloudy',
            3: 'Overcast',
            45: 'Fog',
            48: 'Rime fog',
            51: 'Light drizzle',
            53: 'Moderate drizzle',
            55: 'Dense drizzle',
            61: 'Light rain',
            63: 'Moderate rain',
            65: 'Heavy rain',
            71: 'Light snow',
            73: 'Moderate snow',
            75: 'Heavy snow',
            95: 'Thunderstorm',
            96: 'Thunderstorm w/ hail',
            99: 'Thunderstorm w/ heavy hail',
        };

        return map[code] ?? 'Unknown';
    }
});

