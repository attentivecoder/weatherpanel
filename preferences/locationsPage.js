import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Soup from 'gi://Soup?version=3.0';

import { GeolocationService } from '../services/geolocation.js';

const { gettext: _ } = imports.gettext;

export default class LocationsPage {
    constructor(parent, settings, extension) {
        this._window = parent;
        this._settings = settings;
        this._extension = extension;
        this._geolocation = new GeolocationService();

        this._actualCity = this._settings.get_int('actual-city');
        this._selectedResult = null;
        this._rows = [];

        this.page = new Adw.PreferencesPage({
            title: _('Locations'),
            icon_name: 'find-location-symbolic',
            name: 'LocationsPage',
        });

        const addLocationButton = new Gtk.Button({
            child: new Adw.ButtonContent({
                icon_name: 'list-add-symbolic',
                label: _('Add'),
            }),
        });

        const useLocationButton = new Gtk.Button({
            child: new Adw.ButtonContent({
                icon_name: 'find-location-symbolic',
                label: _('Use approximate location'),
            }),
        });

        const headerBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6,
        });

        headerBox.append(useLocationButton);
        headerBox.append(addLocationButton);

        this.locationsGroup = new Adw.PreferencesGroup({
            title: _('Locations'),
            header_suffix: headerBox,
        });

        this.page.add(this.locationsGroup);

        addLocationButton.connect('clicked', () => this._openAddDialog());
        useLocationButton.connect('clicked', () => this._useCurrentLocation());

        this._refreshLocations();

        this._settings.connect('changed', () => {
            this._actualCity = this._settings.get_int('actual-city');
            this._refreshLocations();
        });
    }

    _getCities() {
        try {
            const raw = this._settings.get_string('city');
            if (!raw)
                return [];

            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            logError(e);
            return [];
        }
    }

    _setCities(list) {
        this._settings.set_string('city', JSON.stringify(list));
    }

    _isSameLocation(a, b) {
        if (!a || !b)
            return false;

        const latDiff = Math.abs(Number(a.lat) - Number(b.lat));
        const lonDiff = Math.abs(Number(a.lon) - Number(b.lon));

        return latDiff < 0.01 && lonDiff < 0.01;
    }

    async _useCurrentLocation() {
        try {
            const loc = await this._geolocation.getCurrentLocation();
            const city = await this._geolocation.reverseGeocode(loc);

            if (!city)
                throw new Error('No city returned');

            let cities = this._getCities();

            const existingIndex = cities.findIndex(c => this._isSameLocation(c, city));

            if (existingIndex !== -1) {
                this._settings.set_int('actual-city', existingIndex);

                this._window.add_toast(new Adw.Toast({
                    title: _('Location already exists — selected'),
                }));

                this._refreshLocations();
                return;
            }

            cities.push(city);
            this._setCities(cities);
            this._settings.set_int('actual-city', cities.length - 1);

            this._window.add_toast(new Adw.Toast({
                title: _('Location added'),
            }));

            this._refreshLocations();

        } catch (e) {
            logError(e);
            this._window.add_toast(new Adw.Toast({
                title: _('Failed to get location'),
            }));
        }
    }

    _refreshLocations() {
        for (const row of this._rows)
            this.locationsGroup.remove(row);

        this._rows = [];

        const cities = this._getCities();

        if (!cities.length)
            return;

        cities.forEach((city, i) => {
            const isActive = i === this._actualCity;

            const row = new Adw.ActionRow({
                title: city.name ?? 'Unknown',
                subtitle: `${city.lat}, ${city.lon}`,
                icon_name: isActive
                    ? 'checkbox-checked-symbolic'
                    : 'checkbox-symbolic',
                activatable: true,
            });

            const box = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                spacing: 6,
                halign: Gtk.Align.CENTER,
            });

            const editBtn = new Gtk.Button({ icon_name: 'document-edit-symbolic' });
            const delBtn = new Gtk.Button({
                icon_name: 'edit-delete-symbolic',
                css_classes: ['error'],
            });

            box.append(editBtn);
            box.append(delBtn);
            row.add_suffix(box);

            this.locationsGroup.add(row);
            this._rows.push(row);

            row.connect('activated', () => {
                if (this._actualCity === i)
                    return;

                this._actualCity = i;
                this._settings.set_int('actual-city', i);

                this._refreshLocations();

                this._window.add_toast(new Adw.Toast({
                    title: _('Location changed'),
                }));
            });

            editBtn.connect('clicked', () => this._openEditDialog(i));
            delBtn.connect('clicked', () => this._deleteLocation(i));
        });
    }

    _openAddDialog() {
        this._openSearchDialog({
            title: _('Add Location'),
            onSelect: (entry) => this._addLocation(entry),
        });
    }

    _addLocation(entry) {
        const cities = this._getCities();

        const existingIndex = cities.findIndex(c =>
            this._isSameLocation(c, entry)
        );

        if (existingIndex !== -1) {
            this._settings.set_int('actual-city', existingIndex);

            this._window.add_toast(new Adw.Toast({
                title: _('Location already exists — selected'),
            }));

            return;
        }

        cities.push({
            name: entry.name,
            lat: entry.lat,
            lon: entry.lon,
        });

        this._setCities(cities);

        this._window.add_toast(new Adw.Toast({
            title: _('Location added'),
        }));
    }

    _openEditDialog(index) {
        const cities = this._getCities();
        const current = cities[index];

        if (!current)
            return;

        this._openSearchDialog({
            title: _('Edit Location'),
            initialText: current.name,
            onSelect: (entry) => {
                cities[index] = {
                    name: entry.name,
                    lat: entry.lat,
                    lon: entry.lon,
                };

                this._setCities(cities);

                this._window.add_toast(new Adw.Toast({
                    title: _('Location updated'),
                }));
            },
        });
    }

    _deleteLocation(index) {
        const cities = this._getCities();

        cities.splice(index, 1);
        this._setCities(cities);

        if (this._actualCity >= cities.length)
            this._settings.set_int('actual-city', 0);

        this._window.add_toast(new Adw.Toast({
            title: _('Location removed'),
        }));
    }

    _openSearchDialog({ title, initialText = '', onSelect }) {
        const dialog = new Gtk.Dialog({
            title,
            transient_for: this._window,
            modal: true,
        });

        dialog.set_default_size(420, 360);

        const addButton = dialog.add_button(_('Add'), Gtk.ResponseType.OK);
        dialog.add_button(_('Close'), Gtk.ResponseType.CLOSE);

        addButton.set_sensitive(false);

        const content = dialog.get_content_area();

        const vbox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12,
        });

        const entry = new Gtk.Entry({
            placeholder_text: _('Search city…'),
            text: initialText,
        });

        const scrolled = new Gtk.ScrolledWindow({ vexpand: true });
        const list = new Gtk.ListBox();
        list.set_selection_mode(Gtk.SelectionMode.SINGLE);

        scrolled.set_child(list);

        vbox.append(entry);
        vbox.append(scrolled);
        content.append(vbox);

        this._selectedResult = null;

        list.connect('row-selected', (_b, row) => {
            if (!row) {
                addButton.set_sensitive(false);
                this._selectedResult = null;
                return;
            }

            this._selectedResult = row._resultData;
            addButton.set_sensitive(true);
        });

        let timeout = null;

        entry.connect('changed', () => {
            if (timeout)
                GLib.source_remove(timeout);

            timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
                this._searchCity(entry.text, list);
                return GLib.SOURCE_REMOVE;
            });
        });

        dialog.connect('response', (dlg, response) => {
            if (response === Gtk.ResponseType.OK && this._selectedResult)
                onSelect(this._selectedResult);

            dlg.destroy();
        });

        dialog.show();

        if (initialText.length)
            this._searchCity(initialText, list);
    }

    async _searchCity(query, list) {
        let child;
        while ((child = list.get_first_child()) !== null)
            list.remove(child);

        if (!query.length)
            return;

        if (!Gio.NetworkMonitor.get_default().get_network_available()) {
            list.append(new Adw.ActionRow({
                title: _('Unable to search — no internet connection'),
            }));
            return;
        }

        const url =
            `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&q=${encodeURIComponent(query)}`;

        try {
            const session = Soup.Session.new();
            const msg = Soup.Message.new('GET', url);

            msg.request_headers.append("User-Agent", "weatherpanel-extension");

            const bytes = await new Promise((resolve, reject) => {
                session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null, (s, res) => {
                    try {
                        resolve(s.send_and_read_finish(res));
                    } catch (e) {
                        reject(e);
                    }
                });
            });

            const text = new TextDecoder().decode(bytes.get_data());
            let results = JSON.parse(text);

            if (!results.length) {
                list.append(new Adw.ActionRow({
                    title: _('No results found'),
                }));
                return;
            }

            for (const r of results) {
                const title = r.display_name;
                const subtitle = `${r.lat}, ${r.lon}`;

                const row = new Adw.ActionRow({
                    title,
                    subtitle,
                    activatable: true,
                });

                row._resultData = {
                    name: title,
                    lat: parseFloat(r.lat),
                    lon: parseFloat(r.lon),
                };

                list.append(row);
            }

            list.show();

        } catch (e) {
            log(`Search failed: ${e.message}`);

            list.append(new Adw.ActionRow({
                title: _('Unable to search — service unavailable'),
            }));
        }
    }

    destroy() {
        this.page.destroy();
    }
}

