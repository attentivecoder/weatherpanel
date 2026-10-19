import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    UNIT_KEYS,
    getUnit,
    isAutomatic,
    regionalDefault,
} from '../utils/units.js';

export default class SettingsPage {
    constructor(settings) {
        this._settings = settings;

        this.page = new Adw.PreferencesPage({
            title: _('Settings'),
            icon_name: 'preferences-system-symbolic',
            name: 'GeneralPage',
        });

        this._buildPanelSection();
        this._buildGeneral();
        this._buildUnits();
    }

    /* ============================================================
     * GENERAL
     * ============================================================ */

    _buildGeneral() {
        const group = new Adw.PreferencesGroup({
            title: _('General'),
        });

        //
        // Refresh intervals
        //
        const currentSpin = this._spin(
            10, 1440, 1,
            this._settings.get_int('refresh-interval-current') / 60
        );

        currentSpin.connect('value-changed', w =>
            this._settings.set_int(
                'refresh-interval-current',
                60 * w.get_value()
            )
        );

        const forecastSpin = this._spin(
            60, 1440, 1,
            this._settings.get_int('refresh-interval-forecast') / 60
        );

        forecastSpin.connect('value-changed', w =>
            this._settings.set_int(
                'refresh-interval-forecast',
                60 * w.get_value()
            )
        );

        const daysSpin = this._spin(1, 8, 1, this._settings.get_int('days-forecast'));

        daysSpin.connect('value-changed', w =>
            this._settings.set_int('days-forecast', w.get_value())
        );

        const forecastDisabled = this._settings.get_boolean('disable-forecast');
        const forecastSwitch = this._switch(forecastDisabled);

        const updateForecastRows = disabled => {
            forecastSpin.set_sensitive(!disabled);
            daysSpin.set_sensitive(!disabled);
        };

        updateForecastRows(forecastDisabled);

        forecastSwitch.connect('notify::active', w => {
            const active = w.get_active();
            updateForecastRows(active);
            this._settings.set_boolean('disable-forecast', active);
        });

        group.add(this._row(_('Current Weather Refresh (min)'), '', currentSpin));
        group.add(this._row(_('Forecast Refresh (min)'), '', forecastSpin));
        group.add(this._row(_('Disable Forecast'), '', forecastSwitch));
        group.add(this._row(_('Forecast Days'), _('Including today'), daysSpin));

        //
        // Weather Provider
        //
        const weatherProviderRow = new Adw.ComboRow({
            title: _("Weather Provider"),
            subtitle: _("Choose which API to fetch weather data from"),
            model: Gtk.StringList.new(["Open‑Meteo", "Yr.no"]),
            selected: this._settings.get_enum("provider"),
        });

        weatherProviderRow.connect("notify::selected", row => {
            this._settings.set_enum("provider", row.selected);
        });

        group.add(weatherProviderRow);

        //
        // Location Search Provider
        //
        const locationSearchRow = new Adw.ComboRow({
            title: _("Location Search Provider"),
            subtitle: _("Choose how location search behaves"),
            model: Gtk.StringList.new([
                "OpenStreetMap",
                "Open‑Meteo"
            ]),
            selected: this._settings.get_enum("geocoding-provider"),
        });


        locationSearchRow.connect("notify::selected", row => {
            this._settings.set_enum("geocoding-provider", row.selected);
        });

        group.add(locationSearchRow);

        //
        // IP Geolocation Provider
        //
        const ipGeoRow = new Adw.ComboRow({
            title: _("IP Geolocation Provider"),
            subtitle: _("Choose how your approximate location is detected"),
            model: Gtk.StringList.new(["ipapi.co", "ipinfo.io"]),
            selected: this._settings.get_enum("ipgeo-provider"),
        });

        ipGeoRow.connect("notify::selected", row => {
            this._settings.set_enum("ipgeo-provider", row.selected);
        });

        group.add(ipGeoRow);

        this.page.add(group);
    }

    /* ============================================================
     * UNITS
     * ============================================================ */

    _buildUnits() {
        const group = new Adw.PreferencesGroup({
            title: _('Units'),
            description: _('“Automatic” uses the units common in your region.'),
        });

        const labels = {
            'celsius': '°C',
            'fahrenheit': '°F',
            'kelvin': 'K',
            'kmh': 'km/h',
            'mph': 'mph',
            'ms': 'm/s',
            'knots': _('knots'),
            'beaufort': _('Beaufort'),
            'hpa': 'hPa',
            'inhg': 'inHg',
            'bar': 'bar',
            'mmhg': 'mmHg',
            'kpa': 'kPa',
            'mm': _('Millimeters'),
            'in': _('Inches'),
        };

        group.add(this._createUnitCombo(_('Temperature'), 'unit', labels));
        group.add(this._createUnitCombo(_('Wind Speed'), 'wind-speed-unit', labels));
        group.add(this._createUnitCombo(_('Pressure'), 'pressure-unit', labels));
        group.add(this._createUnitCombo(_('Precipitation'), 'precipitation-unit', labels));

        const decimalsSpin = this._spin(0, 2, 1, this._settings.get_int('decimal-places'));

        decimalsSpin.connect('value-changed', w =>
            this._settings.set_int('decimal-places', w.get_value())
        );

        group.add(this._row(_('Decimal Places'), _('For temperature and wind'), decimalsSpin));

        this.page.add(group);
    }

    _buildPanelSection() {
        const group = new Adw.PreferencesGroup({
            title: _('Panel'),
        });

        const positions = new Gtk.StringList();
        positions.append(_('Far Left'));
        positions.append(_('Left'));
        positions.append(_('Center'));
        positions.append(_('Right'));
        positions.append(_('Far Right'));

        const row = new Adw.ComboRow({
            title: _('Position in Panel'),
            model: positions,
            selected: this._settings.get_enum('position-in-panel'),
        });

        row.connect('notify::selected', w =>
            this._settings.set_enum('position-in-panel', w.selected)
        );

        group.add(row);
        this.page.add(group);
    }

    /* ============================================================
     * UNIT COMBO
     * The first entry is "Automatic", which resets the key so the
     * unit follows the region; the others map to the enum values.
     * ============================================================ */

    _createUnitCombo(title, key, labels) {
        const nicks = UNIT_KEYS[key];
        const model = new Gtk.StringList();

        model.append(_('Automatic (%s)').format(labels[regionalDefault(key)]));

        for (const nick of nicks)
            model.append(labels[nick]);

        const combo = new Adw.ComboRow({ title, model });

        combo.selected = isAutomatic(this._settings, key)
            ? 0
            : nicks.indexOf(getUnit(this._settings, key)) + 1;

        combo.connect('notify::selected', w => {
            if (w.selected === 0)
                this._settings.reset(key);
            else
                this._settings.set_enum(key, w.selected - 1);
        });

        return combo;
    }

    /* ============================================================
     * HELPERS
     * ============================================================ */

    _row(title, subtitle, widget) {
        const row = new Adw.ActionRow({
            title,
            subtitle: subtitle ?? '',
        });

        if (widget)
            row.add_suffix(widget);

        return row;
    }

    _spin(min, max, step, value) {
        return new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: min,
                upper: max,
                step_increment: step,
                page_increment: 10,
                value,
            }),
            numeric: true,
            valign: Gtk.Align.CENTER,
        });
    }

    _switch(active) {
        return new Gtk.Switch({
            active,
            valign: Gtk.Align.CENTER,
        });
    }

    destroy() {
        this.page.destroy();
    }
}

