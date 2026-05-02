import St from 'gi://St';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

export default class ButtonBar {
    constructor(controller) {
        this._controller = controller;

        // The actual menu item actor
        this.actor = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
        });

        this._box = new St.BoxLayout({
            style_class: 'weatherpanel-button-bar',
            x_expand: true,
        });

        this.actor.add_child(this._box);

        this._buildButtons();
    }

    /* ------------------------------------------------------ */
    /* BUTTONS                                                 */
    /* ------------------------------------------------------ */

    _buildButtons() {
        this._locationButton = this._makeButton('find-location-symbolic', 'Locations');
        this._refreshButton  = this._makeButton('view-refresh-symbolic', 'Refresh');
        this._prefsButton    = this._makeButton('preferences-system-symbolic', 'Settings');
        this._openUrlButton  = this._makeButton('web-browser-symbolic', 'Open provider');

        this._box.add_child(this._locationButton);
        this._box.add_child(this._refreshButton);
        this._box.add_child(this._openUrlButton);
        this._box.add_child(this._prefsButton);

        this._locationButton.connect('clicked', () => {
            this._controller?.toggleCitySelector();
        });

        this._refreshButton.connect('clicked', () => {
            this._controller?.requestRefresh();
        });

        this._prefsButton.connect('clicked', () => {
            this._controller?.openPreferences();
        });

        this._openUrlButton.connect('clicked', () => {
            this._controller?.openProviderUrl();
        });
    }

    _makeButton(iconName, tooltip) {
        const btn = new St.Button({
            reactive: true,
            can_focus: true,
            track_hover: true,
            style_class: 'weatherpanel-button',
            accessible_name: tooltip,
        });

        btn.child = new St.Icon({
            icon_name: iconName,
            style_class: 'weatherpanel-button-icon',
        });

        return btn;
    }

    /* ------------------------------------------------------ */
    /* PUBLIC API                                              */
    /* ------------------------------------------------------ */

    setRefreshEnabled(enabled) {
        this._refreshButton.reactive = enabled;
        this._refreshButton.opacity = enabled ? 255 : 120;
    }

    destroy() {
        this.actor.destroy();
    }
}

