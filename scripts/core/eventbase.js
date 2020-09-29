export class EventBase {
  constructor() {
    this._eventcbs = [];
  }

  _getEventList(event) {
    if (!(event in this._eventcbs)) {
      this._eventcbs[event] = []
    }

    return this._eventcbs[event];
  }

  on(event, cb) {
    this._getEventList(event).push(cb);
  }

  fire(event, data) {
    for (let cb of this._getEventList(event)) {
      cb(data);
    }
  }
}
