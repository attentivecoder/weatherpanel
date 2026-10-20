import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup';

import { buildDays, nextHours } from '../utils/insights.js';
import { createSession } from '../utils/http.js';

// A response is reused instead of asking the API again for at least
// this long, or until the server's Expires header if that is later.
const MIN_FETCH_INTERVAL_MS = 5 * 60 * 1000;
const MAX_FETCH_INTERVAL_MS = 60 * 60 * 1000;

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

        // Last good response, so settings changes and overlapping
        // refreshes don't each cost a request.
        this._cache = null;   // { url, json, city, freshUntil }
        this._pending = null; // { url, promise }
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

    // force skips the cache (manual refresh) but still shares a
    // request that is already in flight.
    async refresh(isCurrent, { force = false } = {}) {
        try {
            const data = await this._fetchWeather(force);

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

    // Re-applies settings such as the number of forecast days to the
    // last response, without a network request.
    rebuildForecast() {
        if (!this._cache)
            return false;

        this._data = this._buildData(this._cache.json, this._cache.city);
        this.emit('forecast-updated', this._data);

        return true;
    }

    /* ---------------------------------------------------------
     * FETCH + CITY HANDLING
     * --------------------------------------------------------- */

    async _fetchWeather(force = false) {
        const city = this._getCity();
        if (!city)
            return null;

        const url = this._buildUrl(city.lat, city.lon);
        if (!url)
            throw new Error('Provider did not return a URL');

        const json = await this._getJsonCached(url, city, force);
        if (!json)
            return null;

        return this._buildData(json, city);
    }

    _buildData(json, city) {
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

    async _getJsonCached(url, city, force) {
        const cache = this._cache;

        if (!force && cache?.url === url && Date.now() < cache.freshUntil)
            return cache.json;

        if (this._pending?.url !== url) {
            const promise = this._getJson(url);
            this._pending = { url, promise };

            promise.then(result => {
                if (this._pending?.promise === promise)
                    this._pending = null;

                if (!result)
                    return;

                const now = Date.now();

                this._cache = {
                    url,
                    json: result.json,
                    city,
                    freshUntil: Math.min(
                        Math.max(now + MIN_FETCH_INTERVAL_MS, result.expires),
                        now + MAX_FETCH_INTERVAL_MS),
                };
            });
        }

        const result = await this._pending.promise;
        return result?.json ?? null;
    }

    // Resolves to { json, expires } (expires in ms, 0 if unknown), or null.
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
                            const expires =
                                msg.get_response_headers().get_one('Expires');

                            resolve({
                                json: JSON.parse(text),
                                expires: Date.parse(expires) || 0,
                            });
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

