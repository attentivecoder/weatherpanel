import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import GObject from 'gi://GObject';

const _ = str => str;

export const LayoutPage = GObject.registerClass(
class OpenWeatherLayoutPage extends Adw.PreferencesPage {

    _init(settings) {
        super._init({
            title: _('Layout'),
            icon_name: 'preferences-other-symbolic',
            name: 'LayoutPage',
        });

        this._settings = settings;

        this._buildPanel();
        this._buildPopup();
        this._buildForecast();
    }

    _buildPanel() {
        const group = new Adw.PreferencesGroup({
            title: _('Panel'),
        });

        const panelPositions = new Gtk.StringList();
        panelPositions.append(_('Far Left'));
        panelPositions.append(_('Left'));
        panelPositions.append(_('Center'));
        panelPositions.append(_('Right'));
        panelPositions.append(_('Far Right'));

        const panelPositionRow = new Adw.ComboRow({
            title: _('Position In Panel'),
            model: panelPositions,
            selected: this._settings.get_enum('position-in-panel'),
        });        

        const tempSwitch = new Gtk.Switch({
            active: this._settings.get_boolean('show-text-in-panel'),
            valign: Gtk.Align.CENTER,
        });

        const tempRow = new Adw.ActionRow({
            title: _('Temperature In Panel'),
        });
        tempRow.add_suffix(tempSwitch);

        const condSwitch = new Gtk.Switch({
            active: this._settings.get_boolean('show-comment-in-panel'),
            valign: Gtk.Align.CENTER,
        });

        const condRow = new Adw.ActionRow({
            title: _('Conditions In Panel'),
        });
        condRow.add_suffix(condSwitch);

        group.add(panelPositionRow);
        group.add(tempRow);
        group.add(condRow);

        this.add(group);

        panelPositionRow.connect('notify::selected', w => {
            const pos = w.selected;
            this._settings.set_enum('position-in-panel', pos);
        });

        tempSwitch.connect('notify::active', w =>
            this._settings.set_boolean('show-text-in-panel', w.get_active())
        );

        condSwitch.connect('notify::active', w =>
            this._settings.set_boolean('show-comment-in-panel', w.get_active())
        );
    }

    _buildPopup() {
        const group = new Adw.PreferencesGroup({
            title: _('Popup'),
        });

        const scale = new Gtk.Scale({
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 100,
                step_increment: 1,
                page_increment: 5,
                value: this._settings.get_double('menu-alignment'),
            }),
            width_request: 200,
        });

        const row = new Adw.ActionRow({
            title: _('Popup Position'),
        });
        row.add_suffix(scale);

        const windSwitch = new Gtk.Switch({
            active: this._settings.get_boolean('wind-direction'),
            valign: Gtk.Align.CENTER,
        });

        const windRow = new Adw.ActionRow({
            title: _('Wind Direction'),
        });
        windRow.add_suffix(windSwitch);

        group.add(row);
        group.add(windRow);

        this.add(group);

        scale.connect('value-changed', w =>
            this._settings.set_double('menu-alignment', w.get_value())
        );

        windSwitch.connect('notify::active', w =>
            this._settings.set_boolean('wind-direction', w.get_active())
        );
    }

    _buildForecast() {
        const group = new Adw.PreferencesGroup({
            title: _('Forecast'),
        });

        const centerSwitch = new Gtk.Switch({
            active: this._settings.get_boolean('center-forecast'),
            valign: Gtk.Align.CENTER,
        });

        const centerRow = new Adw.ActionRow({
            title: _("Center Forecast"),
        });
        centerRow.add_suffix(centerSwitch);

        group.add(centerRow);
        this.add(group);

        centerSwitch.connect('notify::active', w =>
            this._settings.set_boolean('center-forecast', w.get_active())
        );
    }
});
