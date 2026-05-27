import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup';

/**
 * GeolocationService (dynamic provider)
 *
 * - IP geolocation provider (user‑selectable):
 *      • ipapi.co
 *      • ipinfo.io
 *
 * - Geocoding provider (user‑selectable):
 *      • OpenStreetMap (Nominatim)
 *      • Open‑Meteo geocoding
 */

const IP_API = 0;
const IP_INFO = 1;

const GEO_OSM = 0;
const GEO_OPEN_METEO = 1;

export class GeolocationService {
    constructor(settings) {
        this._settings = settings;
        this._session = new Soup.Session();
    }

    /* ---------------------------------------------------------
     * LIFECYCLE
     * --------------------------------------------------------- */

    abort() {
        try {
            this._session?.abort();
        } catch (e) {
            logError(e);
        }
    }

    destroy() {
        this.abort();
        this._session = null;
    }

    /* ---------------------------------------------------------
     * 1. IP GEOLOCATION
     * --------------------------------------------------------- */

    async getCurrentLocation() {
        if (!this._session)
            return null;

        const provider = this._settings.get_enum('ipgeo-provider');

        if (provider === IP_API)
            return await this._tryIpApi() ?? await this._tryIpInfo();

        return await this._tryIpInfo() ?? await this._tryIpApi();
    }

    async _tryIpApi() {
        try {
            const json = await this._getJson('https://ipapi.co/json/');
            if (!this._session) return null;

            if (json?.city && json?.latitude && json?.longitude) {
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
        } catch (e) {
            log('ipapi.co failed: ' + e.message);
        }

        return null;
    }

    async _tryIpInfo() {
        try {
            const json = await this._getJson('https://ipinfo.io/json');
            if (!this._session) return null;

            if (json?.loc) {
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
            }
        } catch (e) {
            log('ipinfo.io failed: ' + e.message);
        }

        return null;
    }

    /* ---------------------------------------------------------
     * 2. REVERSE GEOCODING
     * --------------------------------------------------------- */

    async reverseGeocode(loc) {
        if (!this._session)
            return null;

        if (!loc?.lat || !loc?.lon)
            return null;

        const provider = this._settings.get_enum('geocoding-provider');

        if (provider === GEO_OPEN_METEO) {
            const result = await this._reverseGeocodeOpenMeteo(loc);
            if (result?.name !== 'Unknown')
                return result;

            return await this._reverseGeocodeNominatim(loc);
        }

        const result = await this._reverseGeocodeNominatim(loc);
        if (result?.name !== 'Unknown')
            return result;

        return await this._reverseGeocodeOpenMeteo(loc);
    }

    async _reverseGeocodeNominatim(loc) {
        const url =
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${loc.lat}&lon=${loc.lon}&addressdetails=1`;

        const json = await this._getJson(url);
        if (!this._session)
            return null;

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
                name: name ?? 'Unknown',
                country: addr.country ?? loc.country ?? null,
                lat: loc.lat,
                lon: loc.lon,
            };
        }

        return {
            name: loc.city ?? 'Unknown',
            country: loc.country ?? null,
            lat: loc.lat,
            lon: loc.lon,
        };
    }

    async _reverseGeocodeOpenMeteo(loc) {
        const url =
            `https://geocoding-api.open-meteo.com/v1/reverse?` +
            `latitude=${loc.lat}&longitude=${loc.lon}&language=en&format=json`;

        const json = await this._getJson(url);
        if (!this._session)
            return null;

        if (json?.results?.length > 0) {
            const r = json.results[0];

            return {
                name: this._buildDisplayName(r),
                country: r.country ?? null,
                lat: loc.lat,
                lon: loc.lon,
                raw: r,
            };
        }

        return {
            name: loc.city ?? 'Unknown',
            country: loc.country ?? null,
            lat: loc.lat,
            lon: loc.lon,
        };
    }

    /* ---------------------------------------------------------
     * 3. FORWARD GEOCODING
     * --------------------------------------------------------- */

    async searchCity(query) {
        if (!this._session)
            return [];

        if (!query?.trim())
            return [];

        const provider = this._settings.get_enum('geocoding-provider');

        if (provider === GEO_OPEN_METEO) {
            const results = await this._searchOpenMeteo(query);
            if (results.length > 0)
                return results;

            return await this._searchNominatim(query);
        }

        const results = await this._searchNominatim(query);
        if (results.length > 0)
            return results;

        return await this._searchOpenMeteo(query);
    }

    async _searchNominatim(query) {
        const url =
            `https://nominatim.openstreetmap.org/search?` +
            `format=json&addressdetails=1&limit=10&q=${encodeURIComponent(query)}`;

        const json = await this._getJson(url);
        if (!this._session)
            return [];

        if (!Array.isArray(json))
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

    async _searchOpenMeteo(query) {
        const url =
            `https://geocoding-api.open-meteo.com/v1/search?` +
            `name=${encodeURIComponent(query)}&count=10&language=en&format=json`;

        const json = await this._getJson(url);
        if (!this._session)
            return [];

        if (!json?.results)
            return [];

        return json.results.map(r => ({
            name: this._buildDisplayName(r),
            country: r.country ?? null,
            lat: r.latitude,
            lon: r.longitude,
            raw: r,
        }));
    }

    /* ---------------------------------------------------------
     * HELPERS
     * --------------------------------------------------------- */

    _getJson(url) {
        return new Promise(resolve => {
            if (!this._session)
                return resolve(null);

            const msg = new Soup.Message({
                method: 'GET',
                uri: GLib.Uri.parse(url, GLib.UriFlags.NONE),
            });

            msg.request_headers.append('User-Agent', 'weatherpanel');

            this._session.send_and_read_async(
                msg,
                GLib.PRIORITY_DEFAULT,
                null,
                (session, res) => {
                    try {
                        if (!this._session)
                            return resolve(null);

                        const bytes = session.send_and_read_finish(res);
                        const text = new TextDecoder().decode(bytes.get_data());
                        resolve(JSON.parse(text));
                    } catch {
                        resolve(null);
                    }
                }
            );
        });
    }

    _buildDisplayName(r) {
        return (
            r.name ||
            r.city ||
            r.town ||
            r.village ||
            r.locality ||
            'Unknown'
        );
    }
}

