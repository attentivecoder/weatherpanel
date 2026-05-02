import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

export default GObject.registerClass({
    Signals: {
        'weather-updated': { param_types: [GObject.TYPE_JSOBJECT] },
        'forecast-updated': { param_types: [GObject.TYPE_JSOBJECT] },
        'error': { param_types: [GObject.TYPE_STRING] },
    },
}, class WeatherProvider extends GObject.Object {

    _init({ settings }) {
        super._init();

        this._settings = settings;
        this._session = new Soup.Session();
        this._refreshSource = null;

        this._current = null;
        this._forecast = null;
    }

    start() {
        if (this._settings.get_string('city'))
            this.refresh(true);
    }

    stop() {
        if (this._refreshSource) {
            GLib.Source.remove(this._refreshSource);
            this._refreshSource = null;
        }
    }

    refresh(isCurrent) {
        this._fetchWeather()
            .then(data => {
                if (!data)
                    return;

                this._current = data.current;
                this._forecast = data.forecast;

                if (isCurrent)
                    this.emit('weather-updated', { current: data.current, forecast: data.forecast });
                else
                    this.emit('forecast-updated', data.forecast);
            })
            .catch(e => {
                logError(e);
                this.emit('error', e.message);
            });
    }

    async _fetchWeather() {
        const raw = this._settings.get_string('city');
        if (!raw)
            return null;

        let cities;
        try {
            cities = JSON.parse(raw);
        } catch {
            throw new Error('Invalid city data format');
        }

        const index = this._settings.get_int('actual-city') || 0;
        const selected = cities[index] || cities[0];
        if (!selected)
            return null;

        const lat = Number(selected.lat);
        const lon = Number(selected.lon);
        if (isNaN(lat) || isNaN(lon))
            throw new Error('Invalid coordinates');

        const url =
            `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
            `&current_weather=true` +
            `&hourly=temperature_2m,weathercode,pressure_msl,windspeed_10m,winddirection_10m,windgusts_10m` +
            `&daily=weathercode,temperature_2m_max,temperature_2m_min,sunrise,sunset` +
            `&timezone=auto`;

        const json = await this._getJson(url);
        if (!json) {
            this.emit('error', 'No weather data');
            return null;
        }

        return {
            current: this._normalizeCurrent(json, selected.name),
            forecast: this._normalizeForecast(json),
        };
    }

    async _getJson(url) {
        try {
            return await new Promise((resolve, reject) => {
                const msg = Soup.Message.new('GET', url);

                this._session.send_and_read_async(
                    msg,
                    GLib.PRIORITY_DEFAULT,
                    null,
                    (session, res) => {
                        try {
                            const bytes = session.send_and_read_finish(res);
                            const text = new TextDecoder().decode(bytes.get_data());
                            resolve(JSON.parse(text));
                        } catch (e) {
                            reject(e);
                        }
                    }
                );
            });
        } catch {
            return null;
        }
    }

    /* ---------------- NORMALIZATION ---------------- */

   _normalizeCurrent(json, locationName) {
        if (!json || !json.current_weather) {
            return null; // or: this.emit('error', 'No data')
        }
        
        const c = json.current_weather;
        const hourly = json.hourly;

        if (!c)
            throw new Error('Missing current_weather in API response');

        // ---- Find exact matching hourly index by timestamp ----
        let idx = -1;

        if (hourly?.time?.length) {
            idx = hourly.time.findIndex(t => t === c.time);
        }

        // ---- Safe fallbacks if alignment fails ----
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

            // PRIMARY SOURCE OF TRUTH
            temp: c.temperature,

            wind: {
                speed: c.windspeed,
                deg: c.winddirection,
            },

            // ONLY use hourly if aligned to same timestamp
            pressure: pressure,
            gusts: gusts ? { speed: gusts, deg: null } : null,

            sunrise: json.daily?.sunrise?.[0] ?? null,
            sunset: json.daily?.sunset?.[0] ?? null,

            // IMPORTANT: keep API timestamp, not JS time
            time: c.time,
        };
    }

    _normalizeForecast(json) {
        if (!json || !json.hourly)
            return

        const hourly = json.hourly;
        if (!hourly || !hourly.time)
            return [];

        const now = new Date();
        const result = [];
        const days = new Map();

        for (let i = 0; i < hourly.time.length; i++) {
            const date = new Date(hourly.time[i]);

            // Skip past hours
            if (date < now)
                continue;

            // Keep only 3‑hour steps
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

        // Convert map → array
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


    /* ---------------- ICONS ---------------- */

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

