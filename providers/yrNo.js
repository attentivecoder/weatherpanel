import GObject from 'gi://GObject';
import BaseProvider from './baseProvider.js';

// Marks strings for translation; they are translated when displayed.
const N_ = s => s;

// MET Norway symbol codes without the _day/_night suffix. The two
// "lights..." spellings are how the API actually names them.
const SUMMARIES = {
    clearsky: N_('Clear sky'),
    fair: N_('Fair'),
    partlycloudy: N_('Partly cloudy'),
    cloudy: N_('Cloudy'),
    fog: N_('Fog'),
    lightrain: N_('Light rain'),
    rain: N_('Rain'),
    heavyrain: N_('Heavy rain'),
    lightrainandthunder: N_('Light rain and thunder'),
    rainandthunder: N_('Rain and thunder'),
    heavyrainandthunder: N_('Heavy rain and thunder'),
    lightrainshowers: N_('Light rain showers'),
    rainshowers: N_('Rain showers'),
    heavyrainshowers: N_('Heavy rain showers'),
    lightrainshowersandthunder: N_('Light rain showers and thunder'),
    rainshowersandthunder: N_('Rain showers and thunder'),
    heavyrainshowersandthunder: N_('Heavy rain showers and thunder'),
    lightsleet: N_('Light sleet'),
    sleet: N_('Sleet'),
    heavysleet: N_('Heavy sleet'),
    lightsleetandthunder: N_('Light sleet and thunder'),
    sleetandthunder: N_('Sleet and thunder'),
    heavysleetandthunder: N_('Heavy sleet and thunder'),
    lightsleetshowers: N_('Light sleet showers'),
    sleetshowers: N_('Sleet showers'),
    heavysleetshowers: N_('Heavy sleet showers'),
    lightssleetshowersandthunder: N_('Light sleet showers and thunder'),
    sleetshowersandthunder: N_('Sleet showers and thunder'),
    heavysleetshowersandthunder: N_('Heavy sleet showers and thunder'),
    lightsnow: N_('Light snow'),
    snow: N_('Snow'),
    heavysnow: N_('Heavy snow'),
    lightsnowandthunder: N_('Light snow and thunder'),
    snowandthunder: N_('Snow and thunder'),
    heavysnowandthunder: N_('Heavy snow and thunder'),
    lightsnowshowers: N_('Light snow showers'),
    snowshowers: N_('Snow showers'),
    heavysnowshowers: N_('Heavy snow showers'),
    lightssnowshowersandthunder: N_('Light snow showers and thunder'),
    snowshowersandthunder: N_('Snow showers and thunder'),
    heavysnowshowersandthunder: N_('Heavy snow showers and thunder'),
};

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

    // "complete" adds feels-like, gusts, UV and precipitation probability.
    _buildUrl(lat, lon) {
        return `https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${lat}&lon=${lon}`;
    }

    /* ---------------------------------------------------------
     * NORMALIZATION
     * --------------------------------------------------------- */

    _normalizeCurrent(json, locationName) {
        const ts = json.properties?.timeseries?.[0];
        if (!ts)
            return null;

        const inst = ts.data?.instant?.details ?? {};
        const symbol =
            ts.data?.next_1_hours?.summary?.symbol_code ??
            ts.data?.next_6_hours?.summary?.symbol_code ??
            null;

        return {
            location: locationName,

            summary: this._symbolToSummary(symbol),
            icon: this._symbolToIcon(symbol),

            temp: inst.air_temperature,
            feelsLike: inst.apparent_air_temperature ?? null,
            humidity: inst.relative_humidity ?? null,
            pressure: inst.air_pressure_at_sea_level ?? null,

            wind: {
                speed: inst.wind_speed,
                deg: inst.wind_from_direction,
            },
            gusts: inst.wind_speed_of_gust ?? null,
            uv: inst.ultraviolet_index_clear_sky ?? null,

            sunrise: null,
            sunset: null,

            time: ts.time,
        };
    }

    // Hourly for the first days, 6-hourly after that.
    _normalizeSteps(json) {
        const list = json.properties?.timeseries;
        if (!list)
            return [];

        const steps = [];

        for (const ts of list) {
            const inst = ts.data?.instant?.details ?? {};
            const next1 = ts.data?.next_1_hours;
            const next6 = ts.data?.next_6_hours;
            const next = next1 ?? next6;

            if (!next)
                continue;

            const symbol = next.summary?.symbol_code ?? null;

            steps.push({
                time: new Date(ts.time).getTime(),
                hours: next1 ? 1 : 6,

                temp: inst.air_temperature ?? null,
                feelsLike: inst.apparent_air_temperature ?? null,
                humidity: inst.relative_humidity ?? null,
                pressure: inst.air_pressure_at_sea_level ?? null,

                wind: {
                    speed: inst.wind_speed ?? null,
                    deg: inst.wind_from_direction ?? null,
                },
                gusts: inst.wind_speed_of_gust ?? null,

                precip: next.details?.precipitation_amount ?? null,
                precipProb: next.details?.probability_of_precipitation ?? null,
                uv: inst.ultraviolet_index_clear_sky ?? null,

                isDay: !symbol?.endsWith('_night'),
                summary: this._symbolToSummary(symbol),
                icon: this._symbolToIcon(symbol),
            });
        }

        // Once 6-hourly steps start, drop any later hourly ones so the
        // intervals don't overlap.
        return steps.filter((s, i) =>
            i === 0 || s.time >= steps[i - 1].time + steps[i - 1].hours * 3600 * 1000);
    }

    /* ---------------------------------------------------------
     * ICONS + SUMMARY
     * Symbol codes look like "lightrainshowersandthunder_day".
     * --------------------------------------------------------- */

    _symbolToIcon(symbol) {
        if (!symbol)
            return 'weather-clear-symbolic';

        const [base, period] = symbol.split('_');
        const night = period === 'night';

        if (base.includes('thunder'))
            return 'weather-storm-symbolic';
        if (base.includes('sleet'))
            return 'weather-freezing-rain-symbolic';
        if (base.includes('snow'))
            return 'weather-snow-symbolic';
        if (base.includes('rain'))
            return base.startsWith('light') || base.includes('showers')
                ? 'weather-showers-scattered-symbolic'
                : 'weather-showers-symbolic';
        if (base === 'fog')
            return 'weather-fog-symbolic';
        if (base === 'cloudy')
            return 'weather-overcast-symbolic';
        if (base === 'fair' || base === 'partlycloudy')
            return night ? 'weather-few-clouds-night-symbolic' : 'weather-few-clouds-symbolic';

        return night ? 'weather-clear-night-symbolic' : 'weather-clear-symbolic';
    }

    _symbolToSummary(symbol) {
        if (!symbol)
            return N_('Unknown');

        return SUMMARIES[symbol.split('_')[0]] ?? N_('Unknown');
    }
});
