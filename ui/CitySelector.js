import St from 'gi://St';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

export default class CitySelector {
    constructor({ settings, onCityChanged }) {
        this._settings = settings;
        this._onCityChanged = onCityChanged;

        this._cities = [];
        this._activeIndex = 0;

        // The actual submenu actor
        this.actor = new PopupMenu.PopupSubMenuMenuItem('');

        this.menu = this.actor.menu;

        this._reload();
        this._buildMenu();
    }

    /* ------------------------------------------------------ */
    /* PUBLIC API                                              */
    /* ------------------------------------------------------ */

    refresh() {
        this._reload();
        this._rebuild();
    }

    setActiveIndex(index) {
        if (index < 0 || index >= this._cities.length)
            return;

        this._activeIndex = index;
        this._settings.set_int('actual-city', index);

        if (this._onCityChanged)
            this._onCityChanged(this.getActiveCity());
    }

    getActiveCity() {
        return this._cities[this._activeIndex] ?? null;
    }

    /* ------------------------------------------------------ */
    /* INTERNAL: DATA                                          */
    /* ------------------------------------------------------ */

    _reload() {
        const raw = this._settings.get_string('city') ?? '';

        this._cities = raw
            .split(' && ')
            .map(c => this._parseCity(c))
            .filter(Boolean);

        const saved = this._settings.get_int('actual-city');

        this._activeIndex =
            saved >= 0 && saved < this._cities.length
                ? saved
                : 0;
    }

    _parseCity(entry) {
        if (!entry || !entry.includes('>'))
            return null;

        const [coords, name] = entry.split('>');
        const [lat, lon] = coords.split(',');

        if (!lat || !lon || isNaN(lat) || isNaN(lon))
            return null;

        return {
            name: name?.trim() || 'Unknown',
            coords: {
                lat: Number(lat),
                lon: Number(lon),
            },
            raw: entry,
        };
    }

    /* ------------------------------------------------------ */
    /* UI                                                      */
    /* ------------------------------------------------------ */

    _buildMenu() {
        this.menu.removeAll();
        this._items = [];

        this._cities.forEach((city, index) => {
            const item = new PopupMenu.PopupMenuItem(city.name);

            if (index === this._activeIndex)
                item.setOrnament(PopupMenu.Ornament.DOT);

            item.connect('activate', () => {
                this.setActiveIndex(index);
                this._rebuild();
            });

            this.menu.addMenuItem(item);
            this._items.push(item);
        });

        // Hide if only one city
        if (this._cities.length <= 1)
            this.actor.hide();
        else
            this.actor.show();
    }

    _rebuild() {
        this._buildMenu();
    }

    destroy() {
        this.actor.destroy();
    }
}

