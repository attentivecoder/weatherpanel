import Clutter from 'gi://Clutter';
import St from 'gi://St';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

export default class CurrentWeather {
    constructor() {
        this.actor = new St.BoxLayout({
            style_class: 'weatherpanel-current-container',
            vertical: false,
            x_expand: true,
        });

        this._buildUI();
    }

    /* ------------------------------------------------------ */
    /* PUBLIC API                                              */
    /* ------------------------------------------------------ */

    setData(data) {
        if (!data)
            return;

        this._location.text = data.location ?? '';
        this._summary.text = data.summary ?? '';

        this._icon.icon_name = data.icon ?? 'view-refresh-symbolic';

        this._temperature.text = data.temperature ?? '—';

        this._feelsLike.text = data.feelsLike ?? '—';
        this._humidity.text = data.humidity ?? '—';
        this._pressure.text = data.pressure ?? '—';
        this._wind.text = data.wind ?? '—';
        this._gusts.text = data.gusts ?? '—';

        this._sunrise.text = data.sunrise ?? '-';
        this._sunset.text = data.sunset ?? '-';

        this._updated.text = data.updated ?? '';
    }

    setLoading() {
        this._summary.text = _('Loading…');
        this._icon.icon_name = 'view-refresh-symbolic';
    }

    /* ------------------------------------------------------ */
    /* UI BUILD                                                */
    /* ------------------------------------------------------ */

    _buildUI() {
        this._icon = new St.Icon({
            icon_size: 96,
            icon_name: 'view-refresh-symbolic',
            style_class: 'weatherpanel-current-icon',
        });

        this._location = new St.Label({ text: '' });
        this._summary = new St.Label({ text: _('Loading…') });
        this._temperature = new St.Label({ text: '' });

        this._feelsLike = new St.Label({ text: '' });
        this._humidity = new St.Label({ text: '' });
        this._pressure = new St.Label({ text: '' });
        this._wind = new St.Label({ text: '' });
        this._gusts = new St.Label({ text: '' });

        this._sunrise = new St.Label({ text: '-' });
        this._sunset = new St.Label({ text: '-' });
        this._updated = new St.Label({ text: '' });

        /* Summary column */
        const summaryBox = new St.BoxLayout({
            vertical: true,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
        });

        summaryBox.add_child(this._location);
        summaryBox.add_child(this._summary);
        summaryBox.add_child(this._temperature);

        /* Details column */
        const details = new St.BoxLayout({
            vertical: true,
            style_class: 'weatherpanel-current-details',
        });

        details.add_child(this._row(_('Feels Like'), this._feelsLike));
        details.add_child(this._row(_('Humidity'), this._humidity));
        details.add_child(this._row(_('Pressure'), this._pressure));
        details.add_child(this._row(_('Wind'), this._wind));
        details.add_child(this._row(_('Gusts'), this._gusts));
        details.add_child(this._row(_('Sunrise'), this._sunrise));
        details.add_child(this._row(_('Sunset'), this._sunset));
        details.add_child(this._row(_('Updated'), this._updated));

        /* Left column */
        const left = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            style_class: 'weatherpanel-current-left',
        });

        left.add_child(this._icon);
        left.add_child(summaryBox);

        /* Final layout */
        this.actor.add_child(left);
        this.actor.add_child(details);
    }

    _row(label, valueActor) {
        const box = new St.BoxLayout({ style_class: 'weatherpanel-row' });

        const l = new St.Label({ text: `${label}: ` });
        box.add_child(l);
        box.add_child(valueActor);

        return box;
    }

    destroy() {
        this.actor.destroy();
    }
}

