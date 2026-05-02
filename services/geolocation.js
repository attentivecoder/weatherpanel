import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

/**
 * GeolocationService
 *
 * - Primary: ipapi.co (city + country + coords)
 * - Fallback: ipinfo.io
 * - City lookup: Open‑Meteo forward search
 *
 * No reverse geocoding (Open‑Meteo reverse is unreliable).
 */
export class GeolocationService {
    constructor() {
        this._session = new Soup.Session();
    }

    /* ---------------------------------------------------------
     * 1. Get device location using IP geolocation
     * --------------------------------------------------------- */
    async getCurrentLocation() {
        // 1. Try ipapi.co (best)
        try {
            const json = await this._getJson('https://ipapi.co/json/');

            if (json && json.city) {
                return {
                    city: json.city,
                    region: json.region ?? null,
                    country: json.country_name ?? json.country ?? null,
                    lat: Number(json.latitude),
                    lon: Number(json.longitude),
                    accuracy: 20000,
                    raw: json,
                };
            }
        } catch (_) {}

        // 2. Fallback to ipinfo.io
        try {
            const json = await this._getJson('https://ipinfo.io/json');

            if (!json || !json.loc)
                throw new Error('Invalid IP geolocation response');

            const [lat, lon] = json.loc.split(',').map(Number);

            return {
                city: json.city ?? null,
                region: json.region ?? null,
                country: json.country ?? null,
                lat,
                lon,
                accuracy: 50000,
                raw: json,
            };

        } catch (e) {
            throw new Error('Failed to get IP location: ' + e.message);
        }
    }

    /* ---------------------------------------------------------
     * 2. Convert city name → canonical city object (Open‑Meteo)
     * --------------------------------------------------------- */
   async reverseGeocode(loc) {
        if (!loc.lat || !loc.lon)
            return null;

        const url =
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${loc.lat}&lon=${loc.lon}&addressdetails=1`;

        const json = await this._getJsonWithUA(url);

        if (json?.address) {
            const addr = json.address;

            const name =
                addr.city ||
                addr.town ||
                addr.village ||
                addr.hamlet ||
                addr.locality ||
                addr.municipality ||
                null;

            return {
                name: name ?? "Unknown",
                country: addr.country ?? loc.country ?? null,
                lat: loc.lat,
                lon: loc.lon,
            };
        }

        // fallback: use IP data directly
        return {
            name: loc.city ?? "Unknown",
            country: loc.country ?? null,
            lat: loc.lat,
            lon: loc.lon,
        };
    }
    
    async _getJsonWithUA(url) {
        return new Promise((resolve, reject) => {
            const msg = Soup.Message.new('GET', url);

            // REQUIRED by Nominatim
            msg.request_headers.append("User-Agent", "gnome-openweather-extension");

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
    }



    /* ---------------------------------------------------------
     * 3. Forward geocoding (search by city name)
     * --------------------------------------------------------- */
    async searchCity(query) {
        if (!query || !query.trim())
            return [];

        const url =
            `https://nominatim.openstreetmap.org/search?` +
            `format=json&addressdetails=1&limit=10&q=${encodeURIComponent(query)}`;

        const json = await this._getJsonWithUA(url);

        if (!Array.isArray(json) || json.length === 0)
            return [];

        return json.map(r => {
            const addr = r.address ?? {};

            const name =
                addr.city ||
                addr.town ||
                addr.village ||
                addr.hamlet ||
                addr.locality ||
                r.display_name ||
                query;

            return {
                name,
                country: addr.country ?? null,
                lat: Number(r.lat),
                lon: Number(r.lon),
            };
        });
    }


    /* ---------------------------------------------------------
     * HTTP helper (Soup)
     * --------------------------------------------------------- */
    _getJson(url) {
        return new Promise((resolve, reject) => {
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
    }
}

