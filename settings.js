export default class Settings {
    constructor(extension) {
        this._settings = extension.getSettings?.();

        if (!this._settings)
            throw new Error('Settings: getSettings() not available');
    }

    get_string(key) {
        return this._settings.get_string(key);
    }

    set_string(key, value) {
        this._settings.set_string(key, value);
    }

    get_int(key) {
        return this._settings.get_int(key);
    }

    set_int(key, value) {
        this._settings.set_int(key, value);
    }

    get_boolean(key) {
        return this._settings.get_boolean(key);
    }

    set_boolean(key, value) {
        this._settings.set_boolean(key, value);
    }

    get_double(key) {
        return this._settings.get_double(key);
    }

    set_double(key, value) {
        this._settings.set_double(key, value);
    }

    get_enum(key) {
        const value = this._settings.get_enum(key);

        if (typeof value !== 'number')
            return 0;

        return value;
    }

    set_enum(key, value) {
        if (typeof value !== 'number')
            return;

        this._settings.set_enum(key, value);
    }

    connectChanged(callback) {
        return this._settings.connect('changed', callback);
    }

    disconnect(id) {
        if (id)
            this._settings.disconnect(id);
    }

    get cities() {
        const raw = this.get_string('city');

        if (!raw)
            return [];

        try {
            const parsed = JSON.parse(raw);

            if (Array.isArray(parsed))
                return parsed;

        } catch (e) {
            log(`Settings: city JSON parse failed: ${e}`);
        }

        return this._parseLegacyCity(raw);
    }

    set cities(list) {
        if (!Array.isArray(list))
            return;

        this.set_string('city', JSON.stringify(list));
    }

    _parseLegacyCity(raw) {
        return raw
            .split('&&')
            .map(entry => {
                const parts = entry.split('>');

                if (parts.length < 2)
                    return null;

                const coord = parts[0].trim();
                const name = parts[1].trim();

                const [lat, lon] = coord.split(',').map(n => Number(n));

                if (Number.isNaN(lat) || Number.isNaN(lon))
                    return null;

                return { name, lat, lon };
            })
            .filter(Boolean);
    }

    get city() {
        return this.cities[0]?.name ?? '';
    }

    set city(value) {
        const list = this.cities;

        if (!list.length) {
            this.cities = [{
                name: value,
                lat: 0,
                lon: 0,
            }];
            return;
        }

        list[0].name = value;
        this.cities = list;
    }

    get apiKey() {
        return this.get_string('appid');
    }

    get unit() {
        return this.get_enum('unit');
    }

    get forecastDays() {
        return this.get_int('days-forecast');
    }

    get refreshIntervalCurrent() {
        return this.get_int('refresh-interval-current');
    }

    get refreshIntervalForecast() {
        return this.get_int('refresh-interval-forecast');
    }
}
