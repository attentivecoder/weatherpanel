import Clutter from 'gi://Clutter';

import * as Config from 'resource:///org/gnome/shell/misc/config.js';

const SHELL_MAJOR = parseInt(Config.PACKAGE_VERSION.split('.')[0], 10);

/* ---------------------------
 * BoxLayout orientation
 * `vertical` was deprecated in 48 and removed in 51;
 * `orientation` only exists from 48.
 * -------------------------- */

export function boxOrientation(vertical) {
    if (SHELL_MAJOR >= 48) {
        return {
            orientation: vertical
                ? Clutter.Orientation.VERTICAL
                : Clutter.Orientation.HORIZONTAL,
        };
    }

    return { vertical };
}
