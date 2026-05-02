import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

const _ = str => str;

let metadata = {};

export function setMetadata(meta) {
    metadata = meta ?? {};
}

export const AboutPage = GObject.registerClass(
class OpenWeatherAboutPage extends Adw.PreferencesPage {

    _init() {
        super._init({
            title: _('About'),
            icon_name: 'help-about-symbolic',
            name: 'AboutPage',
        });

        this._buildAboutSection();
        this._buildInfoSection();
        this._buildMaintainerSection();
        this._buildProviderSection();
        this._buildLicenseSection();
    }

    _buildAboutSection() {
        const group = new Adw.PreferencesGroup();

        const box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 10,
        });

        const image = new Gtk.Image({
            icon_name: 'openweather-icon',
            pixel_size: 96,
        });

        const title = new Gtk.Label({
            label: `<b><span size="large">OpenWeather</span></b>`,
            use_markup: true,
        });

        const desc = new Gtk.Label({
            label: 'Display weather information for any location on Earth in GNOME Shell',
            wrap: true,
        });

        box.append(image);
        box.append(title);
        box.append(desc);

        group.add(box);
        this.add(group);
    }

    _buildInfoSection() {
        const group = new Adw.PreferencesGroup();

        const version = metadata.version ?? 'unknown';
        const gitVersion = metadata['git-version'] ?? null;

        const sessionType =
            GLib.getenv('XDG_SESSION_TYPE') === 'wayland'
                ? 'Wayland'
                : 'X11';

        group.add(this._row('OpenWeather Version', version));

        if (gitVersion)
            group.add(this._row('Git Version', gitVersion));

        group.add(this._row('Session Type', sessionType));

        this.add(group);
    }

    _buildMaintainerSection() {
        const group = new Adw.PreferencesGroup();

        const row = new Adw.ActionRow({
            title: 'Maintained by: Jason Oickle',
        });

        const gitlab = new Gtk.LinkButton({
            uri: metadata.url ?? '',
            label: 'GitLab',
        });

        row.add_suffix(gitlab);

        group.add(row);
        this.add(group);
    }

    _buildProviderSection() {
        const group = new Adw.PreferencesGroup();

        group.add(new Adw.ActionRow({
            title: 'Weather Data Provider',
            subtitle: 'OpenWeatherMap',
        }));

        this.add(group);
    }

    _buildLicenseSection() {
        const group = new Adw.PreferencesGroup();

        group.add(new Gtk.Label({
            label: 'This program comes with ABSOLUTELY NO WARRANTY.\nSee the GNU GPL for details.',
            justify: Gtk.Justification.CENTER,
            wrap: true,
        }));

        this.add(group);
    }

    _row(title, value) {
        return new Adw.ActionRow({
            title,
            subtitle: String(value),
        });
    }
});
