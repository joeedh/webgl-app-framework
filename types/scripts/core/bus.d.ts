export class Subscriber {
  constructor(getter_cb: any, sourceClass: any, events: any, callback: any, priority: any);

  getter: any;
  events: any;
  callback: any;
  sourceClass: any;
  priority: any;
}

export class BusMessage {
  constructor(sourceClass: any, key: any, data: any);

  event: any;
  data: any;
  sourceClass: any;
  target: any;
}

export class EmitterClassIF {
  static busDefine(): {
    events: any[];
  };
}

export class MessageBus {
  subscribers: any[];
  emitters: any[];

  register(emitter: any): void;

  /** getter_cb is a function that returns
   * subscriber object, or undefined if subscriber is dead. */
  subscribe(getter_cb: any, sourceClass: any, callback: any, events?: string | string[], priority?: number): Subscriber;

  validateSubscribers(): void;

  unsubscribe(sub: any): this;

  sortSubscribers(): this;

  isValidEvent(sourceClass: any, messageType: any): boolean;

  emit(sourceClass: any, messageType: any, data: any): void;

  emitSync(sourceClass: any, messageType: any, data: any): void;
}

declare const _default: MessageBus;
export default _default;
