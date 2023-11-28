export class EventBase {
    _eventcbs: any[];
    _getEventList(event: any): any;
    on(event: any, cb: any): void;
    fire(event: any, data: any): void;
}
