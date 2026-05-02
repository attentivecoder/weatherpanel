export class Cache {
    constructor(ttl = 600000) {
        this._ttl = ttl;
        this._store = new Map();
    }

    set(key, value) {
        this._store.set(key, {
            value,
            timestamp: Date.now()
        });
    }

    get(key) {
        const entry = this._store.get(key);
        if (!entry) return null;

        if (Date.now() - entry.timestamp > this._ttl) {
            this._store.delete(key);
            return null;
        }

        return entry.value;
    }

    clear() {
        this._store.clear();
    }
}
