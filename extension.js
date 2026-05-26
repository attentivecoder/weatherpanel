import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { GeolocationService } from './services/geolocation.js';
import Controller from './controller.js';
import Gio from 'gi://Gio';

export default class WeatherPanel extends Extension {

    enable() {
        this.settings = this.getSettings();

        this.geolocation = new GeolocationService(this.settings);

        this._controller = new Controller(this, this.settings);
        this._controller.enable();
    }

    disable() {
        this._controller?.disable();
        this._controller = null;

        this.geolocation = null;
        this.settings = null;
    }

    async setCurrentLocation() {
        const loc = await this.geolocation.getCurrentLocation();
        const city = await this.geolocation.reverseGeocode(loc);

        if (!city || !city.name)
            throw new Error("Failed to get location");

        this.settings.set_string('city', JSON.stringify([city]));
        this.settings.set_int('actual-city', 0);

        return city;
    }
}

