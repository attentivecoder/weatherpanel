import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup';

import { buildDays, nextHours } from '../utils/insights.js';
import { createSession } from '../utils/http.js';

export default GObject.registerClass({
    Signals: {
        'weather-updated': { param_types: [GObject.TYPE_JSOBJECT] },
        'forecast-updated': { param_types: [GObject.TYPE_JSOBJECT] },
        'error': { param_types: [GObject.TYPE_STRING] },
    },
}, class BaseProvider extends GObject.Object {

    _init({ settings }) {
        super._init();

        this._settings = settings;
        this._session = createSession();

        this._data = null;
    }

    /* ---------------------------------------------------------
     * PUBLIC API
     * --------------------------------------------------------- */

    stop() {
        this._session.abort();
    }

    getLastData() {
        return this._data;
    }

    async refresh(isCurrent) {
        try {
            const data = await this._fetchWeather();

            if (!data) {
                this._emitError('No weather data');
                return false;
            }

            this._data = data;

            this.emit(isCurrent ? 'weather-updated' : 'forecast-updated', data);

            return true;

        } catch (e) {
            logError(e);
            this._emitError(e.message);
            return false;
        }
    }

    /* ---------------------------------------------------------
     * FETCH + CITY HANDLING
     * --------------------------------------------------------- */

    async _fetchWeather() {
        const city = this._getCity();
        if (!city)
            return null;

        const url = this._buildUrl(city.lat, city.lon);
        if (!url)
            throw new Error('Provider did not return a URL');

        const json = await this._getJson(url);
        if (!json)
            return null;

        const steps = this._normalizeSteps(json);
        const forecast = buildDays(steps, {
            lat: city.lat,
            lon: city.lon,
            sun: this._sunTimes(json),
            maxDays: this._settings.get_int('days-forecast'),
        });

        const current = this._normalizeCurrent(json, city.name);

        if (current && forecast[0]?.isToday) {
            current.sunrise ??= forecast[0].sunrise;
            current.sunset ??= forecast[0].sunset;
        }

        return {
            current,
            hourly: nextHours(steps),
            forecast,
        };
    }

    _getCity() {
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

        return { name: selected.name, lat, lon };
    }

    /* ---------------------------------------------------------
     * NETWORK
     * --------------------------------------------------------- */

    async _getJson(url) {
        try {
            return await new Promise((resolve, reject) => {
                const msg = new Soup.Message({
                    method: 'GET',
                    uri: GLib.Uri.parse(url, GLib.UriFlags.NONE),
                });

                this._session.send_and_read_async(
                    msg,
                    GLib.PRIORITY_DEFAULT,
                    null,
                    (session, res) => {
                        try {
                            const bytes = session.send_and_read_finish(res);

                            if (msg.get_status() !== Soup.Status.OK)
                                throw new Error(`HTTP ${msg.get_status()}`);

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

    /* ---------------------------------------------------------
     * HELPERS
     * --------------------------------------------------------- */

    _emitError(msg) {
        this.emit('error', msg);
    }

    /* ---------------------------------------------------------
     * ABSTRACT METHODS
     * --------------------------------------------------------- */

    _buildUrl(lat, lon) {
        throw new Error('_buildUrl() must be implemented by provider');
    }

    _normalizeCurrent(json, locationName) {
        throw new Error('_normalizeCurrent() must be implemented by provider');
    }

    // Forecast steps in the format described in utils/insights.js.
    _normalizeSteps(json) {
        throw new Error('_normalizeSteps() must be implemented by provider');
    }

    // Optional Map of local day key -> { sunrise, sunset } in ms.
    // Days without an entry get computed sun times.
    _sunTimes(json) {
        return null;
    }

    getName() {
        throw new Error('getName() must be implemented by provider');
    }

    getWebsite() {
        throw new Error('getWebsite() must be implemented by provider');
    }
});

