import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import Controller from './controller.js';

export default class WeatherPanel extends Extension {

    enable() {
        this.settings = this.getSettings();

        this._controller = new Controller(this, this.settings);
        this._controller.enable();
    }

    disable() {
        this._controller?.disable();
        this._controller = null;
        
        this.settings = null;
    }
}

