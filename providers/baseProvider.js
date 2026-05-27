import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup';

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
        this._session = new Soup.Session();

        this._current = null;
        this._forecast = null;
    }

    /* ---------------------------------------------------------
     * PUBLIC API
     * --------------------------------------------------------- */

    start() {
        if (this._settings.get_string('city'))
            this.refresh(true);
    }

    stop() {
        this._session?.abort();
    }


    async refresh(isCurrent) {
        try {
            const data = await this._fetchWeather();

            if (!data) {
                this._emitError('No weather data');
                return false;
            }

            this._current = data.current;
            this._forecast = data.forecast;

            if (isCurrent)
                this.emit('weather-updated', data);
            else
                this.emit('forecast-updated', data.forecast);

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

        const json = await this._getJson(url, this._getHeaders?.());
        if (!json)
            return null;

        return {
            current: this._normalizeCurrent(json, city.name),
            forecast: this._normalizeForecast(json),
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

    async _getJson(url, headers = null) {
        try {
            return await new Promise((resolve, reject) => {
                const msg = new Soup.Message({
                    method: 'GET',
                    uri: GLib.Uri.parse(url, GLib.UriFlags.NONE),
                });

                if (headers) {
                    for (const [key, value] of Object.entries(headers))
                        msg.request_headers.append(key, value);
                }

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

    _normalizeForecast(json) {
        throw new Error('_normalizeForecast() must be implemented by provider');
    }

    getName() {
        throw new Error('getName() must be implemented by provider');
    }

    getWebsite() {
        throw new Error('getWebsite() must be implemented by provider');
    }
});

