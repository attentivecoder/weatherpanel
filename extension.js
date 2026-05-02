import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { GeolocationService } from './services/geolocation.js'
import Controller from './controller.js';
import Gio from 'gi://Gio';


export default class WeatherPanel extends Extension {

    enable() {
        this.geolocation = new GeolocationService();
        this._controller = new Controller(this);
        this._controller.enable();
    }

    disable() {
        this._controller?.disable();
        this._controller = null;
    }
    
    async setCurrentLocation() {
        const loc = await this.geolocation.getCurrentLocation();
        const city = await this.geolocation.reverseGeocode(loc);

        if (!city || !city.name)
            throw new Error("Failed to get location");

        const settings = this._controller._settings;

        settings.set_string('city', JSON.stringify([city]));
        settings.set_int('actual-city', 0);

        return city;
    }

    openProviderUrl() {
        Gio.AppInfo.launch_default_for_uri_async(
            'https://open-meteo.com/',
            null,
            null,
            (obj, res) => {
                try {
                    Gio.AppInfo.launch_default_for_uri_finish(res);
                } catch (e) {
                    logError(e, 'Failed to open provider URL');
                }
            }
        );
    }
}
