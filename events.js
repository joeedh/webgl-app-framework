//handle to module.  never access in code; for debug console use only.
var _events = {};

define([], function() {
  "use strict";

  var exports = _events = {};
  
  var DomEventTypes = exports.DomEventTypes = {
    on_mousemove   : 'mousemove',
    on_mousedown   : 'mousedown',
    on_mouseup     : 'mouseup',
    on_touchstart  : 'touchstart',
    on_touchcancel : 'touchcanel',
    on_touchmove   : 'touchmove',
    on_touchend    : 'touchend',
    on_mousewheel  : 'mousewheel',
    on_keydown     : 'keydown',
    on_keyup       : 'keyup',
    //on_keypress    : 'keypress'
  }

  var EventHandler = exports.EventHandler = class EventHandler {
    constructor() {
    }
    
    pushModal(dom) {
      if (this.modal_pushed) {
        console.trace("Error: pushModal called twice", this, dom);
        return;
      }
      
      var this2 = this;
      this.modal_pushed = true;
      
      function stop_prop(func) {
        return function(e) {
          func.call(this2, e);
          
          e.stopPropagation();
          e.preventDefault();
          
          return false;
        };
      }
      
      for (var k in DomEventTypes) {
        var type = DomEventTypes[k];
        
        if (this[k] == undefined)
          continue;
        
        if (this["_"+k] == undefined) {
          this["_"+k] = stop_prop(this[k]);
        }
        
        dom.addEventListener(type, this["_"+k]);
      }
    }
    
    popModal(dom) {
      if (!this.modal_pushed) {
        console.trace("Error: popModal called but pushModal wasn't", this, dom);
        return;
      }
      
      for (var k in DomEventTypes) {
        if (this[k] == undefined)
          continue;

        var type = DomEventTypes[k];
        
        dom.removeEventListener(type, this["_"+k]);
      }
      
      this.modal_pushed = false;
    }
  }
  
  return exports;
});
