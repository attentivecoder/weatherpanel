import GObject from 'gi://GObject';

export default GObject.registerClass(
class LocationManager extends GObject.Object {

    _init({ settings, geolocation }) {
        super._init();

        this._settings = settings;
        this._geolocation = geolocation;
    }

    async updateCurrentLocation() {
        try {
            const loc = await this._geolocation.getLocation();
            if (!loc)
                return null;

            const cities = [{
                name: loc.name,
                lat: loc.lat,
                lon: loc.lon,
            }];

            this._settings.set_string('city', JSON.stringify(cities));
            this._settings.set_int('actual-city', 0);

            return loc.name;

        } catch (e) {
            logError(e);
            return null;
        }
    }
});

