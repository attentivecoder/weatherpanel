import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

const _ = str => str;

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

        const forecastSwitch = this._switch(
            this._settings.get_boolean('disable-forecast')
        );

        forecastSwitch.connect('notify::active', w => {
            const active = w.get_active();
            forecastSpin.set_sensitive(!active);
            this._settings.set_boolean('disable-forecast', active);
        });

        group.add(this._row(_('Current Weather Refresh (min)'), '', currentSpin));
        group.add(this._row(_('Forecast Refresh (min)'), '', forecastSpin));
        group.add(this._row(_('Disable Forecast'), '', forecastSwitch));

        this.page.add(group);
    }

    /* ============================================================
     * UNITS
     * ============================================================ */

    _buildUnits() {
        const group = new Adw.PreferencesGroup({
            title: _('Units'),
        });

        const tempItems = ['°C', '°F', 'K'];
        const windItems = ['km/h', 'mph', 'm/s', 'knots'];
        const pressureItems = ['hPa', 'inHg', 'bar'];

        const temp = this._createCombo(
            _('Temperature'),
            tempItems,
            'unit'
        );

        const wind = this._createCombo(
            _('Wind Speed'),
            windItems,
            'wind-speed-unit'
        );

        const pressure = this._createCombo(
            _('Pressure'),
            pressureItems,
            'pressure-unit'
        );

        group.add(temp);
        group.add(wind);
        group.add(pressure);

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
     * COMBO HELPER
     * ============================================================ */

    _createCombo(title, items, key) {
        const model = new Gtk.StringList();

        for (const item of items)
            model.append(item);

        const combo = new Adw.ComboRow({
            title,
            model,
        });

        combo.selected = this._settings.get_enum(key);

        combo.connect('notify::selected', w =>
            this._settings.set_enum(key, w.selected)
        );

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

