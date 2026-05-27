import GObject from 'gi://GObject';
import BaseProvider from './baseProvider.js';

export default GObject.registerClass(
class YrNoProvider extends BaseProvider {

    /* ---------------------------------------------------------
     * PROVIDER INFO
     * --------------------------------------------------------- */

    getName() {
        return 'Yr.no';
    }

    getWebsite() {
        return 'https://www.yr.no/';
    }

    /* ---------------------------------------------------------
     * URL + HEADERS
     * --------------------------------------------------------- */

    _buildUrl(lat, lon) {
        return `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lon}`;
    }

    _getHeaders() {
        return {
            'User-Agent': 'weatherpanel'
        };
    }

    /* ---------------------------------------------------------
     * NORMALIZATION — CURRENT
     * --------------------------------------------------------- */

    _normalizeCurrent(json, locationName) {
        const ts = json.properties?.timeseries?.[0];
        if (!ts)
            return null;

        const inst = ts.data?.instant?.details ?? {};
        const symbol = ts.data?.next_1_hours?.summary?.symbol_code ?? null;

        return {
            location: locationName,

            summary: this._symbolToSummary(symbol),
            icon: this._symbolToIcon(symbol),

            temp: inst.air_temperature,

            wind: {
                speed: inst.wind_speed,
                deg: inst.wind_from_direction,
            },

            pressure: inst.air_pressure_at_sea_level ?? null,
            gusts: inst.wind_speed_of_gust ?? null,

            sunrise: null,
            sunset: null,

            time: ts.time,
        };
    }

    /* ---------------------------------------------------------
     * NORMALIZATION — FORECAST
     * --------------------------------------------------------- */

    _normalizeForecast(json) {
        const list = json.properties?.timeseries;
        if (!list)
            return [];

        const now = new Date();
        const days = new Map();

        for (const ts of list) {
            const date = new Date(ts.time);
            if (date < now)
                continue;

            // 3‑hour steps
            if (date.getHours() % 3 !== 0)
                continue;

            const inst = ts.data?.instant?.details ?? {};
            const symbol = ts.data?.next_1_hours?.summary?.symbol_code;

            const dayKey = ts.time.split('T')[0];

            if (!days.has(dayKey))
                days.set(dayKey, []);

            days.get(dayKey).push({
                time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                temp: inst.air_temperature,
                summary: this._symbolToSummary(symbol),
                icon: this._symbolToIcon(symbol),
                wind: {
                    speed: inst.wind_speed,
                    deg: inst.wind_from_direction,
                },
                pressure: inst.air_pressure_at_sea_level ?? null,
            });
        }

        const result = [];
        for (const [key, entries] of days.entries()) {
            if (!entries.length)
                continue;

            const date = new Date(key);

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

    _symbolToIcon(symbol) {
        if (!symbol)
            return 'weather-clear-symbolic';

        const map = {
            'clearsky_day': 'weather-clear-symbolic',
            'clearsky_night': 'weather-clear-night-symbolic',

            'fair_day': 'weather-few-clouds-symbolic',
            'fair_night': 'weather-few-clouds-night-symbolic',

            'partlycloudy_day': 'weather-few-clouds-symbolic',
            'partlycloudy_night': 'weather-few-clouds-night-symbolic',

            'cloudy': 'weather-overcast-symbolic',

            'fog': 'weather-fog-symbolic',

            'lightrain': 'weather-showers-symbolic',
            'rain': 'weather-showers-symbolic',
            'heavyrain': 'weather-showers-symbolic',

            'lightsnow': 'weather-snow-symbolic',
            'snow': 'weather-snow-symbolic',
            'heavysnow': 'weather-snow-symbolic',

            'thunderstorm': 'weather-storm-symbolic',
        };

        return map[symbol] ?? 'weather-clear-symbolic';
    }

    _symbolToSummary(symbol) {
        if (!symbol)
            return 'Unknown';

        const map = {
            'clearsky_day': 'Clear sky',
            'clearsky_night': 'Clear sky',

            'fair_day': 'Fair',
            'fair_night': 'Fair',

            'partlycloudy_day': 'Partly cloudy',
            'partlycloudy_night': 'Partly cloudy',

            'cloudy': 'Cloudy',
            'fog': 'Fog',

            'lightrain': 'Light rain',
            'rain': 'Rain',
            'heavyrain': 'Heavy rain',

            'lightsnow': 'Light snow',
            'snow': 'Snow',
            'heavysnow': 'Heavy snow',

            'thunderstorm': 'Thunderstorm',
        };

        return map[symbol] ?? 'Unknown';
    }
});

