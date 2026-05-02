import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import Settings from './settings.js';
import WeatherProvider from './providers/openMeteo.js';
import PanelButton from './ui/PanelButton.js';

export default class Controller {
    constructor(extension) {
        this._extension = extension;

        this._settings = new Settings(extension);

        this._provider = null;
        this._panelButton = null;

        this._signals = [];

        this._currentTimer = 0;
        this._forecastTimer = 0;
    }

    enable() {
        this._initProvider();
        this._initPanelButton();

        this._bindSettingsSignals();

        this._provider.start();
        this._panelButton.start();

        this._startTimers();

        this._insertPanelButton();
    }

    _insertPanelButton() {
        const pos = this._settings.get_enum('position-in-panel');

        const boxes = [
            Main.panel._leftBox,
            Main.panel._leftBox,
            Main.panel._centerBox,
            Main.panel._rightBox,
            Main.panel._rightBox,
        ];

        const box = boxes[pos];

        let index = 0;
        if (pos === 1) index = 1;
        if (pos === 4) index = box.get_n_children();

        const oldParent = this._panelButton.actor.get_parent();
        if (oldParent)
            oldParent.remove_child(this._panelButton.actor);

        box.insert_child_at_index(this._panelButton.actor, index);
    }
    
    _reapplyPanelPosition() {
        if (!this._panelButton)
            return;

        this._insertPanelButton();
    }

    _bindSettingsSignals() {
        const settings = this._settings._settings;

        const id = settings.connect('changed', (_, key) => {

            if (
                key === 'unit' ||
                key === 'wind-speed-unit' ||
                key === 'pressure-unit'
            ) {
                this._panelButton?.update?.();
                return;
            }

            if (key === 'disable-forecast') {
                this._panelButton?.refresh?.();
                this._startTimers();
                return;
            }

            if (
                key === 'refresh-interval-current' ||
                key === 'refresh-interval-forecast'
            ) {
                this._startTimers();
                return;
            }

            if (
                key === 'position-in-panel' ||
                key === 'position-index'
            ) {
                this._reapplyPanelPosition();
                return;
            }
        });

        this._signals.push([settings, id]);
    }

    _startTimers() {
        this._stopTimers();

        const currentInterval = this._settings.get_int('refresh-interval-current');
        const forecastInterval = this._settings.get_int('refresh-interval-forecast');
        const disableForecast = this._settings.get_boolean('disable-forecast');

        this._currentTimer = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            currentInterval,
            () => {
                this._provider.refresh(true);
                return GLib.SOURCE_CONTINUE;
            }
        );

        if (!disableForecast) {
            this._forecastTimer = GLib.timeout_add_seconds(
                GLib.PRIORITY_DEFAULT,
                forecastInterval,
                () => {
                    this._provider.refresh(false);
                    return GLib.SOURCE_CONTINUE;
                }
            );
        }
    }

    _stopTimers() {
        if (this._currentTimer) {
            GLib.source_remove(this._currentTimer);
            this._currentTimer = 0;
        }

        if (this._forecastTimer) {
            GLib.source_remove(this._forecastTimer);
            this._forecastTimer = 0;
        }
    }

    _initProvider() {
        this._provider = new WeatherProvider({
            settings: this._settings,
        });
    }

    _initPanelButton() {
        this._panelButton = new PanelButton({
            settings: this._settings,
            provider: this._provider,
            extension: this._extension,
        });
    }

    disable() {
        this._stopTimers();

        this._disconnectSignals();

        if (this._panelButton) {
            this._panelButton.stop();
            this._panelButton.destroy();
            this._panelButton = null;
        }

        if (this._provider) {
            this._provider.stop();
            this._provider = null;
        }
    }

    _disconnectSignals() {
        for (const [obj, id] of this._signals) {
            try {
                obj.disconnect(id);
            } catch (_) {}
        }
        this._signals = [];
    }
}

