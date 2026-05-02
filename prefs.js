import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import  SettingsPage  from './preferences/settingsPage.js';
import  LocationsPage  from './preferences/locationsPage.js';

export default class OpenWeatherPrefs extends ExtensionPreferences {

    fillPreferencesWindow(window) {
        const display = Gdk.Display.get_default();
        const iconTheme = Gtk.IconTheme.get_for_display(display);

        const mediaPath = `${this.path}/media`;

        if (!iconTheme.get_search_path().includes(mediaPath)) {
            iconTheme.add_search_path(mediaPath);
        }

        const settings = this.getSettings();

        const settingsPage = new SettingsPage(settings);
        const extension = this._extension;
        const locationsPage = new LocationsPage(window, settings, extension);

        const prefsWidth = settings.get_int('prefs-default-width');
        const prefsHeight = settings.get_int('prefs-default-height');

        window.set_default_size(prefsWidth, prefsHeight);
        window.search_enabled = true;

        window.add(settingsPage.page);
        window.add(locationsPage.page);

        window.connect('close-request', () => {
            const [width, height] = window.get_size();

            if (width !== prefsWidth || height !== prefsHeight) {
                settings.set_int('prefs-default-width', width);
                settings.set_int('prefs-default-height', height);
            }
        });
    }
}

