/*
message bus system.  it's for more fundamental cases
then the dependency graph can (or should) handle.

the system used pseudo-weak-references by, instead of
passing subscriber owner references directly, a callback
function that returns owners is passed instead; if it
returns undefined owner is assumed to be unreferenced.

We strongly enforce event type names.  Emitter classes
must register themselves, and include a list of valid
events in their busDefine static method:

class EmitterClass {
  static busDefine() {
    return {
      events : ["REGISTER", "BLEH", "UNREGISTER"]
    }
  }
}

import messageBus from 'core/bus.js'

messageBug.register(EmitterClass)

*/
export class Subscriber {
  constructor(getter_cb, sourceClass, events, callback, priority) {
    this.getter = getter_cb;
    this.events = events;
    this.callback = callback;
    this.sourceClass = sourceClass;
    this.priority = priority;
  }
}

export class BusMessage {
  constructor(sourceClass, key, data) {
    this.event = key;
    this.data = data;
    this.sourceClass = sourceClass;
    this.target = undefined;
  }
}

export class EmitterClassIF {
  static busDefine() {
    return {
      events : [] //e.g. ["REGISTER", "UNREGISTER"]
    }
  }
}

export class MessageBus {
  constructor() {
    this.subscribers = [];
    this.emitters = []; //list of classes
  }

  register(emitter) {
    let def = emitter.busDefine();
    this.emitters.push(emitter);
  }

  /** getter_cb is a function that returns
   * subscriber object */
  subscribe(getter_cb, sourceClass, callback, events="ANY", priority=100000) {
    if (events === "ANY") {
      events = new Set(["ANY"]);
    } else {
      if (typeof events === "string") {
        events = new Set([events]);
      } else {
        events = new Set(events);
      }
    }

    for (let event of events) {
      if (event === "ANY") {
        continue;
      }

      if (!this.isValidEvent(sourceClass, event)) {
        throw new Error("invalid message type " + event);
      }
    }

    let sub = new Subscriber(getter_cb, sourceClass, events, callback, priority);
    this.subscribers.push(sub);

    this.sortSubscribers();

    return sub;
  }

  validateSubscribers() {
    for (let sb of new Set(this.subscribers)) {
      if (!sb.getter()) {
        console.warn("Dead subscriber", sb);
        this.subscribers.remove(sb);
      }
    }
  }

  unsubscribe(sub) {
    if (this.subscribers.indexOf(sub) >= 0) {
      this.subscribers.remove(sub);
    }

    this.sortSubscribers();

    return this;
  }

  sortSubscribers() {
    this.subscribers.sort((a, b) => a.priority - b.priority);
    return this;
  }

  isValidEvent(sourceClass, messageType) {
    let types = sourceClass.busDefine().events;

    let ok = false;
    for (let type of types) {
      if (type === messageType) {
        ok = true;
      }
    }

    if (!ok) {
      console.warn("Invalid message type " + messageType, "valid ones are", types);
    }

    return ok;
  }

  emit(sourceClass, messageType, data) {
    if (!this.isValidEvent(sourceClass, messageType)) {
      throw new Error("invalid message type " + messageType);
    }

    window.setTimeout(() => {
      this.emitSync(...arguments);
    }, 0);
  }

  emitSync(sourceClass, messageType, data) {
    let msg = new BusMessage(sourceClass, messageType, data);

    let del = undefined;

    for (let sb of this.subscribers) {
      let ok = sb.sourceClass === sourceClass;
      ok = ok && (sb.events.has("ALL") || sb.events.has(messageType));

      if (!ok) {
        continue;
      }

      let owner;

      try {
        owner = sb.getter();
      } catch (error) {
        owner = undefined;
        console.log(error.stack);
        console.log(error.message);
      }

      if (!owner) {
        //dead owner
        console.warn("Dead subscriber", sb);
        if (!del) {
          del = [sb];
        } else {
          del.push(sb);
        }

        continue;
      }


      msg.target = owner;

      try {
        sb.callback(msg);
      } catch (error) {
        console.log(error.stack);
        console.log(error.message);
      }
    }

    msg.target = undefined;

    if (del) {
      for (let sb of del) {
        this.subscribers.remove(sb);
      }
    }
  }
}

export default new MessageBus();
