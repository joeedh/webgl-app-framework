/**
 * @fileoverview
 * @suppress {globalThis}
 */
/*
 * Contains type definitions for Closure's benefit.  Used as a
 * start file when optimizing with requirejs.
 */

/**
 * The root namespace.  Re-add the const tag after Closure bug #1235 is fixed.
 * @namespace
 */
var jglobal;

if (typeof window !== "undefined") {
    window.jscc = {};
    jglobal = window;
} else if (typeof self !== "undefined") {
    self.jscc = {};
    jglobal = self;
} else if (typeof global !== "undefined") {
    global.jscc = {};
    jglobal = global;
}

/**
 * The namespace to which enum definitions belong.
 * @namespace
 */
jscc["enums"] = {};
/**
 * The namespace to which certain classes belong.
 * @namespace
 */
jscc["classes"] = {};
jscc.enums = jscc["enums"];
jscc.classes = jscc["classes"];

/*
 * To avoid type errors with enums, add the enum module code here.  The enum modules
 * will simply return the enum objects when the closure pragma is defined.  There
 * really should be a better solution than this, and maybe there is.
 */

/**
 * Indicates the associativity of a symbol.
 * @enum {number}
 */
jscc.enums.ASSOC = {
    /**
     * The associativity has not yet been set.
     */
    NONE: 0,
    /**
     * The symbol is left-associative.
     */
    LEFT: 1,
    /**
     * The symbol is right-associative.
     */
    RIGHT: 2,
    /**
     * The symbol is non-associative.
     */
    NOASSOC: 3
};

/**
 * Identifies the type of an edge in an automation graph.
 * @enum {number}
 */
jscc.enums.EDGE = {
    FREE: 0,
    EPSILON: 1,
    CHAR: 2
};

/**
 * Indicates whether the executable environment is a
 * console-based Javascript engine or a web environment.
 * @enum {number}
 */
jscc.enums.EXEC = {
    /**
     * A console-based Javascript engine is in use.
     */
    CONSOLE: 0,
    /**
     * A web-browser-based Javascript engine is in use.
     */
    WEB: 1
};

/**
 * Specifies the minimum logging level.
 * @enum {number}
 */
jscc.enums.LOG_LEVEL = {
    /**
     * Log all messages.
     */
    TRACE: 0,
    /**
     * Log debug messages and higher.
     */
    DEBUG: 1,
    /**
     * Log info messages and higher.
     */
    INFO: 2,
    /**
     * Log warning messages and higher.
     */
    WARN: 3,
    /**
     * Log error and fatal messages.
     */
    ERROR: 4,
    /**
     * Log only fatal messages.
     */
    FATAL: 5
};
// Export from Closure, as this enumeration may be used in the
// mainOptions typedef.
jscc.enums.LOG_LEVEL['TRACE'] = jscc.enums.LOG_LEVEL.TRACE;
jscc.enums.LOG_LEVEL['DEBUG'] = jscc.enums.LOG_LEVEL.DEBUG;
jscc.enums.LOG_LEVEL['INFO'] = jscc.enums.LOG_LEVEL.INFO;
jscc.enums.LOG_LEVEL['WARN'] = jscc.enums.LOG_LEVEL.WARN;
jscc.enums.LOG_LEVEL['ERROR'] = jscc.enums.LOG_LEVEL.ERROR;
jscc.enums.LOG_LEVEL['FATAL'] = jscc.enums.LOG_LEVEL.FATAL;
jscc.enums['LOG_LEVEL'] = jscc.enums.LOG_LEVEL;

/**
 * Indicates an output mode for the parser.
 * @enum {number}
 */
jscc.enums.MODE_GEN = {
    /**
     * Output is plain text.
     */
    TEXT: 0,
    /**
     * Output is JavaScript code.
     */
    JS: 1,
    /**
     * Output is HTML-formatted.
     */
    HTML: 2
};

/**
 * Identifies a special symbol.  Special symbols include
 * end-of-file, whitespace, and error symbols.  Use
 * NONE to indicate a non-special symbol.
 * @enum {number}
 */
jscc.enums.SPECIAL = {
    /**
     * Identifies a non-special symbol.
     */
    NONE: 0,
    /**
     * Identifies an end-of-file symbol.
     */
    EOF: 1,
    /**
     * Identifies a whitespace symbol.
     */
    WHITESPACE: 2,
    /**
     * Identifies an error symbol.
     */
    ERROR: 3
};

/**
 * Identifies a symbol as nonterminating or terminating.
 * @enum {number}
 */
jscc.enums.SYM = {
    /**
     * The symbol is nonterminating.
     */
    NONTERM: 0,
    /**
     * The symbol is terminating.
     */
    TERM: 1
};

/*
 * Some option-override, fictional types.
 */
/**
 * @typedef {{id: ?number, kind: ?jscc.enums.SYM, label: ?string, prods: ?Array<number>, first:
 *     ?Array, associativity: ?jscc.enums.ASSOC, level: ?number, code: ?string, special: ?jscc.enums.SPECIAL,
 *     defined: ?boolean, "nullable": ?boolean}}
 */
var SymbolOptions;
/**
 * @typedef {{id: ?number, lhs: ?number, rhs: ?Array<!number>, level: ?number, code: ?string}}
 */
var ProductionOptions;
/**
 * @typedef {{kernel: ?Array<!jscc.classes.Item>, epsilon: ?Array<!jscc.classes.Item>, def_act: ?number, done:
 *     ?boolean, closed: ?boolean, actionrow: ?Array<!jscc.classes.TableEntry>, gotorow:
 *     ?Array<!jscc.classes.TableEntry>}}
 */
var StateOptions;
/**
 * @typedef {{prod: ?number, dot_offset: ?number, lookahead: ?Array<!number>}}
 */
var ItemOptions;
/**
 * @typedef {{edge: ?jscc.enums.EDGE, ccl: ?jscc.bitset, follow: ?number, follow2: ?number, accept: ?number,
 *     weight: ?number}}
 */
var NfaOptions;
/**
 * @typedef {{line: ?Array, nfa_set: ?Array<!number>, accept: ?number, done: ?boolean, group: ?number}}
 */
var DfaOptions;
/**
 * @typedef {{out_file: ?string, src_file: ?string, tpl_file: ?string, input: ?(string|function():!string),
     *     template: ?(string|function():!string), outputCallback: ?function(string):void, dump_nfa: ?boolean,
     *     dump_dfa: ?boolean, verbose: ?boolean, logLevel: ?(string|jscc.enums.LOG_LEVEL)}}
 * @property {?string} out_file - The path of the output file.  Defaults to
 * the empty string, which means to print to standard output (or the engine's equivalent).
 * @property {?string} src_file - The path of the input grammar file.
 * Defaults to the empty string, which means to read from standard input (or
 * the engine's equivalent).
 * @property {?string} tpl_file - The path of the input template file.
 * Defaults to the module's default template file, which is intended for generic
 * compilation tasks.
 * @property {?(string|function():!string)} input - If a string, the contents of the
 * input grammar.  If a function with no arguments, a function that returns
 * the contents of the grammar.  When input is specified, src_file is ignored.
 * @property {?(string|function():!string)} template - If a string, the contents of the
 * template.  If a function with no arguments, a function that returns the contents
 * of the template.  When template is specified, tpl_file is ignored.
 * @property {?function(string):void} outputCallback - A function with a parameter
 * that will be called with the output.  When outputCallback is specified,
 * out_file is ignored.
 * @property {?boolean} dump_nfa - Whether to output the nondeterministic finite
 * automata for debugging purposes.  Defaults to false.
 * @property {?boolean} dump_dfa - Whether to output the deterministic finite
 * automata for debugging purposes.  Defaults to false.
 * @property {?boolean} verbose - Make debugging output chattier.  Defaults to
 * false.
 * @property {?(string|jscc.enums.LOG_LEVEL)} logLevel - The logging
 * level.  Can be the name of one of the {@link module:jscc.enums.LOG_LEVEL} values
 * or one of the values themselves.  Defaults to WARN.
 * @property {?boolean} throwIfErrors - Whether to throw an exception before completion
 * of the main method if there are any errors.
 * @property {?boolean} exitIfErrors - Whether to exit the process with a non-zero exit
 * code if there are any errors, provided that the platform permits doing so.  Intended
 * for use with shell scripts.
 */
var mainOptions;

/**
 * @typedef {function(!string):*}
 */
var reqParameter;

/**
 * @typedef {function((undefined|string|Array<string>|{deps: (string|Array<string>), callback: (string|Function)}), (string|Function|Array<string>)=, (string|Function)=, (string|boolean)=, boolean=):almondRequire}
 */
var almondRequire;


var almondRequireExtension =
/**
 * @lends {almondRequire}
 */
({
    /**
     * @type {!Object<string, *>}
     */
    _defined: {},
    /**
     * @param {Object<string, *>} cfg
     * @returns {almondRequire}
     */
    config: function(cfg) {
    }
});

/**
 * @typedef {string}
 */
var stringWithErrorMessage;

var stringWithErrorMessageExtension =
    /**
     * @lends {stringWithErrorMessage}
     */
    ({
        /**
         * @type {string}
         */
        ERROR_MSG: ""
    });

/**
 * @typedef {function(string):boolean}
 */
var hasObject;

var hasObjectExtension =
    /**
     * @lends {hasObject}
     */
    ({
        /**
         * @param {string} name
         * @param {function(...*):boolean} test
         * @param {boolean=} now
         */
        add: function(name, test, now) {
        },
        /**
         * @param {T} el
         * @returns {T}
         * @template T
         */
        clearElement: function(el) {
        },
        /**
         * @param {string} name
         * @param {*} el
         * @returns {boolean}
         */
        cssprop: function(name, el) {
        },
        /**
         * @param {*} obj
         * @param {*=} property
         * @returns {boolean}
         */
        isHostType: function(obj, property) {
        },
        /**
         * @returns {Object<string, (boolean|stringWithErrorMessage)>}
         */
        all: function() {
        }
    });
/**
 * @typedef {{filename: ?(string|undefined), chunkCallback: ?(function(string):void|undefined), endCallback:
 *     ?(function():void|undefined)}}
 * @property {?(string|undefined)} filename - The filename to read.  If omitted, read from standard input.
 * @property {?(function(string):void|undefined)} chunkCallback - The function to call when an input chunk is read
 *     asynchronously.
 * @property {?(function():void|undefined)} endCallback - The function to call when the asynchronous read operation has
 *     completed.
 */
var ioOptions;
/**
 * @typedef {{text: string, destination: ?(string|undefined), callback: ?(function():void|undefined)}}
 * @property {string} text - The text to be written.
 * @property {?(string|undefined)} destination - The filename to which to write the text.  If omitted, text is written
 *     to standard output.
 * @property {?(function():void|undefined)} callback - A callback to be executed when the asynchronous write operation
 *     has completed.  If omitted, the operation occurs synchronously instead.
 */
var ioWriteOutputOptions;
/**
 * Interface for engine-specific IO modules.
 * @interface
 */
jscc.io = function() {
};
jscc.io.prototype = {
    /**
     * Reads input from the specified file or from standard input.
     * If chunkCallback and/or endCallback are specified, the operation
     * is asynchronous, and the function returns nothing.  Otherwise,
     * the operation is synchronous, and the function returns a string
     * with the contents read from the file or from standard input.
     *
     * @param {(string|function(string):void|ioOptions)=} options -
     *     If a string, the filename to read.  If an object, has optional filename, chunkCallback, and endCallback
     *     properties.  If a function, the callback function to execute for each chunk read from standard input.
     * @returns {(string|void)} When running synchronously, the text read from
     * the file or standard input.  When running asynchronously, returns nothing.
     */
    read_all_input: function(options) {

    },

    /**
     * Reads the template file into which the parser code is inserted.
     * If not specified, uses the default driver specified in
     * {@link jscc.global.DEFAULT_DRIVER}.
     *
     * @param {(string|function(string):void|ioOptions)=} options -
     *     If a string, specifies the template filename.  If a function, specifies the callback function to be used
     *     when reading a file chunk has completed.  If an object, specifies either or both.  If omitted, causes the
     *     function to read
     * {@link jscc.global.DEFAULT_DRIVER} synchronously.
     * @returns {(string|void)} When running synchronously, returns the contents of
     * the template file as a string.  When running asynchronously, returns
     * nothing.
     */
    read_template: function(options) {

    },

    /**
     * Writes the provided text to the specified file or to standard output.
     *
     * @param {(string|ioWriteOutputOptions)} options - When a string, the text
     *     to be written to standard output.  When an object, contains text, destination, and callback properties.
     */
    write_output: function(options) {

    },

    /**
     * Writes the provided text to a debugging output, provided that such an output
     * exists in the implementation of this interface.
     *
     * @param {string} text - The text to write to the debugging output.
     */
    write_debug: function(text) {

    },

    /**
     * Attempts to exit the entire process with the provided exit code if the 
     * platform supports doing so.  Callers should also ensure that all functions
     * exit appropriately if the platform does not support this feature.
     * 
     * @param {number=} exitCode - The exit code to use.
     */
    exit: function(exitCode) {
        
    }
};
/**
 * Interface for engine-specific logging modules.
 * @interface
 */
jscc.log = function() {

};
jscc.log.prototype = {
    /**
     * Logs a message at the fatal level.
     * @param {string} msg - The message to log.
     */
    fatal: function(msg) {
    },
    /**
     * Logs a message at the error level.
     * @param {string} msg - The message to log.
     */
    error: function(msg) {
    },
    /**
     * Logs a message at the warning level.
     * @param {string} msg - The message to log.
     */
    warn: function(msg) {
    },
    /**
     * Logs a message at the info level.
     * @param {string} msg - The message to log.
     */
    info: function(msg) {
    },
    /**
     * Logs a message at the debug level.
     * @param {string} msg - The message to log.
     */
    debug: function(msg) {
    },
    /**
     * Logs a message at the trace level.
     * @param {string} msg - The message to log.
     */
    trace: function(msg) {
    },
    /**
     * Sets the minimum level to log.  This function
     * may not have an effect at all times with all
     * loggers.
     * @param {jscc.enums.LOG_LEVEL} level - The
     * minimum level to log.
     */
    setLevel: function(level) {
    }
};

/**
 * Interface definition for bitset implementations.
 * @interface
 */
jscc.bitset = function() {
};
jscc.bitset.prototype = {
    /**
     * Sets the specified bit to true or false.
     * @param {!number} bit - The index of the bit to set
     * @param {boolean=} state - Whether to set the bit to true or false
     * @returns {!boolean} Returns the state parameter for chaining purposes
     * @method
     */
    set: function(bit, state) {
        return false;
    },

    /**
     * Gets the bit at the specified index.
     * @param {!number} bit - The index of the bit to get
     * @returns {!boolean} Whether the bit is currently true or false
     * @method
     */
    get: function(bit) {
        return false;
    },

    /**
     * Returns the number of true values in the bitset.
     * @returns {!number} The number of true values in the bitset
     * @method
     */
    count: function() {
        return 0;
    }
};
/**
 * @license almond 0.3.2 Copyright jQuery Foundation and other contributors.
 * Released under MIT license, http://github.com/requirejs/almond/LICENSE
 */
//Going sloppy to avoid 'use strict' string cost, but strict practices should
//be followed.
/*global setTimeout: false */

/** @type {almondRequire} */
var requirejs;
/** @type {almondRequire} */
var require;
var define;
(function (undef) {
    var main, req, makeMap, handlers,
        /** @type {!Object<string, *>} */
        defined = {},
        /** @type {!Object<string, Array>} */
        waiting = {},
        config = {},
        /** @type {!Object<string, boolean>} */
        defining = {},
        hasOwn = Object.prototype.hasOwnProperty,
        aps = [].slice,
        jsSuffixRegExp = /\.js$/;

    /**
     * @param {!Object} obj
     * @param {!string} prop
     * @returns {!boolean}
     */
    function hasProp(obj, prop) {
        return hasOwn.call(obj, prop);
    }

    /**
     * Given a relative module name, like ./something, normalize it to
     * a real name that can be mapped to a path.
     * @param {string} name the relative name
     * @param {string} baseName a real name that the name arg is relative
     * to.
     * @returns {string} normalized name
     */
    function normalize(name, baseName) {
        var /** @type {Array<string>} */ nameParts, nameSegment, mapValue, foundMap, lastIndex,
            foundI, foundStarMap, starI, i, j, part, normalizedBaseParts,
            baseParts = /** @type {Array<string>} */ (baseName && baseName.split("/")),
            map = config.map,
            starMap = (map && map['*']) || {};

        //Adjust any relative paths.
        if (name) {
            nameParts = name.split('/');
            lastIndex = nameParts.length - 1;

            // If wanting node ID compatibility, strip .js from end
            // of IDs. Have to do this here, and not in nameToUrl
            // because node allows either .js or non .js to map
            // to same file.
            if (config.nodeIdCompat && jsSuffixRegExp.test(nameParts[lastIndex])) {
                nameParts[lastIndex] = nameParts[lastIndex].replace(jsSuffixRegExp, '');
            }

            // Starts with a '.' so need the baseName
            if (nameParts[0].charAt(0) === '.' && baseParts) {
                //Convert baseName to array, and lop off the last part,
                //so that . matches that 'directory' and not name of the baseName's
                //module. For instance, baseName of 'one/two/three', maps to
                //'one/two/three.js', but we want the directory, 'one/two' for
                //this normalization.
                normalizedBaseParts = baseParts.slice(0, baseParts.length - 1);
                nameParts = normalizedBaseParts.concat(nameParts);
            }

            //start trimDots
            for (i = 0; i < nameParts.length; i++) {
                part = nameParts[i];
                if (part === '.') {
                    nameParts.splice(i, 1);
                    i -= 1;
                } else if (part === '..') {
                    // If at the start, or previous value is still ..,
                    // keep them so that when converted to a path it may
                    // still work when converted to a path, even though
                    // as an ID it is less than ideal. In larger point
                    // releases, may be better to just kick out an error.
                    if (!((i === 1 && nameParts[2] === '..') || nameParts[i - 1] === '..') && i > 0) {
                        nameParts.splice(i - 1, 2);
                        i -= 2;
                    }
                }
            }
            //end trimDots

            name = nameParts.join('/');
            nameParts = null;
        }

        //Apply map config if available.
        if ((baseParts || starMap) && map) {
            nameParts = name.split('/');

            for (i = nameParts.length; i > 0; i -= 1) {
                nameSegment = nameParts.slice(0, i).join("/");

                if (baseParts) {
                    //Find the longest baseName segment match in the config.
                    //So, do joins on the biggest to smallest lengths of baseParts.
                    for (j = baseParts.length; j > 0; j -= 1) {
                        mapValue = map[baseParts.slice(0, j).join('/')];

                        //baseName segment has  config, find if it has one for
                        //this name.
                        if (mapValue) {
                            mapValue = mapValue[nameSegment];
                            if (mapValue) {
                                //Match, update name to the new value.
                                foundMap = mapValue;
                                foundI = i;
                                break;
                            }
                        }
                    }
                }

                if (foundMap) {
                    break;
                }

                //Check for a star map match, but just hold on to it,
                //if there is a shorter segment match later in a matching
                //config, then favor over this star map.
                if (!foundStarMap && starMap && starMap[nameSegment]) {
                    foundStarMap = starMap[nameSegment];
                    starI = i;
                }
            }

            if (!foundMap && foundStarMap) {
                foundMap = foundStarMap;
                foundI = starI;
            }

            if (foundMap) {
                nameParts.splice(0, foundI, foundMap);
                name = nameParts.join('/');
            }
        }

        return name;
    }

    /**
     * @param {(string|Array<string>|undefined)} relName
     * @param {boolean=} forceSync
     * @returns {Function}
     */
    function makeRequire(relName, forceSync) {
        return function () {
            //A version of a require function that passes a moduleName
            //value for items that may need to
            //look up paths relative to the moduleName
            var args = aps.call(arguments, 0);

            //If first arg is not require('string'), and there is only
            //one arg, it is the array form without a callback. Insert
            //a null so that the following concat is correct.
            if (typeof args[0] !== 'string' && args.length === 1) {
                args.push(null);
            }
            return req.apply(undef, args.concat([relName, forceSync]));
        };
    }

    /**
     * @param {string} relName
     * @returns {function(string):string}
     */
    function makeNormalize(relName) {
        return function (name) {
            return normalize(name, relName);
        };
    }

    /**
     * @param {string} depName
     * @returns {function(*)}
     */
    function makeLoad(depName) {
        return function (value) {
            defined[depName] = value;
        };
    }

    /**
     * @param {!string} name
     * @returns {*}
     */
    function callDep(name) {
        if (hasProp(waiting, name)) {
            var args = waiting[name];
            delete waiting[name];
            defining[name] = true;
            main.apply(undef, args);
        }

        if (!hasProp(defined, name) && !hasProp(defining, name)) {
            throw new Error('No ' + name);
        }
        return defined[name];
    }

    //Turns a plugin!resource to [plugin, resource]
    //with the plugin being undefined if the name
    //did not have a plugin prefix.
    /**
     * @param {string} name
     * @returns {Array<(string|undefined)>}
     */
    function splitPrefix(name) {
        var prefix,
            index = name ? name.indexOf('!') : -1;
        if (index > -1) {
            prefix = name.substring(0, index);
            name = name.substring(index + 1, name.length);
        }
        return [prefix, name];
    }

    /**
     * Makes a name map, normalizing the name, and using a plugin
     * for normalization if necessary. Grabs a ref to plugin
     * too, as an optimization.
     * @param {string} name
     * @param {string} relName
     * @returns {{f: string, n: string, pr: (string|undefined), p: *}}
     */
    makeMap = function (name, relName) {
        var plugin,
            parts = splitPrefix(name),
            prefix = parts[0];

        name = /** @type {string} */ (parts[1]);

        if (prefix) {
            prefix = normalize(prefix, relName);
            plugin = callDep(prefix);
        }

        //Normalize according
        if (prefix) {
            if (plugin && plugin.normalize) {
                name = (/** @type {{normalize: function(string, function(string):string):string}} */ (plugin)).normalize(name, makeNormalize(relName));
            } else {
                name = normalize(name, relName);
            }
        } else {
            name = normalize(name, relName);
            parts = splitPrefix(name);
            prefix = parts[0];
            name = /** @type {string} */ (parts[1]);
            if (prefix) {
                plugin = callDep(prefix);
            }
        }

        //Using ridiculous property names for space reasons
        return {
            f: prefix ? prefix + '!' + name : name, //fullName
            n: name,
            pr: prefix,
            p: plugin
        };
    };

    /**
     * @param {string} name
     * @returns {function():Object}
     */
    function makeConfig(name) {
        return function () {
            return (config && config.config && config.config[name]) || {};
        };
    }

    handlers = {
        require: function (name) {
            return makeRequire(name);
        },
        exports: function (name) {
            var e = defined[name];
            if (typeof e !== 'undefined') {
                return e;
            } else {
                return (defined[name] = {});
            }
        },
        module: function (name) {
            return {
                id: name,
                uri: '',
                exports: defined[name],
                config: makeConfig(name)
            };
        }
    };

    /**
     * @param {(string|undefined)} name
     * @param {(Array<string>|undefined)} deps
     * @param {Function=} callback
     * @param {?string=} relName
     */
    main = function (name, deps, callback, relName) {
        var cjsModule, depName, ret, map, i,
            args = [],
            callbackType = typeof callback,
            usingExports;

        //Use name if no relName
        relName = /** @type {string} */ (relName || name);

        //Call the callback to define the module, if necessary.
        if (callbackType === 'undefined' || callbackType === 'function') {
            //Pull out the defined dependencies and pass the ordered
            //values to the callback.
            //Default to [require, exports, module] if no deps
            deps = !deps.length && callback.length ? ['require', 'exports', 'module'] : deps;
            for (i = 0; i < deps.length; i += 1) {
                map = makeMap(deps[i], relName);
                depName = map.f;

                //Fast path CommonJS standard dependencies.
                if (depName === "require") {
                    args[i] = handlers.require(name);
                } else if (depName === "exports") {
                    //CommonJS module spec 1.1
                    args[i] = handlers.exports(name);
                    usingExports = true;
                } else if (depName === "module") {
                    //CommonJS module spec 1.1
                    cjsModule = args[i] = handlers.module(name);
                } else if (hasProp(defined, depName) ||
                           hasProp(waiting, depName) ||
                           hasProp(defining, depName)) {
                    args[i] = callDep(depName);
                } else if (map.p) {
                    map.p.load(map.n, makeRequire(relName, true), makeLoad(depName), {});
                    args[i] = defined[depName];
                } else {
                    throw new Error(name + ' missing ' + depName);
                }
            }

            ret = callback ? callback.apply(defined[/** @type {string} */ (name)], args) : undefined;

            if (name) {
                //If setting exports via "module" is in play,
                //favor that over return value and exports. After that,
                //favor a non-undefined return value over exports use.
                if (cjsModule && cjsModule.exports !== undef &&
                        cjsModule.exports !== defined[name]) {
                    defined[name] = cjsModule.exports;
                } else if (ret !== undef || !usingExports) {
                    //Use the return value from the function.
                    defined[name] = ret;
                }
            }
        } else if (name) {
            //May just be an object definition for the module. Only
            //worry about defining if have a module name.
            defined[name] = callback;
        }
    };

    requirejs = require = req = /** @type {almondRequire} */ (function (deps, callback, relName, forceSync, alt) {
        if (typeof deps === "string") {
            if (handlers[deps]) {
                //callback in this case is really relName
                return handlers[deps](/** string */ (callback));
            }
            //Just return the module wanted. In this scenario, the
            //deps arg is the module name, and second arg (if passed)
            //is just the relName.
            //Normalize module name, if it contains . or ..
            return callDep(makeMap(deps, /** @type {string} */ (callback)).f);
        }
        if (!deps.splice) {
            //deps is a config object, not an array.
            config = deps;
            if (config.deps) {
                req(config.deps, config.callback);
            }
            if (!callback) {
                return;
            }

            if (callback.splice) {
                //callback is an array, which means it is a dependency list.
                //Adjust args if there are dependencies
                deps = /** @type {Array<string>} */ (callback);
                callback = relName;
                relName = null;
            } else {
                deps = undef;
            }
        }

        //Support require(['a'])
        callback = /** @type {!Function} */ (callback || function () {});

        //If relName is a function, it is an errback handler,
        //so remove it.
        if (typeof relName === 'function') {
            relName = /** @type {string} */ (forceSync);
            forceSync = alt;
        }

        //Simulate async callback;
        if (forceSync) {
            main(undef, /** @type {(Array<string>|undefined)} */ (deps), callback, /** @type {(string|undefined)} */ (relName));
        } else {
            //Using a non-zero value because of concern for what old browsers
            //do, and latest browsers "upgrade" to 4 if lower value is used:
            //http://www.whatwg.org/specs/web-apps/current-work/multipage/timers.html#dom-windowtimers-settimeout:
            //If want a value immediately, use require('id') instead -- something
            //that works in almond on the global level, but not guaranteed and
            //unlikely to work in other AMD implementations.
            setTimeout(function () {
                main(undef, /** @type {(Array<string>|undefined)} */ (deps), /** @type {!Function} */ (callback), /** @type {(string|undefined)} */ (relName));
            }, 4);
        }

        return req;
    });

    /**
     * Just drops the config on the floor, but returns req in case
     * the config return value is used.
     */
    req.config = function (cfg) {
        return req(cfg);
    };

    /**
     * Expose module registry for debugging and tooling
     */
    requirejs._defined = defined;

    /**
     * @param {!string} name
     * @param {!(Array<string>|Function)} deps
     * @param {(Function)=} callback
     */
    define = function (name, deps, callback) {
        if (typeof name !== 'string') {
            throw new Error('See almond README: incorrect module build, no module name');
        }

        //This module may not have dependencies
        if (!deps.splice) {
            //deps is not an array, so probably means
            //an object literal or factory function for
            //the value. Adjust args.
            callback = /** @type {Function} */ (deps);
            deps = [];
        }

        if (!hasProp(defined, name) && !hasProp(waiting, name)) {
            waiting[name] = [name, deps, callback];
        }
    };

    define.amd = {
        jQuery: true
    };
}(undefined));

define("bin/almond", function(){});

define('text',{load: function(id){throw new Error("Dynamic load not allowed: " + id);}});

define('text!lib/jscc/template/parser-driver-js.txt',[],function () { return '/*\r\n\tThis is the general, platform-independent part of every parser driver;\r\n\tInput-/Output and Feature-Functions are done by the particular drivers\r\n\tcreated for the particular platform.\r\n*/\r\n##HEADER##\r\nvar __parse=(function(/** number */ eof, /** number */ whitespace, /** number */ error_token){\r\n\t\r\n/// there was "continue" in code, we must to replace it\r\nvar Continue = function(){throw Continue;};\r\n\r\n\t/**\r\n\t * @template T\r\n\t * @param {T} value\r\n\t * @constructor\r\n\t * @extends {Error}\r\n     */\r\n\tvar ReturnValue = function(value) {\r\n\t\tError.call(this);\r\n\t\tthis._value = value;\r\n\t};\r\n\tReturnValue.prototype = Object.create(Error.prototype);\r\n\tReturnValue.prototype.constructor = ReturnValue;\r\n\t/**\r\n\t * @type {T}\r\n\t * @private\r\n     */\r\n\tReturnValue.prototype._value = null;\r\n\t/**\r\n\t * @returns {T}\r\n     */\r\n\tReturnValue.prototype.valueOf = function() {\r\n\t\treturn this._value;\r\n\t};\r\n\r\n\t///can return value from any place of callback\r\n\tfunction Return(value){\r\n\t\tthrow new ReturnValue(value);\r\n\t}\r\n\r\n\tvar TERMINAL_ACTIONS = (function(){\r\n\t\tfunction emptyFn(PCB){return PCB.att;}\r\n\t\tvar actions = ##TERMINAL_ACTIONS##\r\n\t\treturn function(/** @type {!PcbClass} */ PCB, match){\r\n\t\t\ttry{\r\n\t\t\t\treturn (actions[match] || emptyFn)(PCB);\r\n\t\t\t}catch(e){\r\n\t\t\t\tif(e instanceof ReturnValue)return e.valueOf();\r\n\t\t\t\tif(e == Continue)return Continue;\r\n\t\t\t\tthrow e;\r\n\t\t\t}\r\n\t\t}\r\n\t})();\r\n\t/**\r\n\t * @constructor\r\n     */\r\n\tvar DfaLex = function() {\r\n\t\tthis._dfaData = ##DFA##;\r\n\t};\r\n\t/**\r\n\t * @type {!Array<!{line: !Array, accept: !number}>}\r\n\t * @private\r\n     */\r\n\tDfaLex.prototype._dfaData = [];\r\n\t/**\r\n\t * @type {number}\r\n     */\r\n\tDfaLex.prototype.match_pos = 0;\r\n\t/**\r\n\t * @type {?number}\r\n     */\r\n\tDfaLex.prototype.state = 0;\r\n\t/**\r\n\t * @type {?number}\r\n     */\r\n\tDfaLex.prototype.match = null;\r\n\t/**\r\n\t * @param {number} chr\r\n\t * @param {number} pos\r\n     */\r\n\tDfaLex.prototype.exec = function(chr, pos) {\r\n\t\tif (this.state !== null) {\r\n\t\t    if ((typeof this.state !== "number") || this.state >= this._dfaData.length) {\r\n\t\t        this.state = null;\r\n\t\t        throw new Error("Invalid value for DfaLex.state at chr " + chr + " and pos " + pos);\r\n\t\t    }\r\n\t\t\tvar line = this._dfaData[this.state].line;\r\n\t\t\tif (typeof line === "undefined" || line === null) {\r\n\t\t\t    var badState = this.state;\r\n\t\t\t    this.state = null;\r\n\t\t\t    throw new Error("At chr " + chr + " and pos " + pos +\r\n\t\t\t                    ", DfaLex._dfaData[" + badState +\r\n\t\t\t                    "] appears to exist, but its line property is " +\r\n\t\t\t                    (typeof line === "undefined" ? "undefined." : "null."));\r\n\t\t\t}\r\n\t\t\tvar p, st;\r\n\t\t\tfor (p = 1 << 8, st = line; p; p >>= 1) {\r\n\t\t\t\tif ((chr & p) !== 0) {\r\n\t\t\t\t\tst = st[1];\r\n\t\t\t\t} else {\r\n\t\t\t\t\tst = st[0];\r\n\t\t\t\t}\r\n\t\t\t\tif (typeof st === "undefined") {\r\n\t\t\t\t    st = null;\r\n\t\t\t\t}\r\n\t\t\t\tif (st === null)break;\r\n\t\t\t\tif (Array.isArray(st))continue;\r\n\t\t\t\tbreak;\r\n\t\t\t}\r\n\t\t\tvar ac = this._dfaData[this.state].accept;\r\n\t\t\tthis.state = /** @type {?number} */ (st);\r\n\t\t\tif (ac !== -1) {\r\n\t\t\t\tthis.match = /** @type{number} */ (ac);\r\n\t\t\t\tthis.match_pos = pos;\r\n\t\t\t}\r\n\t\t}\r\n\t};\r\n##TABLES##\r\n##LABELS##\r\n\tvar ACTIONS = (function(){\r\n\t\tvar PCB = {};\r\n\t\tvar actions = ##ACTIONS##;\r\n\t\treturn function (/** number */ act, /** Array<*> */ vstack, /** !PcbClass */ pcb){\r\n\t\t\ttry{\r\n\t\t\t\tPCB = pcb;\r\n\t\t\t\treturn actions[act].apply(null,vstack);\r\n\t\t\t}catch(e){\r\n\t\t\t\tif(e instanceof ReturnValue)return e.valueOf();\r\n\t\t\t\tthrow e;\r\n\t\t\t}\r\n\t\t}\r\n\t})();\r\n\r\n\t/**\r\n\t * @param {number} top\r\n\t * @param {?number} la\r\n\t * @returns {?number}\r\n     */\r\n\tfunction get_act(top, la){\t\r\n\t\tfor(var i = 0; i < act_tab[top].length; i+=2)\r\n\t\t\tif(act_tab[top][i] === la)\r\n\t\t\t\treturn act_tab[top][i+1];\r\n\t\treturn null;\r\n\t}\r\n\tfunction get_goto(top, pop){\t\r\n\t\tfor(var i = 0; i < goto_tab[top].length; i+=2)\r\n\t\t\tif(goto_tab[top][i] === pop)\r\n\t\t\t\treturn goto_tab[top][i+1];\r\n\t\treturn null;\r\n\t}\r\n\r\n\t/**\r\n\t * @param {!string} src\r\n\t * @constructor\r\n     */\r\n\tvar PcbClass = function(src) {\r\n\t\tthis.src = src;\r\n\t};\r\n\t/**\r\n\t * @type {number}\r\n     */\r\n\tPcbClass.prototype.line = 1;\r\n\t/**\r\n\t * @type {number}\r\n     */\r\n\tPcbClass.prototype.column = 1;\r\n\t/**\r\n\t * @type {number}\r\n     */\r\n\tPcbClass.prototype.offset = 0;\r\n\t/**\r\n\t * @type {number}\r\n     */\r\n\tPcbClass.prototype.error_step = 0;\r\n\t/**\r\n\t * @type {string}\r\n     */\r\n\tPcbClass.prototype.src = "";\r\n\t/**\r\n\t * @type {string}\r\n     */\r\n\tPcbClass.prototype.att = "";\r\n\t/**\r\n\t * @type {?number}\r\n     */\r\n\tPcbClass.prototype.la = null;\r\n\t/**\r\n\t * @type {?number}\r\n     */\r\n\tPcbClass.prototype.act = null;\r\n\t/**\r\n\t * @returns {?number}\r\n     */\r\n\tPcbClass.prototype.lex = function() {\r\n        var /** number */ start, /** number */ pos, /** number */ chr, actionResult;\r\n\t\tvar dfa = new DfaLex();\r\n\t\tvar loop = true;\r\n\t\twhile(loop){\r\n\t\t\tdfa.match_pos = 0;\r\n\t\t\tpos = this.offset + 1;\r\n\t\t\tdo{\r\n\t\t\t\tpos--;\r\n\t\t\t\tdfa.state = 0;\r\n\t\t\t\tdfa.match = null;\r\n\t\t\t\tstart = pos;\r\n\t\t\t\tif(this.src.length <= start) {\r\n\t\t\t\t\tthis.la = eof;\r\n\t\t\t\t\treturn eof;\r\n\t\t\t\t}\r\n\t\t\t\tdo{\r\n\t\t\t\t\tchr = this.src.charCodeAt(pos);\r\n\t\t\t\t\tdfa.exec(chr,pos);\r\n\t\t\t\t\tif(dfa.state !== null)\r\n\t\t\t\t\t\tthis.accountChar(chr);\r\n\t\t\t\t\tpos++;\r\n\t\t\t\t}while(dfa.state !== null);\r\n\t\t\t}while(whitespace > -1 && dfa.match === whitespace);\r\n\t\t\tif(dfa.match !== null){\r\n\t\t\t\tthis.att = this.src.slice(start, dfa.match_pos);\r\n\t\t\t\tthis.offset = dfa.match_pos;\r\n\t\t\t\tactionResult = TERMINAL_ACTIONS(this,dfa.match);\r\n\t\t\t\tif(dfa.state !== null)\r\n\t\t\t\t\tthis.accountChar(chr);\r\n\t\t\t\tif(actionResult === Continue)\r\n\t\t\t\t\tcontinue;\r\n\t\t\t\tthis.att = actionResult;\r\n\t\t\t}else {\r\n\t\t\t\tthis.att = "";\r\n\t\t\t}\r\n\t\t\tloop = false;\r\n\t\t}\r\n\t\tthis.la = dfa.match;\r\n\t\treturn this.la;\r\n\t};\r\n\t/**\r\n\t * @param {number} chr\r\n     */\r\n    PcbClass.prototype.accountChar = function(chr) {\r\n\t\tif( chr === 10 ){\r\n\t\t\tthis.line++;\r\n\t\t\tthis.column = 0;\r\n\t\t}\r\n\t\tthis.column++;\r\n\t};\r\n\tfunction parse(/** string */ src, err_off, err_la){\r\n\t\t/**\r\n\t\t * @type {!Array<number>}\r\n         */\r\n\t\tvar\t\tsstack\t\t\t= [0];\r\n\t\t/**\r\n\t\t * @type {!Array<*>}\r\n         */\r\n\t\tvar\t\tvstack\t\t\t= [0];\r\n\t\t/**\r\n\t\t * @type {number}\r\n         */\r\n\t\tvar \terr_cnt\t\t\t= 0;\r\n\t\t/**\r\n\t\t * @type {*}\r\n\t\t */\r\n\t\tvar\t\trval;\r\n\t\t/**\r\n\t\t * @type {?number}\r\n\t\t */\r\n\t\tvar\t\tact;\r\n\t\t/**\r\n\t\t * @type {number}\r\n\t\t */\r\n\t\tvar i = 0;\r\n\r\n\t\tvar PCB\t= new PcbClass(src);\r\n\t\terr_off\t= err_off || [];\r\n\t\terr_la = err_la || [];\r\n\t\tPCB.lex();\r\n\t\twhile(true){\r\n\t\t\tPCB.act = get_act(sstack[0],PCB.la);\r\n\t\t\tif(PCB.act === null && defact_tab[sstack[0]] >= 0)\r\n\t\t\t\tPCB.act = -defact_tab[sstack[0]];\r\n\t\t\tif(PCB.act === null){//Parse error? Try to recover!\r\n\t\t\t\t//Report errors only when error_step is 0, and this is not a\r\n\t\t\t\t//subsequent error from a previous parse\r\n\t\t\t\tif(PCB.error_step === 0){\r\n\t\t\t\t\terr_cnt++;\r\n\t\t\t\t\terr_off.unshift(PCB.offset - PCB.att.length);\r\n\t\t\t\t\terr_la.unshift([]);\r\n\t\t\t\t\tfor(i = 0; i < act_tab[sstack[0]].length; i+=2)\r\n\t\t\t\t\t\terr_la[0].push(labels[act_tab[sstack[0]][i]]);\r\n\t\t\t\t}\r\n\t\t\t\t//Perform error recovery\t\t\t\r\n\t\t\t\twhile(sstack.length > 1 && PCB.act === null){\r\n\t\t\t\t\tsstack.shift();\r\n\t\t\t\t\tvstack.shift();\r\n\t\t\t\t\t//Try to shift on error token\r\n\t\t\t\t\tPCB.act = get_act(sstack[0],PCB.la);\r\n\t\t\t\t\tif(PCB.act === error_token){\r\n\t\t\t\t\t\tsstack.unshift(PCB.act);\r\n\t\t\t\t\t\tvstack.unshift("");\r\n\t\t\t\t\t}\r\n\t\t\t\t}\r\n\t\t\t\t//Is it better to leave the parser now?\r\n\t\t\t\tif(sstack.length > 1 && PCB.act !== null){\r\n\t\t\t\t\t//Ok, now try to shift on the next tokens\r\n\t\t\t\t\twhile(PCB.la !== eof){\r\n\t\t\t\t\t\tPCB.act = act_tab[sstack[0]][i+1];\r\n\t\t\t\t\t\tif(PCB.act != null)break;\r\n\t\t\t\t\t\twhile(PCB.lex() != null)PCB.offset++;\r\n\t\t\t\t\t}\r\n\t\t\t\t}\r\n\t\t\t\tif(PCB.act === null || PCB.la === eof){\r\n\t\t\t\t\tbreak;\r\n\t\t\t\t}\r\n\t\t\t\t//Try to parse the next three tokens successfully...\r\n\t\t\t\tPCB.error_step = 3;\r\n\t\t\t}\r\n\t\t\tif(PCB.act > 0){//Shift\r\n\t\t\t\t//Parse tree generation\r\n\t\t\t\tsstack.unshift(PCB.act);\r\n\t\t\t\tvstack.unshift(PCB.att);\r\n\t\t\t\tPCB.lex();\r\n\t\t\t\t//Successfull shift and right beyond error recovery?\r\n\t\t\t\tif(PCB.error_step > 0)\r\n\t\t\t\t\tPCB.error_step--;\r\n\t\t\t}else{\t//Reduce\t\r\n\t\t\t\tact = -PCB.act;\r\n\t\t\t\t//vstack.unshift(vstack);\r\n\t\t\t\trval = ACTIONS(act,vstack,PCB);\r\n\t\t\t\t//vstack.shift();\r\n\t\t\t\tsstack.splice(0,pop_tab[act][1]);\r\n\t\t\t\tvstack.splice(0,pop_tab[act][1]);\r\n\t\t\t\t\r\n\t\t\t\tPCB.act = get_goto(sstack[0],pop_tab[act][0]);\r\n\t\t\t\t//Do some parse tree construction if desired\r\n\t\t\t\t//Goal symbol match?\r\n\t\t\t\tif(act === 0) break; //Don\'t use PCB.act here!\r\n\t\t\t\r\n\t\t\t\t//...and push it!\r\n\t\t\t\tsstack.unshift(PCB.act);\r\n\t\t\t\tvstack.unshift(rval);\r\n\t\t\t}\r\n\t\t}\r\n\t\treturn err_cnt;\r\n\t}\r\n\treturn parse;\r\n})(##EOF##,##WHITESPACE##,##ERROR_TOKEN##);\r\n\r\n##FOOTER##\r\n';});

/*
 * Universal module definition for a bitset implementation backed by
 * integer bitmasks.
 */
(function(root, factory) {
    /* istanbul ignore next */
    if (typeof define === 'function' && define.amd) {
        define('lib/jscc/bitset/BitSet32',factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.jsccbitset = factory();
    }
}(this, function() {
        /**
     * Creates a new BitSet32 object.
     * @classdesc A bitset implementation backed by integer bitmasks.
     * @implements {jscc.bitset}
     * @constructor
     */
    jscc.BitSet32 = function() {
        var that = this;
        /**
         * @private
         * @type {!Array<number>}
         */
        this._data = [];
        /**
         * @inheritDoc
         * @param {!number} bit
         * @param {boolean=} state
         * @returns {!boolean}
         */
        this.set = function(bit, state) {
            state = !!state;
            that._data[bit >> 5] =
                (state ? (that._data[bit >> 5] | (1 << (bit & 31))) : (that._data[bit >> 5] & ~(1 << (bit & 31))));
            return state;
        };
        /**
         * @inheritDoc
         * @param {!number} bit
         * @returns {!boolean}
         */
        this.get = function(bit) {
            return ((that._data[bit >> 5] & (1 << (bit & 31))) != 0);
        };
        /**
         * @inheritDoc
         * @returns {!number}
         */
        this.count = function() {
            var i, l, c = 0;
            for (i = 0, l = that._data.length * 32; i < l; i++) {
                if (that.get(i)) {
                    c++;
                }
            }
            return c;
        };
    };
    /**
     * Module containing BitSet32 implementation.  Returns a factory
     * function to make Closure slightly happier elsewhere.
     * @module {function(new:jscc.BitSet32)} jscc/bitset/BitSet32
     */
    return jscc.BitSet32;
}));

(function(root, factory) {
    /* istanbul ignore next */
    if (typeof define === 'function' && define.amd) {
        define('lib/jscc/enums/EDGE',factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.jsccEDGE = factory();
    }
}(this, function() {
        /**
     * Module containing EDGE enumeration.
     * @module jscc/enums/EDGE
     */
    return jscc.enums.EDGE;
}));

/*
 * Universal module definition for module containing the Nfa class.
 */
(function(root, factory) {
    /* istanbul ignore next */
    if (typeof define === 'function' && define.amd) {
        define('lib/jscc/classes/Nfa',['require', '../enums/EDGE', '../bitset'], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory(require);
    } else {
        root.jsccNfa = factory(function(mod) {
            return root["jscc" + mod.split("/").pop()];
        });
    }
}(this,
  /**
   * @param {reqParameter} require
   * @param {...*} others
   * @returns {function(new:jscc.classes.Nfa, NfaOptions=)}
   */
  function(require, others) {
            var BitSet, tmpBitSet, EDGE = require("../enums/EDGE");

      /**
       * @suppress {uselessCode}
       */
      (function() {
          if (false) {
              tmpBitSet = require("../bitset/BitSet32");
          } else {
              tmpBitSet = require("../bitset");
          }
      })();
      BitSet = /** @type {function(new:jscc.bitset)} */ (tmpBitSet);

      /**
       * Creates a new Nfa instance.
       * @classdesc Represents a state in a nondeterministic finite automata.
       * @param {NfaOptions=} o - Optional overrides for default property values.
       * @constructor
       * @const
       */
      jscc.classes.Nfa = function(o) {
          var p = o || {};
          if (p.edge === EDGE.CHAR || p.edge === EDGE.FREE) {
              this.edge = /** @type {!jscc.enums.EDGE} */ (p.edge);
          }
          if (typeof p.ccl === 'object' && p.ccl.hasOwnProperty("get") && p.ccl.hasOwnProperty("set") &&
              p.ccl.hasOwnProperty("count")) {
              this.ccl = /** @type {!jscc.bitset} */ (p.ccl);
          } else {
              this.ccl = new BitSet();
          }
          if (typeof p.follow === 'number') {
              this.follow = /** @type {!number} */ (p.follow);
          }
          if (typeof p.follow2 === 'number') {
              this.follow2 = /** @type {!number} */ (p.follow2);
          }
          if (typeof p.accept === 'number') {
              this.accept = /** @type {!number} */ (p.accept);
          }
          if (typeof p.weight === 'number') {
              this.weight = /** @type {!number} */ (p.weight);
          }
      };

      /**
       * The type of edge in this NFA state.
       * @type {!jscc.enums.EDGE}
       */
      jscc.classes.Nfa.prototype.edge = EDGE.EPSILON;
      /**
       * The bitset for this NFA state.
       * @type {!jscc.bitset}
       */
      jscc.classes.Nfa.prototype.ccl = new BitSet();
      /**
       * Index of an immediately-following state.
       * @type {!number}
       */
      jscc.classes.Nfa.prototype.follow = -1;
      /**
       * Index of a second following state.
       * @type {!number}
       */
      jscc.classes.Nfa.prototype.follow2 = -1;
      /**
       * Index of an accepting state.
       * @type {!number}
       */
      jscc.classes.Nfa.prototype.accept = -1;
      /**
       * The weight of this particular state.
       * @type {!number}
       */
      jscc.classes.Nfa.prototype.weight = -1;

      /**
       * The module containing the Nfa class.
       * @module jscc/classes/Nfa
       */
      return jscc.classes.Nfa;
  }));

/*
 * Universal module definition for NFAStates (previously in global.js).
 */
(function(root, factory) {
    /* istanbul ignore next */
    if (typeof define === 'function' && define.amd) {
        define('lib/jscc/nfaStates',['require', './bitset', './enums/EDGE', './classes/Nfa'], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory(require);
    } else {
        root.jsccnfaStates = factory(function(mod) {
            return root["jscc" + mod.split("/").pop()];
        });
    }
}(this,
  /**
   * @param {reqParameter} require
   * @param {...*} others
   * @returns {function(new:jscc.NFAStates)}
   */
  function(require, others) {
      
      var BitSet,
          tmpBitSet,
          EDGE = require("./enums/EDGE"),
          Nfa = /** @type {function(new:jscc.classes.Nfa, ?NfaOptions=)} */ (require("./classes/Nfa"));
            
      /**
       * @suppress {uselessCode}
       */
      (function() {
          if (false) {
              tmpBitSet = require("./bitset/BitSet32");
          } else {
              tmpBitSet = require("./bitset");
          }
      })();
      BitSet = /** @type {function(new:jscc.bitset)} */ (tmpBitSet);

      /**
       * Module with a class that creates and stores Nfa objects.
       * @module {jscc.NFAStates} jscc/nfaStates
       * @constructor
       */
      jscc.NFAStates = function() {
      };
      /**
       * The inner array of Nfa objects.
       * @type {!Array<!jscc.classes.Nfa>}
       */
      jscc.NFAStates.prototype.value = [];
      /**
       * Finds an empty Nfa already in the value array if possible,
       * and returns its index.  Otherwise, creates a new Nfa object
       * and returns its index within the value array.
       * @returns {number} The index of the new or recycled Nfa
       * object within the value array.
       */
      jscc.NFAStates.prototype.create = function() {
          var nfa;
          var i;
          // Use an empty item if available, else create a new one...
          for (i = 0; i < this.value.length; i++) {
              if (this.value[i].edge === EDGE.FREE) {
                  break;
              }
          }

          if (i == this.value.length) {
              nfa = new Nfa();
              this.value.push(nfa);
          } else {
              nfa = this.value[i];
          }
          nfa.edge = EDGE.EPSILON;
          nfa.ccl = new BitSet();
          nfa.accept = -1;
          nfa.follow = -1;
          nfa.follow2 = -1;
          nfa.weight = -1;
          return i;
      };
      return jscc.NFAStates;
  }));

(function(root, factory) {
    /* istanbul ignore next */
    if (typeof define === 'function' && define.amd) {
        define('lib/jscc/enums/SYM',factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.jsccSYM = factory();
    }
}(this, function() {
        /**
     * Module containing SYM enumeration.
     * @module jscc/enums/SYM
     */
    return jscc.enums.SYM;
}));

(function(root, factory) {
    /* istanbul ignore next */
    if (typeof define === 'function' && define.amd) {
        define('lib/jscc/enums/ASSOC',factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.jsccASSOC = factory();
    }
}(this, function() {
        /**
     * Module containing ASSOC enumeration.
     * @module jscc/enums/ASSOC
     */
    return jscc.enums.ASSOC;
}));

(function(root, factory) {
    /* istanbul ignore next */
    if (typeof define === 'function' && define.amd) {
        define('lib/jscc/enums/SPECIAL',factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.jsccSPECIAL = factory();
    }
}(this, function() {
        /**
     * Module containing SPECIAL enumeration.
     * @module jscc/enums/SPECIAL
     */
    return jscc.enums.SPECIAL;
}));

/*
 * Universal module definition for the Symbol class module.
 */
(function(root, factory) {
    /* istanbul ignore next */
    if (typeof define === 'function' && define.amd) {
        define('lib/jscc/classes/Symbol',["require", "../enums/SYM", "../enums/ASSOC", "../enums/SPECIAL"], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory(require);
    } else {
        root.jsccSymbol = factory(function(mod) {
            return root["jscc" + mod.split("/").pop()];
        });
    }
}(this,
  /**
   * @param {reqParameter} require
   * @param {...*} others
   * @returns {function(new:jscc.classes.Symbol, SymbolOptions=)}
   */
  function(require, others) {
    
    var SYM = require("../enums/SYM"),
        ASSOC = require("../enums/ASSOC"),
        SPECIAL = require("../enums/SPECIAL");

    /**
     * Creates a new Symbol instance.
     * @classdesc Represents a symbol in the grammar.
     * @param {SymbolOptions=} o - Optional overrides for default property values.
     * @constructor
     * @memberof {jscc.classes}
     * @const
     */
    jscc.classes.Symbol = function(o) {
        var p = o || {};
        if (typeof p.id === 'number') {
            this.id = p.id;
        }
        if (p.kind === SYM.TERM) {
            this.kind = p.kind;
        }
        if (typeof p.label === 'string') {
            this.label = p.label;
        }
        if (Array.isArray(p.prods)) {
            this.prods = /** @type {!Array<number>} */ (p.prods);
        }
        if (Array.isArray(p.first)) {
            this.first = /** @type {!Array<number>} */ (p.first);
        }
        if (p.associativity === ASSOC.LEFT ||
            p.associativity === ASSOC.RIGHT ||
            p.associativity === ASSOC.NOASSOC) {
            this.associativity = p.associativity;
        }
        if (typeof p.level === 'number') {
            this.level = p.level;
        }
        if (typeof p.code === 'string') {
            this.code = p.code;
        }
        if (p.special === SPECIAL.EOF ||
            p.special === SPECIAL.ERROR ||
            p.special === SPECIAL.WHITESPACE) {
            this.special = p.special;
        }
        if (typeof p.nullable === 'boolean') {
            this.nullable = p.nullable;
        }
        if (typeof p.defined === 'boolean') {
            this.defined = p.defined;
        }
    };

    /**
     * The unique identifier for this symbol.  Generally, this value should match the symbol's index within the
     * global symbol array.
     * @type {!number}
     */
    jscc.classes.Symbol.prototype.id = -1;
    /**
     * Whether the symbol is terminating or nonterminating.
     * @type {!jscc.enums.SYM}
     */
    jscc.classes.Symbol.prototype.kind = SYM.NONTERM;
    /**
     * The text of this symbol.
     * @type {!string}
     */
    jscc.classes.Symbol.prototype.label = "";
    /**
     * The set of productions associated with this symbol, as identified by
     * their id values within the global productions array.
     * @type {!Array<number>}
     */
    jscc.classes.Symbol.prototype.prods = [];
    /**
     * The "first" array.
     * @type {!Array<number>}
     */
    jscc.classes.Symbol.prototype.first = [];
    /**
     * The associativity of this symbol.
     * @type {!jscc.enums.ASSOC}
     */
    jscc.classes.Symbol.prototype.associativity = ASSOC.NONE;
    /**
     * The level of this symbol.
     * @type {!number}
     */
    jscc.classes.Symbol.prototype.level = 0;
    /**
     * The code that this symbol produces.
     * @type {!string}
     */
    jscc.classes.Symbol.prototype.code = "";
    /**
     * The type of special symbol, if any, that this symbol represents.
     * @type {!jscc.enums.SPECIAL}
     */
    jscc.classes.Symbol.prototype.special = SPECIAL.NONE;
    /**
     * Whether this symbol is nullable.
     * @type {!boolean}
     */
    jscc.classes.Symbol.prototype.nullable = false;
    /**
     * Whether this symbol is defined.
     * @type {!boolean}
     */
    jscc.classes.Symbol.prototype.defined = false;

    /**
     * The module containing the Symbol class.
     * @module {function(new:jscc.classes.Symbol, SymbolOptions=)} jscc/classes/Symbol
     */
    return jscc.classes.Symbol;
}));

/*
 * Universal module definition for Production class.
 */
(function(root, factory) {
    /* istanbul ignore next */
    if (typeof define === 'function' && define.amd) {
        define('lib/jscc/classes/Production',factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.jsccProduction = factory();
    }
}(this, function() {
        /**
     * Creates a new Production instance.
     * @classdesc Represents a production created from the grammar.
     * @param {ProductionOptions=} o - Overrides for default property values.
     * @constructor
     * @memberof {jscc.classes}
     * @const
     */
    jscc.classes.Production = function(o) {
        var p = o || {};
        if (typeof p.id === 'number') {
            this.id = /** @type {number} */ (p.id);
        }
        if (typeof p.lhs === 'number') {
            this.lhs = /** @type {number} */ (p.lhs);
        }
        if (typeof p.rhs !== 'undefined' && Array.isArray(p.rhs)) {
            this.rhs = /** @type {!Array<!number>} */ (p.rhs);
        }
        if (typeof p.level === 'number') {
            this.level = /** @type {number} */ (p.level);
        }
        if (typeof p.code === 'string') {
            this.code = /** @type {string} */ (p.code);
        }
    };

    /**
     * The unique identifier of this production, which should
     * match its index within the global productions array.
     * @type {!number}
     */
    jscc.classes.Production.prototype.id = -1;
    /**
     * The id of the symbol representing the left-hand side of
     * this production.
     * @type {!number}
     */
    jscc.classes.Production.prototype.lhs = -1;
    /**
     * The id values of the symbols representing the right-hand side
     * of this production.
     * @type {!Array<!number>}
     */
    jscc.classes.Production.prototype.rhs = [];
    /**
     * The level of this production.
     * @type {!number}
     */
    jscc.classes.Production.prototype.level = 0;
    /**
     * The code associated with this production.
     * @type {!string}
     */
    jscc.classes.Production.prototype.code = "";

    /**
     * Contains the Production class.
     * @module {function(new:jscc.classes.Production, ProductionOptions=)} jscc/classes/Production
     */
    return jscc.classes.Production;
}));

(function(root, factory) {
    /* istanbul ignore next */
    if (typeof define === 'function' && define.amd) {
        define('lib/jscc/enums/EXEC',factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.jsccEXEC = factory();
    }
}(this, function() {
        /**
     * Module containing EXEC enumeration.
     * @module jscc/enums/EXEC
     */
    return jscc.enums.EXEC;
}));

/*
 * Universal module definition for global variables in JS/CC.
 */
(function(root, factory) {
    /* istanbul ignore next */
    if (typeof define === 'function' && define.amd) {
        define('lib/jscc/global',['require', 'text!./template/parser-driver-js.txt', './nfaStates', './classes/Symbol',
                './classes/Production', './enums/SYM',
                './enums/SPECIAL', './enums/EXEC'], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory(require);
    } else {
        root.jsccglobal =
            factory(function(mod) {
                var parts = mod.split("/");
                var last = parts[parts.length - 1];
                if (/js\.txt$/.test(last)) {
                    return root.jsccDEFAULT_PARSER_DRIVER;
                }
                return root["jscc" + last];
            });
    }
}(this,
  /**
   * @param {reqParameter} require
   * @param {...*} others
   * @returns {jscc.global}
   */
  function(require, others) {
            var defaultParserDriver,
          nfaStates = /** @type {function(new:jscc.NFAStates)} */ (require("./nfaStates")),
          Symbol = /** @type {function(new:jscc.classes.Symbol, ?SymbolOptions=)} */ (require("./classes/Symbol")),
          Production = /** @type {function(new:jscc.classes.Production)} */ (require("./classes/Production")),
          SYM = require("./enums/SYM"),
          SPECIAL = require("./enums/SPECIAL"),
          EXEC = require("./enums/EXEC");

      /**
       * @suppress {uselessCode}
       */
      (function() {
          if (false) {
              try {
                  defaultParserDriver = /** @type {string} */ (require("text!./template/parser-driver-js.txt"));
              } catch (e) {
                  if (typeof fs !== "undefined" && typeof path !== "undefined") {
                      defaultParserDriver = /** @type {string} */
                          (fs.readFileSync(path.join(__dirname, "template", "parser-driver-js.txt"), "utf8"));
                  } else if (typeof require === "function") {
                      defaultParserDriver = /** @type {string} */
                          (require("fs")
                              .readFileSync(require("path").join(__dirname, "template", "parser-driver-js.txt"),
                                            "utf8"));
                  }
              }
          } else {
              defaultParserDriver = /** @type {string} */ (require("text!./template/parser-driver-js.txt"));
          }
      })();

      /**
       * Constructs the singleton instance of jscc.global.
       * @classdesc The namespace to which the Global properties and objects belong.
       * @const
       * @constructor
       */
      jscc.global = function() {
          this.nfa_states = new nfaStates();
          var goalSymbol = new Symbol();
          goalSymbol.kind = SYM.NONTERM;
          goalSymbol.special = SPECIAL.NONE;
          goalSymbol.label = "";
          goalSymbol.id = 0;
          goalSymbol.defined = true;

          var errorResyncSymbol = new Symbol();
          errorResyncSymbol.kind = SYM.TERM;
          errorResyncSymbol.special = SPECIAL.ERROR;
          errorResyncSymbol.label = "ERROR_RESYNC";
          errorResyncSymbol.id = 1;
          errorResyncSymbol.defined = true;
          this.symbols = [goalSymbol, errorResyncSymbol];

          var p = new Production();
          p.lhs = 0;
          p.rhs = [];
          p.code = "%% = %1;";
          this.symbols[0].prods.push(0);
          this.productions = [p];
          this.whitespace_token = -1;
          this.file = "";
          this.errors = 0;
          this.warnings = 0;
          this.shifts = 0;
          this.reduces = 0;
          this.gotos = 0;
          this.regex_weight = 0;
          this.code_head = "";
          this.code_foot = "";

          // /**
          //  * @const
          //  * @type {string}
          //  */
          // this.JSCC_VERSION = module.config().version;

          /**
           * @const
           * @type {string}
           */
          this.DEFAULT_DRIVER = defaultParserDriver;

          /**
           * The default code contents for a production.
           * @const
           * @type {string}
           */
          this.DEF_PROD_CODE = "%% = %1;";

          /**
           * The minimum lexer-state index.
           * @type {number}
           * @const
           */
          this.MIN_CHAR = 0;

          /**
           * One greater than the maximum lexer-state index.
           * @type {number}
           * @const
           */
          this.MAX_CHAR = 255;
      };

      /**
       * The global symbol array.
       * @type {!Array<!jscc.classes.Symbol>}
       */
      jscc.global.prototype.symbols = [];

      /**
       * The global production array.
       * @type {!Array<!jscc.classes.Production>}
       */
      jscc.global.prototype.productions = [];

      /**
       * The global state array.
       * @type {!Array<!jscc.classes.State>}
       */
      jscc.global.prototype.states = [];


      /**
       * The global NfaStates object.
       * @type {jscc.NFAStates}
       */
      jscc.global.prototype.nfa_states = null;

      /**
       * The global array of DFA states.
       * @type {!Array<!jscc.classes.Dfa>}
       */
      jscc.global.prototype.dfa_states = [];

      /**
       * Contains the {@link jscc.global.Symbol#id} value of the
       * whitespace token, or -1 if the whitespace token
       * has not yet been created.
       * @type {!number}
       */
      jscc.global.prototype.whitespace_token = -1;

      /**
       * A string that the parser builds to replace the
       * ##HEADER## token in the template file.
       * @type {!string}
       */
      jscc.global.prototype.code_head = "";

      /**
       * A string that the parser builds to replace the
       * ##FOOTER## token in the template file.
       * @type {!string}
       */
      jscc.global.prototype.code_foot = "";

      /**
       * The filename of the grammar file currently in-process,
       * or the empty string when reading from a non-file input
       * source.
       * @type {!string}
       */
      jscc.global.prototype.file = "";

      /**
       * A running count of errors.
       * @type {!number}
       */
      jscc.global.prototype.errors = 0;

      /**
       * A running count of warnings.
       * @type {!number}
       */
      jscc.global.prototype.warnings = 0;

      /**
       * A running count of shift operations.
       * @type {!number}
       */
      jscc.global.prototype.shifts = 0;

      /**
       * A running count of reduce operations.
       * @type {!number}
       */
      jscc.global.prototype.reduces = 0;

      /**
       * A running count of goto operations.
       * @type {!number}
       */
      jscc.global.prototype.gotos = 0;

      /**
       * The execution mode for this program.
       * @type {!jscc.enums.EXEC}
       */
      jscc.global.prototype.exec_mode = EXEC.CONSOLE;

      /**
       * A value that the parser uses to keep track of
       * associativity levels to assign to the
       * {@link jscc.classes.Symbol#level} property.
       * @type {!number}
       */
      jscc.global.prototype.assoc_level = 1;

      /**
       * A value that the parser uses to track the
       * value assigned to the {@link jscc.classes.Nfa#weight}
       * property.
       * @type {!number}
       */
      jscc.global.prototype.regex_weight = 0;

      /**
       * When running in an environment without obvious IO,
       * contains a function with one parameter that accepts
       * the output.
       * @type {?function(string):void}
       */
      jscc.global.prototype.write_output_function = null;

      /**
       * When running in an environment without obvious IO,
       * contains a function that returns the grammar as
       * a string.
       * @type {?function():!string}
       */
      jscc.global.prototype.read_all_input_function = null;

      /**
       * When running in an environment without obvious IO,
       * contains a function that returns the template as
       * a string.
       * @type {?function():!string}
       */
      jscc.global.prototype.read_template_function = null;

      /**
       * When running in an environment without obvious IO,
       * contains a function that receives debugging output.
       * @type {?function(string):void}
       */
      jscc.global.prototype.write_debug_function = null;

      /**
       * The global module.
       * @module {jscc.global} jscc/global
       */
      return new jscc.global();
  }));

/*
 * Universal module definition for browser-specific IO.
 */
(function(root, factory) {
    /* istanbul ignore next */
    if (typeof define === 'function' && define.amd) {
        define('lib/jscc/io/ioBrowser',['require', '../global'], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory(require);
    } else {
        root.jsccio = factory(function(mod) {
            return root["jscc" + mod.split("/").pop()];
        });
    }
}(this, function(/** reqParameter */ require) {
        var global = /** @type {jscc.global} */ (require("../global"));

    /**
     * @constructor
     * @implements {jscc.io}
     */
    jscc.ioBrowser = function() {
    };

    /**
     * @inheritDoc
     */
    jscc.ioBrowser.prototype.read_all_input = function(options) {
        if (typeof global.read_all_input_function === 'function') {
            options = options || {};
            if (typeof options.chunkCallback === 'function') {
                var chunkCallback = options.chunkCallback;
                var endCallback = (typeof options.endCallback === 'function') ? options.endCallback : function() {
                };
                chunkCallback(global.read_all_input_function());
                endCallback();
            } else {
                return global.read_all_input_function();
            }
        } else {
            throw new Error("global.read_all_input_function was not defined");
        }
    };

    /**
     * @inheritDoc
     */
    jscc.ioBrowser.prototype.read_template = function(options) {
        if (typeof global.read_template_function === 'function') {
            options = options || {};
            if (typeof options.chunkCallback === 'function') {
                var chunkCallback = options.chunkCallback;
                var endCallback = (typeof options.endCallback === 'function') ? options.endCallback : function() {
                };
                chunkCallback(global.read_template_function());
                endCallback();
            } else {
                return global.read_template_function();
            }
        } else {
            throw new Error("global.read_template_function was not defined");
        }
    };

    /**
     * @inheritDoc
     */
    jscc.ioBrowser.prototype.write_output = function(options) {
        if (typeof global.write_output_function === 'function') {
            var text = "";
            var callback = function() {
            };
            if (typeof options === 'string') {
                text = options;
            } else if (options && (typeof options === 'object')) {
                if (typeof options.text === 'string') {
                    text = options.text;
                } else {
                    throw new Error("options was not a string, and options.text was not a string");
                }
                if (typeof options.callback === 'function') {
                    callback = options.callback;
                }
            }
            global.write_output_function(text);
            callback();
        } else {
            throw new Error("global.write_output_function was not defined");
        }
    };

    /**
     * @inheritDoc
     */
    jscc.ioBrowser.prototype.write_debug = function(text) {
        if (typeof global.write_debug_function === 'function') {
            global.write_debug_function(text);
        }
    };

    /**
     * @inheritDoc
     */
    jscc.ioBrowser.prototype.exit = function(exitCode) {
        // Unsupported on most browser platforms.  Although PhantomJS does support
        // this feature, for consistency, don't try.
    };

    /**
     * @module jscc/io/io
     */
    return new jscc.ioBrowser();
}));

(function(root, factory) {
    /* istanbul ignore next */
    if (typeof define === 'function' && define.amd) {
        define('lib/jscc/enums/LOG_LEVEL',factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.jsccLOG_LEVEL = factory();
    }
}(this, function() {
        /**
     * Module containing LOG_LEVEL enumeration.
     * @module jscc/enums/LOG_LEVEL
     */
    return jscc.enums.LOG_LEVEL;
}));

/**
 * Universal module definition for util.
 */
(function(root, factory) {
    /* istanbul ignore next */
    if (typeof define === 'function' && define.amd) {
        define('lib/jscc/util',['require', './enums/LOG_LEVEL'], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory(require);
    } else {
        root.jsccutil =
            factory(function(mod) {
                return root["jscc" + mod.split("/").pop()];
            });
    }
}(this,
  /**
   * @param {reqParameter} require
   * @param {...*} others
   * @returns {jscc.util}
   */
  function(require, others) {
        var LOG_LEVEL = require("./enums/LOG_LEVEL");

    /**
     * Utility functions.
     * @module {jscc.util} jscc/util
     */
    /**
     * @constructor
     */
    jscc.util = function() {
    };
    jscc.util.prototype = {
        /**
         * Unions the content of two arrays.
         * @template T
         * @param {!Array<T>} dest_array - The destination array.
         * @param {!Array<T>} src_array - The source array.  Elements
         * that are not in dest_array but in src_array are copied
         * to dest_array.
         * @returns {!Array<T>} The destination array, the union of
         * both input arrays.
         * @author Jan Max Meyer
         * @memberof jscc.util
         */
        union: function(dest_array, src_array) {
            var i, j;
            for (i = 0; i < src_array.length; i++) {
                for (j = 0; j < dest_array.length; j++) {
                    if (src_array[i] == dest_array[j]) {
                        break;
                    }
                }

                if (j == dest_array.length) {
                    dest_array.push(src_array[i]);
                }
            }

            return dest_array;
        },

        /**
         * Gets the string name (in all caps) of the
         * {@link jscc.enums.LOG_LEVEL} value provided.
         * @param {jscc.enums.LOG_LEVEL} level - The
         * LOG_LEVEL value
         * @returns {string} The name of the log level in all caps
         * @memberof jscc.Util
         */
        log_level_string: function(level) {
            switch (level) {
                case LOG_LEVEL.FATAL:
                    return "FATAL";
                case LOG_LEVEL.ERROR:
                    return "ERROR";
                case LOG_LEVEL.WARN:
                    return "WARN";
                case LOG_LEVEL.INFO:
                    return "INFO";
                case LOG_LEVEL.DEBUG:
                    return "DEBUG";
                case LOG_LEVEL.TRACE:
                    return "TRACE";
                default:
                    return "";
            }
        },

        /**
         * Gets the {@link jscc.enums.LOG_LEVEL} value
         * corresponding to the provided string.  If the string
         * is empty or invalid, returns
         * {@link jscc.enums.LOG_LEVEL.WARN} as a default.
         * @param {string} levelString - The name of the log level.
         * @returns {jscc.enums.LOG_LEVEL} The corresponding
         * LOG_LEVEL value, defaulting to WARN.
         */
        log_level_value: function(levelString) {
            switch ((levelString || "").trim().toUpperCase()) {
                case "FATAL":
                    return LOG_LEVEL.FATAL;
                case "ERROR":
                    return LOG_LEVEL.ERROR;
                case "WARN":
                    return LOG_LEVEL.WARN;
                case "INFO":
                    return LOG_LEVEL.INFO;
                case "DEBUG":
                    return LOG_LEVEL.DEBUG;
                case "TRACE":
                    return LOG_LEVEL.TRACE;
                default:
                    return LOG_LEVEL.WARN;
            }
        }
    };
    return new jscc.util();
}));

/*
 * Universal module definition for first.
 */
(function(root, factory) {
    /* istanbul ignore next */
    if (typeof define === 'function' && define.amd) {
        define('lib/jscc/first',['require', './global', './util', './enums/SYM'], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory(require);
    } else {
        root.jsccfirst = factory(function(mod) {
            return root["jscc" + mod.split("/").pop()];
        });
    }
}(this,
  /**
   * @param {reqParameter} require
   * @param {...*} others
   * @returns {jscc.first}
   */
  function(require, others) {
        var global = /** @type {jscc.global} */ (require("./global")),
        util = /** @type {jscc.util} */ (require("./util")),
        SYM = require("./enums/SYM");

    /**
     * Creates an instance of jscc.first.
     * @classdesc Functions relating to FIRST-sets.
     * @constructor
     */
    jscc.first = function() {
    };
    /**
     * Computes the FIRST-sets for all non-terminals of the grammar.
     * Must be called right after the parse and before the table
     * generation methods are performed.
     * @author Jan Max Meyer
     */
    jscc.first.prototype.first = function() {
        var cnt = 0,
            old_cnt = 0;
        var nullable;

        do {
            old_cnt = cnt;
            cnt = 0;

            for (var i = 0; i < global.symbols.length; i++) {
                if (global.symbols[i].kind == SYM.NONTERM) {
                    for (var j = 0; j < global.symbols[i].prods.length; j++) {
                        nullable = false;
                        for (var k = 0; k < global.productions[global.symbols[i].prods[j]].rhs.length; k++) {
                            global.symbols[i].first = util.union(global.symbols[i].first,
                                                                 global.symbols[global.productions[global.symbols[i].prods[j]].rhs[k]].first);

                            nullable =
                                global.symbols[global.productions[global.symbols[i].prods[j]].rhs[k]].nullable;
                            if (!nullable) {
                                break;
                            }
                        }
                        cnt += global.symbols[i].first.length;

                        if (k == global.productions[global.symbols[i].prods[j]].rhs.length) {
                            nullable = true;
                        }

                        if (nullable) {
                            global.symbols[i].nullable = true;
                        }
                    }
                }
            }
        } while (cnt != old_cnt);
    };

    /**
     * Returns all terminals that are possible from a given position
     * of a production's right-hand side.
     * @param {jscc.classes.Item} item - Item to which the lookaheads are added.
     * @param {jscc.classes.Production} p - The production where the computation
     * should be done.
     * @param {number} begin - The offset of the symbol where the
     * rhs_first() begins its calculations.
     * @returns {boolean} True if the whole rest of the right-hand side
     * can be null (epsilon), else false.
     * @author Jan Max Meyer
     */
    jscc.first.prototype.rhs_first = function(item, p, begin) {
        var i;
        for (i = begin; i < p.rhs.length; i++) {
            item.lookahead = util.union(item.lookahead, global.symbols[p.rhs[i]].first);

            if (!global.symbols[p.rhs[i]].nullable) {
                return false;
            }
        }
        return true;
    };
    /**
     * Functions relating to FIRST-sets.
     * @module {jscc.first} jscc/first
     * @requires module:jscc/global
     * @requires module:jscc/util
     */
    return new jscc.first();
}));

/*
 * Universal module definition for logging in browsers.
 */
(function(root, factory) {
    /* istanbul ignore next */
    if (typeof define === 'function' && define.amd) {
        define('lib/jscc/log/logBrowser',['require', '../global', '../enums/LOG_LEVEL'], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory(require);
    } else {
        root.jscclog = factory(function(mod) {
            return root["jscc" + mod.split("/").pop()];
        });
    }
}(this, function(/** reqParameter */ require) {
        var global = /** @type {jscc.global} */ (require("../global")),
        LOG_LEVEL = require("../enums/LOG_LEVEL");
    
    var innerConsole = console || Console || {};
    innerConsole.log = innerConsole.log || function(msg) {
        };
    innerConsole.warn = innerConsole.warn || innerConsole.log || function(msg) {
        };
    innerConsole.error = innerConsole.error || innerConsole.log || function(msg) {
        };
    innerConsole.info = innerConsole.info || innerConsole.log || function(msg) {
        };
    innerConsole.trace = innerConsole.trace || innerConsole.log || function(msg) {
        };

    /**
     * @constructor
     * @implements {jscc.log}
     */
    jscc.logBrowser = function() {
        this._level = LOG_LEVEL.WARN;
    };

    /**
     * @type {jscc.enums.LOG_LEVEL}
     * @private
     */
    jscc.logBrowser.prototype._level = LOG_LEVEL.WARN;

    /**
     * @inheritDoc
     */
    jscc.logBrowser.prototype.fatal = function(msg) {
        if (this._level <= LOG_LEVEL.FATAL) {
            innerConsole.error(msg);
        }
        global.errors++;
    };

    /**
     * @inheritDoc
     */
    jscc.logBrowser.prototype.error = function(msg) {
        if (this._level <= LOG_LEVEL.ERROR) {
            innerConsole.error(msg);
        }
        global.errors++;
    };

    /**
     * @inheritDoc
     */
    jscc.logBrowser.prototype.warn = function(msg) {
        if (this._level <= LOG_LEVEL.WARN) {
            innerConsole.warn(msg);
        }
        global.warnings++;
    };

    /**
     * @inheritDoc
     */
    jscc.logBrowser.prototype.info = function(msg) {
        if (this._level <= LOG_LEVEL.INFO) {
            innerConsole.info(msg);
        }
    };

    /**
     * @inheritDoc
     */
    jscc.logBrowser.prototype.debug = function(msg) {
        if (this._level <= LOG_LEVEL.DEBUG) {
            innerConsole.log(msg);
        }
    };

    /**
     * @inheritDoc
     */
    jscc.logBrowser.prototype.trace = function(msg) {
        if (this._level <= LOG_LEVEL.TRACE) {
            innerConsole.trace(msg);
        }
    };

    /**
     * @inheritDoc
     */
    jscc.logBrowser.prototype.setLevel = function(level) {
        this._level = level;
    };

    /**
     * @module jscc/log/log
     */
    return new jscc.logBrowser();
}));

/*
 * Universal module definition for module containing State class.
 */
(function(root, factory) {
    /* istanbul ignore next */
    if (typeof define === 'function' && define.amd) {
        define('lib/jscc/classes/State',factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.jsccState = factory();
    }
}(this, function() {
        /**
     * Creates a new State instance.
     * @classdesc Represents a state machine entry.
     * @param {StateOptions=} o - Optional overrides for default property values.
     * @constructor
     * @memberof {jscc.classes}
     */
    jscc.classes.State = function(o) {
        var p = o || {};
        if (Array.isArray(p.kernel)) {
            this.kernel = /** @type {!Array<!jscc.classes.Item>} */ (p.kernel);
        }
        if (Array.isArray(p.epsilon)) {
            this.epsilon = /** @type {!Array<!jscc.classes.Item>} */ (p.epsilon);
        }
        if (typeof p.def_act === 'number') {
            this.def_act = /** @type {!number} */ (p.def_act);
        }
        if (typeof p.done === 'boolean') {
            this.done = /** @type {!boolean} */ (p.done);
        }
        if (typeof p.closed === 'boolean') {
            this.closed = /** @type {!boolean} */ (p.closed);
        }
        if (Array.isArray(p.actionrow)) {
            this.actionrow = /** @type {!Array<!jscc.classes.TableEntry>} */ (p.actionrow);
        }
        if (Array.isArray(p.gotorow)) {
            this.gotorow = /** @type {!Array<!jscc.classes.TableEntry>} */ (p.gotorow);
        }
    };

    /**
     * An array of items forming the kernel of this state.
     * @type {!Array<!jscc.classes.Item>}
     */
    jscc.classes.State.prototype.kernel = [];
    /**
     * An array of items forming the epsilon of this state.
     * @type {!Array<!jscc.classes.Item>}
     */
    jscc.classes.State.prototype.epsilon = [];
    /**
     * A number representing a defined action.
     * @type {!number}
     */
    jscc.classes.State.prototype.def_act = 0;
    /**
     * Whether this state has been fully processed.
     * @type {!boolean}
     */
    jscc.classes.State.prototype.done = false;
    /**
     * Whether this state is closed.
     * @type {!boolean}
     */
    jscc.classes.State.prototype.closed = false;
    /**
     * Table entries representing actions for this state.
     * @type {!Array<!jscc.classes.TableEntry>}
     */
    jscc.classes.State.prototype.actionrow = [];
    /**
     * Table entries representing goto operations for this state.
     * @type {!Array<!jscc.classes.TableEntry>}
     */
    jscc.classes.State.prototype.gotorow = [];

    /**
     * The module containing the State class.
     * @module jscc/classes/State
     */
    return jscc.classes.State;
}));

/*
 * Universal module definition for module containing the Item class.
 */
(function(root, factory) {
    /* istanbul ignore next */
    if (typeof define === 'function' && define.amd) {
        define('lib/jscc/classes/Item',factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.jsccItem = factory();
    }
}(this, function() {
        /**
     * Creates a new Item instance.
     * @classdesc Contains lookahead information associated with a production.
     * @param {ItemOptions=} o - Optional overrides for default property values.
     * @constructor
     * @const
     */
    jscc.classes.Item = function(o) {
        var p = o || {};
        if (typeof p.prod === 'number') {
            this.prod = /** @type {!number} */ (p.prod);
        }
        if (typeof p.dot_offset === 'number') {
            this.dot_offset = /** @type {!number} */ (p.dot_offset);
        }
        if (typeof p.lookahead !== 'undefined' && Array.isArray(p.lookahead)) {
            this.lookahead = /** @type {!Array<!number>} */ (p.lookahead);
        }
    };

    /**
     * The index within the global productions array of the production associated with this item.
     * @type {!number}
     */
    jscc.classes.Item.prototype.prod = -1;
    /**
     * The dot offset.
     * @type {!number}
     */
    jscc.classes.Item.prototype.dot_offset = 0;
    /**
     * An array of lookahead indexes.
     * @type {!Array<!number>}
     */
    jscc.classes.Item.prototype.lookahead = [];

    /**
     * The module containing the Item class.
     * @module {function(new:jscc.classes.Item, ItemOptions=)} jscc/classes/Item
     */
    return jscc.classes.Item;
}));

/*
 * Universal module definition for TableEntry class.
 */
(function(root, factory) {
    /* istanbul ignore next */
    if (typeof define === 'function' && define.amd) {
        define('lib/jscc/classes/TableEntry',factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.jsccTableEntry = factory();
    }
}(this, function() {
        /**
     * Creates a new TableEntry instance.
     * @classdesc An object used in the {@link jscc.classes.State#actionrow} and {@link jscc.classes.State#gotorow}
     *     arrays to indicate how symbols and actions are paired for that state.
     * @param {number} sym - A number representing a {@link jscc.classes.Symbol#id} value.
     * @param {number} act - A number representing the action associated with the symbol.
     * @constructor
     * @memberof {jscc.classes}
     * @const
     */
    jscc.classes.TableEntry = function(sym, act) {
        this.symbol = sym;
        this.action = act;
    };

    /**
     * The id value of the Symbol with which this entry is associated.
     * @type {!number}
     */
    jscc.classes.TableEntry.prototype.symbol = -1;
    /**
     * A number representing the action associated with the symbol.
     * @type {!number}
     */
    jscc.classes.TableEntry.prototype.action = -1;

    /**
     * The module containing the TableEntry class.
     * @module jscc/classes/TableEntry
     */
    return jscc.classes.TableEntry;
}));

(function(root, factory) {
    /* istanbul ignore next */
    if (typeof define === 'function' && define.amd) {
        define('lib/jscc/enums/MODE_GEN',factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.jsccMODE_GEN = factory();
    }
}(this, function() {
        /**
     * Module containing MODE_GEN enumeration.
     * @module jscc/enums/MODE_GEN
     */
    return jscc.enums.MODE_GEN;
}));

/*
 * Universal module definition for debug.
 */
(function(root, factory) {
    /* istanbul ignore next */
    if (typeof define === 'function' && define.amd) {
        define('lib/jscc/debug',['require', './global', './io/io', './enums/MODE_GEN', './enums/SYM', './enums/ASSOC'], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory(require);
    } else {
        root.jsccdebug = factory(function(mod) {
            return root["jscc" + mod.split("/").pop()];
        });
    }
}(this,
  /**
   * @param {reqParameter} require
   * @param {...*} others
   * @returns {jscc.debug}
   */
  function(require, others) {
            var io,
          global = /** @type {jscc.global} */ (require("./global")),
          MODE_GEN = require("./enums/MODE_GEN"),
          SYM = require("./enums/SYM"),
          ASSOC = require("./enums/ASSOC");

      /**
       * @suppress {uselessCode}
       */
      (function() {
          if (false) {
              io = /** @type {jscc.io} */ (require("./io/ioNode"));
          } else {
              io = /** @type {jscc.io} */ (require("./io/io"));
          }
      })();


      /**
       * Debugging-output functions.
       * @namespace jscc.debug
       */
      /**
       * Debugging-output functions.
       * @module {jscc.debug} jscc/debug
       * @requires module:jscc/global
       * @requires module:jscc/io/io
       * @constructor
       */
      jscc.debug = function() {
      };
      jscc.debug.prototype = {
          /**
           * Prints debugging output related to the current value of the
           * {@link jscc.global.symbols} array.
           * @param {jscc.enums.MODE_GEN} mode - The current output mode.
           * @memberof jscc.debug
           */
          print_symbols: function(mode) {
              if (mode == MODE_GEN.HTML) {
                  io.write_debug("<table class=\"debug\" cellpadding=\"0\" cellspacing=\"0\">");
                  io.write_debug("<tr>");
                  io.write_debug("<td class=\"tabtitle\" colspan=\"3\">Symbols Overview</td>");
                  io.write_debug("</tr>");
                  io.write_debug("<tr>");
                  io.write_debug("<td class=\"coltitle\">Symbol</td>");
                  io.write_debug("<td class=\"coltitle\">Type</td>");
                  io.write_debug("</tr>");
              } else if (mode == MODE_GEN.TEXT) {
                  io.write_debug("--- Symbol Dump ---");
              }

              for (var i = 0; i < global.symbols.length; i++) {
                  if (mode == MODE_GEN.HTML) {
                      io.write_debug("<tr>");

                      io.write_debug("<td>");
                      io.write_debug(global.symbols[i].label);
                      io.write_debug("</td>");

                      io.write_debug("<td>");
                      io.write_debug(((global.symbols[i].kind == SYM.NONTERM) ? "Non-terminal" : "Terminal"));
                      io.write_debug("</td>");
                  } else if (mode == MODE_GEN.TEXT) {
                      var output = "";

                      output = global.symbols[i].label;
                      for (var j = output.length; j < 20; j++) {
                          output += " ";
                      }

                      output += ((global.symbols[i].kind == SYM.NONTERM) ? "Non-terminal" : "Terminal");

                      if (global.symbols[i].kind == SYM.TERM) {
                          for (var j = output.length; j < 40; j++) {
                              output += " ";
                          }
                          output += global.symbols[i].level + "/";

                          switch (global.symbols[i].associativity) {
                              case ASSOC.NONE:
                                  output += "^";
                                  break;
                              case ASSOC.LEFT:
                                  output += "<";
                                  break;
                              case ASSOC.RIGHT:
                                  output += ">";
                                  break;
                          }
                      }

                      io.write_debug(output);
                  }
              }

              if (mode == MODE_GEN.HTML) {
                  io.write_debug("</table>");
              } else if (mode == MODE_GEN.TEXT) {
                  io.write_debug("");
              }
          },

          /**
           * Prints debugging output related to the grammar being processed,
           * using information from the {@link jscc.global.symbols} and
           * {@link jscc.global.productions} arrays.
           * @param {jscc.enums.MODE_GEN} mode - The current output mode.
           * @memberof jscc.debug
           */
          print_grammar: function(mode) {
              if (mode == MODE_GEN.HTML) {
                  io.write_debug("<table class=\"debug\" cellpadding=\"0\" cellspacing=\"0\">");
                  io.write_debug("<tr>");
                  io.write_debug("<td class=\"tabtitle\" colspan=\"3\">Grammar Overview</td>");
                  io.write_debug("</tr>");
                  io.write_debug("<tr>");
                  io.write_debug("<td class=\"coltitle\">Left-hand side</td>");
                  io.write_debug("<td class=\"coltitle\">FIRST-set</td>");
                  io.write_debug("<td class=\"coltitle\">Right-hand side</td>");
                  io.write_debug("</tr>");

                  for (var i = 0; i < global.symbols.length; i++) {
                      io.write_debug("<tr>");

                      if (global.symbols[i].kind == SYM.NONTERM) {
                          io.write_debug("<td>");
                          io.write_debug(global.symbols[i].label);
                          io.write_debug("</td>");

                          io.write_debug("<td>");
                          for (var j = 0; j < global.symbols[i].first.length; j++) {
                              io.write_debug("<b>" + global.symbols[global.symbols[i].first[j]].label + "</b>");
                          }
                          io.write_debug("</td>");

                          io.write_debug("<td>");
                          for (var j = 0; j < global.symbols[i].prods.length; j++) {
                              for (var k = 0; k < global.productions[global.symbols[i].prods[j]].rhs.length; k++) {
                                  if (global.symbols[global.productions[global.symbols[i].prods[j]].rhs[k]].kind ==
                                      SYM.TERM) {
                                      io.write_debug("<b>" +
                                                     global.symbols[global.productions[global.symbols[i].prods[j]].rhs[k]].label +
                                                     "</b>");
                                  } else {
                                      io.write_debug(" " +
                                                     global.symbols[global.productions[global.symbols[i].prods[j]].rhs[k]].label +
                                                     " ");
                                  }
                              }
                              io.write_debug("<br />");
                          }
                          io.write_debug("</td>");
                      }
                      io.write_debug("</tr>");
                  }
                  io.write_debug("</table>");
              } else if (mode == MODE_GEN.TEXT) {
                  var output = "";

                  for (var i = 0; i < global.symbols.length; i++) {
                      if (global.symbols[i].kind == SYM.NONTERM) {
                          output += global.symbols[i].label + " {";

                          for (var j = 0; j < global.symbols[i].first.length; j++) {
                              output += " " + global.symbols[global.symbols[i].first[j]].label + " ";
                          }

                          output += "}\n";

                          for (var j = 0; j < global.symbols[i].prods.length; j++) {
                              output += "\t";
                              for (var k = 0; k < global.productions[global.symbols[i].prods[j]].rhs.length; k++) {
                                  if (global.symbols[global.productions[global.symbols[i].prods[j]].rhs[k]].kind ==
                                      SYM.TERM) {
                                      output += "#" +
                                                global.symbols[global.productions[global.symbols[i].prods[j]].rhs[k]].label +
                                                " ";
                                  } else {
                                      output +=
                                          global.symbols[global.productions[global.symbols[i].prods[j]].rhs[k]].label +
                                          " ";
                                  }
                              }
                              output += "\n";
                          }
                      }
                  }

                  io.write_debug(output);
              }
          },

          /**
           * Prints debugging information relating to the provided array
           * of Item objects.
           * @param {jscc.enums.MODE_GEN} mode - The current output mode.
           * @param {string} label - A label for the debugging output.
           * @param {Array<!jscc.classes.Item>} item_set - The items for which to print information.
           * @memberof jscc.debug
           */
          print_item_set: function(mode, label, item_set) {
              var i, j;

              if (item_set.length == 0) {
                  return;
              }

              if (mode == MODE_GEN.HTML) {
                  io.write_debug("<table class=\"debug\" cellpadding=\"0\" cellspacing=\"0\">");
                  io.write_debug("<tr>");
                  io.write_debug("<td class=\"tabtitle\" colspan=\"2\">" + label + "</td>");
                  io.write_debug("</tr>");
                  io.write_debug("<tr>");
                  io.write_debug("<td class=\"coltitle\" width=\"35%\">Lookahead</td>");
                  io.write_debug("<td class=\"coltitle\" width=\"65%\">Production</td>");
                  io.write_debug("</tr>");
              } else if (mode == MODE_GEN.TEXT) {
                  io.write_debug("--- " + label + " ---");
              }

              for (i = 0; i < item_set.length; i++) {
                  if (mode == MODE_GEN.HTML) {
                      io.write_debug("<tr>");
                      io.write_debug("<td>");
                      for (j = 0; j < item_set[i].lookahead.length; j++) {
                          io.write_debug("<b>" + global.symbols[item_set[i].lookahead[j]].label + "</b> ");
                      }
                      io.write_debug("</td>");

                      io.write_debug("<td>");
                      io.write_debug(global.symbols[global.productions[item_set[i].prod].lhs].label + " -&gt; ");
                      for (j = 0; j < global.productions[item_set[i].prod].rhs.length; j++) {
                          if (j == item_set[i].dot_offset) {
                              io.write_debug(".");
                          }

                          if (global.symbols[global.productions[item_set[i].prod].rhs[j]].kind == SYM.TERM) {
                              io.write_debug("<b>" + global.symbols[global.productions[item_set[i].prod].rhs[j]].label +
                                             "</b>");
                          } else {
                              io.write_debug(
                                  " " + global.symbols[global.productions[item_set[i].prod].rhs[j]].label + " ");
                          }
                      }

                      if (j == item_set[i].dot_offset) {
                          io.write_debug(".");
                      }
                      io.write_debug("</td>");
                      io.write_debug("</tr>");
                  } else if (mode == MODE_GEN.TEXT) {
                      var out = "";

                      out += global.symbols[global.productions[item_set[i].prod].lhs].label;

                      for (j = out.length; j < 20; j++) {
                          out += " ";
                      }

                      out += " -> ";

                      for (j = 0; j < global.productions[item_set[i].prod].rhs.length; j++) {
                          if (j == item_set[i].dot_offset) {
                              out += ".";
                          }
                          if (global.symbols[global.productions[item_set[i].prod].rhs[j]].kind == SYM.TERM) {
                              out += " #" + global.symbols[global.productions[item_set[i].prod].rhs[j]].label + " ";
                          } else {
                              out += " " + global.symbols[global.productions[item_set[i].prod].rhs[j]].label + " ";
                          }
                      }

                      if (j == item_set[i].dot_offset) {
                          out += ".";
                      }

                      for (j = out.length; j < 60; j++) {
                          out += " ";
                      }
                      out += "{ ";

                      for (j = 0; j < item_set[i].lookahead.length; j++) {
                          out += "#" + global.symbols[item_set[i].lookahead[j]].label + " ";
                      }

                      out += "}";

                      io.write_debug(out);
                  }
              }

              if (mode == MODE_GEN.HTML) {
                  io.write_debug("</table>");
              }
          }
      };
      return new jscc.debug();
  }));

/*
 * Universal module definition for tabgen.
 */
(function(root, factory) {
    /* istanbul ignore next */
    if (typeof define === 'function' && define.amd) {
        define('lib/jscc/tabgen',['require', './global', './first', './util', './log/log', './classes/State', './classes/Item',
                './classes/TableEntry', './classes/Symbol', './enums/SPECIAL', './enums/ASSOC', './enums/SYM',
                './enums/MODE_GEN', './enums/EXEC', './debug'], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory(require);
    } else {
        root.jscctabgen = factory(function(mod) {
            return root["jscc" + mod.split("/").pop()];
        });
    }
}(this,
  /**
   * @param {reqParameter} require
   * @param {...*} others
   * @returns {jscc.tabgen}
   */
  function(require, others) {
            var log;
      var global = require("./global");
      var first = require("./first");
      var util = require("./util");

      /**
       * @suppress {uselessCode}
       */
      (function() {
          if (false) {
              log = require("./log/logNode");
          } else {
              log = require("./log/log");
          }
      })();
      
      var State = /** @type {function(new:jscc.classes.State, StateOptions=)} */ (require("./classes/State"));
      var Item = /** @type {function(new:jscc.classes.Item, ItemOptions=)} */ (require("./classes/Item"));
      var TableEntry = /** @type {function(new:jscc.classes.TableEntry, number, number)} */ (require(
          "./classes/TableEntry"));
      var Symbol = /** @type {function(new:jscc.classes.Symbol, SymbolOptions=)} */ (require("./classes/Symbol"));
      var SPECIAL = require("./enums/SPECIAL");
      var ASSOC = require("./enums/ASSOC");
      var SYM = require("./enums/SYM");
      var EXEC = require("./enums/EXEC");
      var MODE_GEN = require("./enums/MODE_GEN");
      var debugFunctions = require("./debug");

      /**
       * Contains table-generation functions.
       * @module {jscc.tabgen} jscc/tabgen
       * @requires module:jscc/global
       * @requires module:jscc/first
       * @requires module:jscc/util
       * @requires module:jscc/log/log
       * @constructor
       */
      jscc.tabgen = function() {
      };

      /**
       * Creates a new {@link jscc.classes.State} object, adds it to the global states array,
       * and returns the new {@link jscc.classes.State} object.
       * @returns {!jscc.classes.State} The newly-created, default State object.
       */
      jscc.tabgen.prototype.create_state = function() {
          var state = new State({
              kernel: [],
              epsilon: [],
              actionrow: [],
              gotorow: [],
              done: false,
              closed: false,
              def_act: 0
          });
          global.states.push(state);
          return state;
      };

      /**
       * Creates and returns a new Item instance using the specified parameter
       * as the {@link jscc.classes.Item#prod} value.
       * @param {number} p - The prod value of the new Item instance.
       * @returns {!jscc.classes.Item} The new Item instance.
       */
      jscc.tabgen.prototype.create_item = function(p) {
          return new Item({
              prod: p,
              dot_offset: 0,
              lookahead: []
          });
      };

      /**
       * If row already contains a {@link jscc.classes.TableEntry} with the given symbol,
       * returns row.  Otherwise, adds a new TableEntry with the
       * provided symbol and action to the row, then returns the row.
       * @param {Array<!jscc.classes.TableEntry>} row - The row to check for the
       * given symbol.
       * @param {number} sym - The symbol for which to check, or if not found,
       * the symbol that becomes part of the new TableEntry.
       * @param {number} act - The action that becomes part of the new
       * TableEntry, should one be created.
       * @returns {!Array<!jscc.classes.TableEntry>} The row parameter with the possible
       * addition of a new TableEntry if no TableEntry with the given symbol
       * was already in the row.
       */
      jscc.tabgen.prototype.add_table_entry = function(row, sym, act) {
          for (var i = 0; i < row.length; i++) {
              if (row[i].symbol == sym) {
                  return row;
              }
          }
          row.push(new TableEntry(sym, act));
          return row;
      };

      /**
       * If row already contains a {@link jscc.classes.TableEntry} with the given symbol,
       * updates the {@link jscc.classes.TableEntry#action}
       * property of that TableEntry to match the given action.  If the
       * symbol is not present, no changes are made to the row.  Either way,
       * the row is returned.
       * @param {Array<!jscc.classes.TableEntry>} row - The row to check for the given
       * symbol.
       * @param {number} sym - The symbol for which to check.
       * @param {number} act - The action to which to update a TableEntry
       * containing the given symbol.
       * @returns {!Array<!jscc.classes.TableEntry>} The row parameter, possibly with one
       * modified TableEntry.
       */
      jscc.tabgen.prototype.update_table_entry = function(row, sym, act) {
          var i;
          for (i = 0; i < row.length; i++) {
              if (row[i].symbol == sym) {
                  row[i].action = act;
                  return row;
              }
          }
          return row;
      };

      /**
       * If row contains a {@link jscc.classes.TableEntry} with the given symbol, removes that
       * symbol's TableEntry and returns the row.  Otherwise, simply
       * returns the row.
       * @param {Array<!jscc.classes.TableEntry>} row - The row to check for the given
       * symbol.
       * @param {number} sym - The symbol for which to check and, if found,
       * delete.
       * @returns {!Array<!jscc.classes.TableEntry>} The row parameter, possibly with one
       * fewer TableEntry.
       */
      jscc.tabgen.prototype.remove_table_entry = function(row, sym) {
          for (var i = 0; i < row.length; i++) {
              if (row[i].symbol == sym) {
                  row.splice(i, 1);
                  return row;
              }
          }
          return row;
      };

      /**
       * If row contains a TableEntry with the given symbol, returns that
       * TableEntry's {@link jscc.classes.TableEntry#action} property.
       * Otherwise, returns void(0).
       * @param {Array<!jscc.classes.TableEntry>} row - The row to check for the given
       * symbol.
       * @param {number} sym - The symbol for which to check.
       * @returns {(number|void)}
       */
      jscc.tabgen.prototype.get_table_entry = function(row, sym) {
          for (var i = 0; i < row.length; i++) {
              if (row[i].symbol == sym) {
                  return row[i].action;
              }
          }
          return void(0);
      };

      /**
       * Returns the index of the first {@link jscc.global.states}
       * array entry whose {@link jscc.global.State#done} property
       * is false, or -1 if no such entry exists.
       * @returns {number} The index of the first undone state, or -1 if
       * no undone states exist.
       */
      jscc.tabgen.prototype.get_undone_state = function() {
          for (var i = 0; i < global.states.length; i++) {
              if (global.states[i].done == false) {
                  return i;
              }
          }
          return -1;
      };

      /**
       * Compares two {@link jscc.classes.Item} objects for
       * sorting purposes by comparing their
       * {@link jscc.classes.Item#prod} values.
       * @param {!jscc.classes.Item} a - The first Item
       * @param {!jscc.classes.Item} b - The second Item
       * @returns {number} Less than zero if a.prod < b.prod;
       * greater than zero if a.prod > b.prod; zero if
       * a.prod equals b.prod.
       */
      jscc.tabgen.prototype.sort_partition = function(a, b) {
          return a.prod - b.prod;
      };

      /**
       * Returns the index within the {@link jscc.global.symbols}
       * array of the first symbol with the given label, SYM, and
       * SPECIAL values.  If no such symbol is found, returns -1.
       * @param {string} label - The symbol label for which to search.
       * @param {jscc.enums.SYM} kind - Whether the symbol is terminating or
       * nonterminating.
       * @param {jscc.enums.SPECIAL=} special - The type of special symbol, if any.
       * Defaults to NONE.
       * @returns {number} - The index within the symbols array of the
       * first matching symbol, or -1 if there are no matching symbols.
       */
      jscc.tabgen.prototype.find_symbol = function(label, kind, special) {
          if (!special) {
              special = SPECIAL.NONE;
          }
          for (var i = 0; i < global.symbols.length; i++) {
              if (global.symbols[i].label.toString() == label.toString()
                  && global.symbols[i].kind == kind
                  && global.symbols[i].special == special) {
                  return i;
              }
          }
          return -1;
      };

      /**
       * Creates a new symbol (if necessary) and appends it to the
       * global symbol array.  If the symbol does not already exist,
       * the instance of that symbol is returned only.
       * @param {string} label - The label of the symbol.  In case
       * of kind == SYM.NONTERM, the label is the name of the
       * right-hand side, else it is the regular expression for the
       * terminal symbol.
       * @param {jscc.enums.SYM} kind - Type of the symbol.  This can be
       * SYM.NONTERM or SYM.TERM.
       * @param {jscc.enums.SPECIAL} special - Specialized symbols.
       * @returns {number} The id property of the particular Symbol
       * object.
       * @author Jan Max Meyer
       */
      jscc.tabgen.prototype.create_symbol = function(label, kind, special) {
          var exists;

          if ((exists = this.find_symbol(label, kind, special)) > -1) {
              return global.symbols[exists].id;
          }

          var sym = new Symbol({
              label: label,
              kind: kind,
              prods: [],
              nullable: false,
              id: global.symbols.length,
              code: "",
              associativity: ASSOC.NONE,
              level: 0,
              special: special,
              defined: false,
              first: []
          });

          if (kind == SYM.TERM) {
              sym.first.push(sym.id);
          }

          global.symbols.push(sym);
          return sym.id;
      };

      /**
       * Checks if two item sets contain the same items.  The
       * items may only differ in their lookahead.
       * @param {Array<!jscc.classes.Item>} set1 - Set to be compared with
       * set2.
       * @param {Array<!jscc.classes.Item>} set2 - Set to be compared with
       * set1.
       * @returns {boolean} True if equal, else false.
       * @author Jan Max Meyer
       */
      jscc.tabgen.prototype.item_set_equal = function(set1, set2) {
          var i, j, cnt = 0;

          if (set1.length != set2.length) {
              return false;
          }

          for (i = 0; i < set1.length; i++) {
              for (j = 0; j < set2.length; j++) {
                  if (set1[i].prod == set2[j].prod &&
                      set1[i].dot_offset == set2[j].dot_offset) {
                      cnt++;
                      break;
                  }
              }
          }
          return cnt == set1.length;
      };

      /**
       *
       * @param {Array<!jscc.classes.Item>} seed
       * @param {Array<!jscc.classes.Item>} closure
       * @returns {number}
       * @author Jan Max Meyer
       */
      jscc.tabgen.prototype.close_items = function(seed, closure) {
          var i, j, k;
          var cnt = 0, tmp_cnt = 0;
          var item;

          for (i = 0; i < seed.length; i++) {
              if (seed[i].dot_offset < global.productions[seed[i].prod].rhs.length) {
                  if (global.symbols[global.productions[seed[i].prod].rhs[seed[i].dot_offset]].kind ==
                      SYM.NONTERM) {
                      for (j = 0;
                           j < global.symbols[global.productions[seed[i].prod].rhs[seed[i].dot_offset]].prods.length;
                           j++) {
                          for (k = 0; k < closure.length; k++) {
                              if (closure[k].prod ==
                                  global.symbols[global.productions[seed[i].prod].rhs[seed[i].dot_offset]].prods[j]) {
                                  break;
                              }
                          }

                          if (k == closure.length) {
                              item =
                                  this.create_item(
                                      global.symbols[global.productions[seed[i].prod].rhs[seed[i].dot_offset]].prods[j]);
                              closure.push(item);

                              cnt++;
                          }

                          tmp_cnt = closure[k].lookahead.length;
                          if (first.rhs_first(closure[k], global.productions[seed[i].prod], seed[i].dot_offset + 1)) {
                              closure[k].lookahead = util.union(closure[k].lookahead, seed[i].lookahead);
                          }

                          cnt += closure[k].lookahead.length - tmp_cnt;
                      }
                  }
              }
          }

          return cnt;
      };

      /**
       * @summary Implements the LALR(1) closure algorithm.
       * @description A short overview:
       *  1. Closing a closure_set of Item objects from a given
       *     kernel seed (this includes the kernel seed itself!)
       *  2. Moving all epsilon items to the current state's epsilon
       *     set.
       *  3. Moving all symbols with the same symbol right to the
       *     dot to a partition set.
       *  4. Check if there is already a state with the same items
       *     as there are in the partition.  If so, union the
       *     lookaheads, else, create a new state and set the
       *     partition as kernel seed.
       *  5. If the (probably new) state was not closed yet, perform
       *     some table creation: If there is a terminal to the
       *     right of the dot, do a shift on the action table, else
       *     do a goto on the goto table.  Reductions are performed
       *     later, when all states are closed.
       * @param {number} s - Id of the state that should be closed.
       * @author Jan Max Meyer
       */
      jscc.tabgen.prototype.lalr1_closure = function(s) {
          var closure = [], nclosure, partition;
          var partition_sym;
          var i, j, cnt = 0, old_cnt = 0, tmp_cnt, ns;

          do {
              old_cnt = cnt;
              cnt = this.close_items(((old_cnt == 0) ? global.states[s].kernel : closure), closure);
          } while (cnt != old_cnt);

          for (i = 0; i < global.states[s].kernel.length; i++) {
              if (global.states[s].kernel[i].dot_offset <
                  global.productions[global.states[s].kernel[i].prod].rhs.length) {
                  closure.unshift(new Item({
                      prod: global.states[s].kernel[i].prod,
                      dot_offset: global.states[s].kernel[i].dot_offset,
                      lookahead: []
                  }));
                  for (j = 0; j < global.states[s].kernel[i].lookahead.length; j++) {
                      closure[0].lookahead[j] = global.states[s].kernel[i].lookahead[j];
                  }
              }
          }

          for (i = 0; i < closure.length; i++) {
              if (global.productions[closure[i].prod].rhs.length == 0) {
                  for (j = 0; j < global.states[s].epsilon.length; j++) {
                      if (global.states[s].epsilon[j].prod == closure[i].prod
                          && global.states[s].epsilon[j].dot_offset == closure[i].dot_offset) {
                          break;
                      }
                  }
                  if (j == global.states[s].epsilon.length) {
                      global.states[s].epsilon.push(closure[i]);
                  }
                  closure.splice(i, 1);
              }
          }

          while (closure.length > 0) {
              partition = [];
              nclosure = [];
              partition_sym = -1;

              for (i = 0; i < closure.length; i++) {
                  if (partition.length == 0) {
                      partition_sym = global.productions[closure[i].prod].rhs[closure[i].dot_offset];
                  }

                  if (closure[i].dot_offset < global.productions[closure[i].prod].rhs.length) {
                      if (global.productions[closure[i].prod].rhs[closure[i].dot_offset] == partition_sym) {
                          closure[i].dot_offset++;
                          partition.push(closure[i]);
                      } else {
                          nclosure.push(closure[i]);
                      }
                  }
              }

              if (partition.length > 0) {
                  // beachcoder Feb 23, 2009:
                  // Uhh here was a very exciting bug that only came up on
                  // special grammar constellations: If we don't sort the
                  // partition set by production here, it may happen that
                  // states get wrong lookahead, and unexpected conflicts
                  // or failing grammars come up.
                  partition.sort(this.sort_partition);

                  // Now one can check for equality
                  for (i = 0; i < global.states.length; i++) {
                      if (this.item_set_equal(global.states[i].kernel, partition)) {
                          break;
                      }
                  }

                  if (i == global.states.length) {
                      ns = this.create_state();
                      ns.kernel = partition;
                  }

                  tmp_cnt = 0;
                  cnt = 0;

                  for (j = 0; j < partition.length; j++) {
                      tmp_cnt += global.states[i].kernel[j].lookahead.length;
                      global.states[i].kernel[j].lookahead =
                          util.union(global.states[i].kernel[j].lookahead, partition[j].lookahead);
                      cnt += global.states[i].kernel[j].lookahead.length;
                  }

                  if (tmp_cnt != cnt) {
                      global.states[i].done = false;
                  }

                  if (!(global.states[s].closed)) {
                      for (j = 0; j < partition.length; j++) {
                          if (partition[j].dot_offset - 1 < global.productions[partition[j].prod].rhs.length) {
                              if (global.symbols[global.productions[partition[j].prod].rhs[partition[j].dot_offset -
                                                                                           1]].kind ==
                                  SYM.TERM) {
                                  global.states[s].actionrow = this.add_table_entry(global.states[s].actionrow,
                                                                                    global.productions[partition[j].prod].rhs[partition[j].dot_offset -
                                                                                                                              1],
                                                                                    i);
                                  global.shifts++;
                              } else {
                                  global.states[s].gotorow = this.add_table_entry(global.states[s].gotorow,
                                                                                  global.productions[partition[j].prod].rhs[partition[j].dot_offset -
                                                                                                                            1],
                                                                                  i);
                                  global.gotos++;
                              }
                          }
                      }
                  }
              }
              closure = nclosure;
          }
          global.states[s].closed = true;
      };

      /**
       * Inserts reduce-cells into the action table.  A reduction
       * does always occur for items with the dot to the far right
       * of the production and to items with no production (epsilon
       * items).
       *
       * The reductions are done on the corresponding lookahead
       * symbols.  If a shift-reduce conflict appears, the function
       * will always behave in favor of the shift.
       *
       * Reduce-reduce conflicts are reported immediately, and need
       * to be solved.
       * @param {number} s - The index of the state where the
       * reductions take effect.
       * @author Jan Max Meyer
       */
      jscc.tabgen.prototype.do_reductions = function(s) {
          var n, i, j, ex, act, output_warning, item_set;

          var reds = [];
          var max = 0, count;

          for (n = 0; n < 2; n++) {
              if (!n) {
                  item_set = global.states[s].kernel;
              } else {
                  item_set = global.states[s].epsilon;
              }

              for (i = 0; i < item_set.length; i++) {
                  if (item_set[i].dot_offset == global.productions[item_set[i].prod].rhs.length) {
                      for (j = 0; j < item_set[i].lookahead.length; j++) {
                          output_warning = true;

                          ex = this.get_table_entry(global.states[s].actionrow,
                                                    item_set[i].lookahead[j]);

                          if (ex == void(0)) {
                              act = -1 * item_set[i].prod;

                              global.states[s].actionrow = this.add_table_entry(global.states[s].actionrow,
                                                                                item_set[i].lookahead[j], act);

                              global.reduces++;
                          } else {
                              act = ex;
                              var warning = "";
                              if (ex > 0) {
                                  // Shift-reduce conflict

                                  // Is there any level specified?
                                  if (global.symbols[item_set[i].lookahead[j]].level > 0
                                      || global.productions[item_set[i].prod].level > 0) {
                                      // Is the level the same?
                                      if (global.symbols[item_set[i].lookahead[j]].level ==
                                          global.productions[item_set[i].prod].level) {
                                          // In case of left-associativity, reduce
                                          if (global.symbols[item_set[i].lookahead[j]].associativity == ASSOC.LEFT) {
                                              // Reduce
                                              act = -1 * item_set[i].prod;
                                          } else if (global.symbols[item_set[i].lookahead[j]].associativity ==
                                                     ASSOC.NOASSOC) {
                                              // else, if nonassociativity is set,
                                              // remove table entry
                                              this.remove_table_entry(global.states[s].actionrow,
                                                                      item_set[i].lookahead[j]);
                                              log.warn("Removing nonassociative symbol '" +
                                                       global.symbols[item_set[i].lookahead[j]].label +
                                                       "' in state " + s);

                                              output_warning = false;
                                          }
                                      } else {
                                          // If symbol precedence is lower production's
                                          // precedence, reduce
                                          if (global.symbols[item_set[i].lookahead[j]].level <
                                              global.productions[item_set[i].prod].level) {
                                              // Reduce
                                              act = -1 * item_set[i].prod;
                                          }
                                      }
                                  }

                                  warning = "Shift";
                              } else {
                                  // Reduce-reduce conflict
                                  act = ((act * -1 < item_set[i].prod) ?
                                      act : -1 * item_set[i].prod);

                                  warning = "Reduce";
                              }

                              warning += "-reduce conflict on symbol '" +
                                         global.symbols[item_set[i].lookahead[j]].label +
                                         "' in state " + s;
                              warning += "\n         Conflict resolved by " +
                                         ((act <= 0) ? "reducing with production" :
                                             "shifting to state") + " " +
                                         ((act <= 0) ? act * -1 : act);

                              if (output_warning) {
                                  log.warn(warning);
                              }

                              if (act != ex) {
                                  this.update_table_entry(global.states[s].actionrow,
                                                          item_set[i].lookahead[j], act);
                              }
                          }
                      }
                  }
              }
          }

          // Find most common reduction
          global.states[s].def_act = -1; // Define no default action

          // Are there any reductions?  Then select the best of them.
          for (i = 0; i < reds.length; i++) {
              for (j = 0, count = 0; j < reds.length; j++) {
                  if (reds[j] == reds[i]) {
                      count++;
                  }
              }
              if (max < count) {
                  max = count;
                  global.states[s].def_act = reds[i];
              }
          }

          // Remove all default reduce action reductions, if they exist.
          if (global.states[s].def_act >= 0) {
              do {
                  count = global.states[s].actionrow.length;

                  for (i = 0; i < global.states[s].actionrow.length; i++) {
                      if (global.states[s].actionrow[i][1] == global.states[s].def_act * -1) {
                          global.states[s].actionrow.splice(i, 1);
                      }
                  }
              } while (count != global.states[s].actionrow.length);
          }
      };

      /**
       * Entry function to perform table generation.  If all states
       * of the parsing state machine are constructed, all reduce
       * operations are inserted in the particular positions of the
       * action table.
       *
       * If there is a Shift-reduce conflict, the shift takes the
       * higher precedence.  Reduce-reduce conflicts are resolved by
       * choosing the first defined production.
       * @param {boolean} debug - Toggle debug trace output.  This
       * should only be switched on when JS/CC is executed in a web
       * environment, because HTML-code will be printed.
       * @author Jan Max Meyer
       */
      jscc.tabgen.prototype.lalr1_parse_table = function(debug) {
          var i, item, s;

          // Create EOF symbol
          item = this.create_item(0);
          s = this.create_symbol("$", SYM.TERM, SPECIAL.EOF);
          item.lookahead.push(s);

          // Create first state
          s = this.create_state();
          s.kernel.push(item);

          while ((i = this.get_undone_state()) >= 0) {
              global.states[i].done = true;
              this.lalr1_closure(i);
          }

          for (i = 0; i < global.states.length; i++) {
              this.do_reductions(i);
          }

          if (debug) {
              for (i = 0; i < global.states.length; i++) {
                  debugFunctions.print_item_set((global.exec_mode == EXEC.CONSOLE) ?
                                                    MODE_GEN.TEXT :
                                                    MODE_GEN.HTML,
                                                "states[" + i + "].kernel", global.states[i].kernel);
                  debugFunctions.print_item_set((global.exec_mode == EXEC.CONSOLE) ?
                                                    MODE_GEN.TEXT :
                                                    MODE_GEN.HTML,
                                                "states[" + i + "].epsilon", global.states[i].epsilon);
              }

              log.debug(global.states.length + " States created.");
          }
      };

      return new jscc.tabgen();
  }));

/*
 * Universal module definition for printtab.
 */
(function(root, factory) {
    /* istanbul ignore next */
    if (typeof define === 'function' && define.amd) {
        define('lib/jscc/printtab',['require', './global', './tabgen', './log/log', './enums/MODE_GEN', './enums/SYM', './enums/SPECIAL'],
               factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory(require);
    } else {
        root.jsccprinttab =
            factory(function(mod) {
                return root["jscc" + mod.split("/").pop()];
            });
    }
}(this,
  /**
   * @param {reqParameter} require
   * @param {...*} others
   * @returns {jscc.printtab}
   */
  function(require, others) {
            var log, global = /** @type {jscc.global} */ (require("./global")),
          tabgen = /** @type {jscc.tabgen} */ (require("./tabgen")),
          MODE_GEN = require("./enums/MODE_GEN"),
          SYM = require("./enums/SYM"),
          SPECIAL = require("./enums/SPECIAL");

      /**
       * @suppress {uselessCode}
       */
      (function() {
          if (false) {
              log = /** @type {jscc.log} */ (require("./log/logNode"));
          } else {
              log = /** @type {jscc.log} */ (require("./log/log"));
          }
      })();

      /**
       * Functions for printing parse tables.
       * @module {jscc.printtab} jscc/printtab
       * @requires module:jscc/global
       * @requires module:jscc/tabgen
       * @requires module:jscc/log/log
       * @requires module:jscc/enums/MODE_GEN
       * @requires module:jscc/enums/SYM
       * @requires module:jscc/enums/SPECIAL
       */
      /**
       * @constructor
       */
      jscc.printtab = function() {
      };
      jscc.printtab.prototype = {
          /**
           * Prints the parse tables in a desired format.
           * @param {(jscc.enums.MODE_GEN|string)} mode - The output mode.
           * This can be either {@link jscc.enums.MODE_GEN.JS} to create JavaScript/
           * JScript code as output or {@link jscc.enums.MODE_GEN.HTML} to create
           * HTML-tables as output (the HTML-tables are formatted to
           * look nice with the JS/CC Web Environment).
           * @returns {string} The code to be printed to a file or
           * website.
           * @author Jan Max Meyer
           * @memberof jscc.printtab
           */
          print_parse_tables: function(mode) {
              var code = "";
              var i, j, deepest = 0, val;
              switch (mode) {
                  case MODE_GEN.HTML:
                  case "html":
                      code += "<table class=\"print\" cellpadding=\"0\" cellspacing=\"0\">";
                      code += "<tr>";
                      code += "<td class=\"tabtitle\" colspan=\"2\">Pop-Table</td>";
                      code += "</tr>";
                      code +=
                          "<td class=\"coltitle\" width=\"1%\" style=\"border-right: 1px solid lightgray;\">Left-hand side</td>";
                      code += "<td class=\"coltitle\">Number of symbols to pop</td>";
                      code += "</tr>";
                      for (i = 0; i < global.productions.length; i++) {
                          code += "<tr>";
                          code +=
                              "<td style=\"border-right: 1px solid lightgray;\">" + global.productions[i].lhs + "</td>";
                          code += "<td>" + global.productions[i].rhs.length + "</td>";
                          code += "</tr>";
                      }
                      code += "</table>";

                      for (i = 0; i < global.symbols.length; i++) {
                          if (global.symbols[i].kind == SYM.TERM) {
                              deepest++;
                          }
                      }

                      code += "<table class=\"print\" cellpadding=\"0\" cellspacing=\"0\">";
                      code += "<tr>";
                      code += "<td class=\"tabtitle\" colspan=\"" + (deepest + 1) + "\">Action-Table</td>";
                      code += "</tr>";

                      code +=
                          "<td class=\"coltitle\" width=\"1%\" style=\"border-right: 1px solid lightgray;\">State</td>";
                      for (i = 0; i < global.symbols.length; i++) {
                          if (global.symbols[i].kind == SYM.TERM) {
                              code += "<td><b>" + global.symbols[i].label + "</b></td>";
                          }
                      }

                      code += "</tr>";

                      for (i = 0; i < global.states.length; i++) {
                          code += "<tr>";
                          code += "<td class=\"coltitle\" style=\"border-right: 1px solid lightgray;\">" + i + "</td>";

                          for (j = 0; j < global.symbols.length; j++) {
                              if (global.symbols[j].kind == SYM.TERM) {
                                  code += "<td>";
                                  if ((val = tabgen.get_table_entry(global.states[i].actionrow, j)) != void(0)) {
                                      if (val <= 0) {
                                          code += "r" + (val * -1);
                                      } else {
                                          code += "s" + val;
                                      }
                                  }
                                  code += "</td>";
                              }
                          }

                          code += "</tr>";
                      }

                      code += "</table>";

                      for (i = 0; i < global.symbols.length; i++) {
                          if (global.symbols[i].kind == SYM.NONTERM) {
                              deepest++;
                          }
                      }

                      code += "<table class=\"print\" cellpadding=\"0\" cellspacing=\"0\">";
                      code += "<tr>";
                      code += "<td class=\"tabtitle\" colspan=\"" + (deepest + 1) + "\">Goto-Table</td>";
                      code += "</tr>";

                      code +=
                          "<td class=\"coltitle\" width=\"1%\" style=\"border-right: 1px solid lightgray;\">State</td>";
                      for (i = 0; i < global.symbols.length; i++) {
                          if (global.symbols[i].kind == SYM.NONTERM) {
                              code += "<td>" + global.symbols[i].label + "</td>";
                          }
                      }

                      code += "</tr>";

                      for (i = 0; i < global.states.length; i++) {
                          code += "<tr>";
                          code += "<td class=\"coltitle\" style=\"border-right: 1px solid lightgray;\">" + i + "</td>";

                          for (j = 0; j < global.symbols.length; j++) {
                              if (global.symbols[j].kind == SYM.NONTERM) {
                                  code += "<td>";
                                  if ((val = tabgen.get_table_entry(global.states[i].gotorow, j)) != void(0)) {
                                      code += val;
                                  }
                                  code += "</td>";
                              }
                          }

                          code += "</tr>";
                      }

                      code += "</table>";

                      code += "<table class=\"print\" cellpadding=\"0\" cellspacing=\"0\">";
                      code += "<tr>";
                      code += "<td class=\"tabtitle\" colspan=\"2\">Default Actions Table</td>";
                      code += "</tr>";
                      code +=
                          "<td class=\"coltitle\" width=\"1%\" style=\"border-right: 1px solid lightgray;\">Left-hand side</td>";
                      code += "<td class=\"coltitle\">Number of symbols to pop</td>";
                      code += "</tr>";
                      for (i = 0; i < global.states.length; i++) {
                          code += "<tr>";
                          code += "<td style=\"border-right: 1px solid lightgray;\">State " + i + "</td>";
                          code +=
                              "<td>" + ((global.states[i].def_act < 0) ? "(none)" : global.states[i].def_act) + "</td>";
                          code += "</tr>";
                      }
                      code += "</table>";
                      break;
                  case MODE_GEN.JS:
                  case "js":
                      var pop_tab_json = [];
                      for (i = 0; i < global.productions.length; i++) {
                          pop_tab_json.push([global.productions[i].lhs, global.productions[i].rhs.length]);
                      }
                      code += "\nvar pop_tab = " + JSON.stringify(pop_tab_json) + ";\n";

                      var act_tab_json = [];
                      for (i = 0; i < global.states.length; i++) {
                          var act_tab_json_item = [];
                          for (j = 0; j < global.states[i].actionrow.length; j++) {
                              act_tab_json_item.push(global.states[i].actionrow[j].symbol,
                                                     global.states[i].actionrow[j].action);
                          }
                          act_tab_json.push(act_tab_json_item);
                      }
                      code += "\n/** @type {!Array<!Array<number>>} */\nvar act_tab =" + JSON.stringify(act_tab_json) +
                              ";\n";

                      var goto_tab_json = [];
                      for (i = 0; i < global.states.length; i++) {
                          var goto_tab_json_item = [];
                          for (j = 0; j < global.states[i].gotorow.length; j++) {
                              goto_tab_json_item.push(global.states[i].gotorow[j].symbol,
                                                      global.states[i].gotorow[j].action);
                          }
                          goto_tab_json.push(goto_tab_json_item);
                      }
                      code += "\nvar goto_tab =" + JSON.stringify(goto_tab_json) + ";\n";

                      var defact_tab_json = [];
                      for (i = 0; i < global.states.length; i++) {
                          defact_tab_json.push(global.states[i].def_act);
                      }
                      code += "\nvar defect_tab =" + JSON.stringify(defact_tab_json) + ";\n";
                      break;
              }
              return code;
          },
          /**
           *
           * @param {Array<jscc.classes.Dfa>} dfa_states
           * @returns {Array}
           * @memberof jscc.printtab
           */
          pack_dfa: function(dfa_states) {
              var PL = function(line) {
                  var out = [];
                  while (line.length) {
                      var first = line.shift();
                      var second = line.shift();
                      if (first == second) {
                          out.push(first);
                      } else {
                          out.push([first, second]);
                      }
                  }
                  return out;
              };
              var json = [];
              for (var i = 0; i < dfa_states.length; i++) {
                  (function(i) {
                      var line = [];
                      for (var j = 0; j < dfa_states[i].line.length; j++) {
                          if (dfa_states[i].line[j] != -1) {
                              line[j] = dfa_states[i].line[j];
                          }
                      }
                      line = PL(PL(PL(PL(PL(PL(PL(PL((line)))))))));
                      json.push({
                                    line: line,
                                    accept: dfa_states[i].accept
                                });
                  })(i);
              }
              return json;
          },

          /**
           * Generates a state-machine construction from the deterministic
           * finite automata.
           * @param {Array<jscc.classes.Dfa>} dfa_states - The dfa state machine for
           * the lexing function.
           * @returns {string} The code to be inserted into the static
           * parser driver framework.
           * @author Jan Max Meyer
           * @memberof jscc.printtab
           */
          print_dfa_table: function(dfa_states) {
              var json = [], code;
              for (var i = 0; i < dfa_states.length; i++) {
                  (function(i) {
                      var line = {};
                      for (var j = 0; j < dfa_states[i].line.length; j++) {
                          if (dfa_states[i].line[j] != -1) {
                              line[j] = dfa_states[i].line[j];
                          }
                      }
                      json.push({
                                    line: line,
                                    accept: dfa_states[i].accept
                                });
                  })(i);
              }
              code = JSON.stringify(this.pack_dfa(dfa_states));
              // JSON quotes object keys, of course, but doing so breaks minimization.  So, replace keys
              // with unquoted versions, when possible.
              return code.replace(/"([A-Za-z_][A-Za-z0-9_]*)"\s*:/g, "$1:").replace(/,/g, ",\n\t");
          },

          /**
           * Prints all symbol labels into an array; this is used for
           * error reporting purposes only in the resulting parser.
           * @returns {string} The code to be inserted into the
           * static parser driver framework.
           * @author Jan Max Meyer
           * @memberof jscc.printtab
           */
          print_symbol_labels: function() {
              for (var i = 0, arr = []; i < global.symbols.length; i++) {
                  arr.push(global.symbols[i].label);
              }
              return "var labels = " + JSON.stringify(global.symbols) + ";\n\n";
          },

          /**
           * Prints the terminal symbol actions to be associated with a
           * terminal definition into a switch-case-construct.
           * @returns {string} The code to be inserted into the static
           * parser driver framework.
           * @author Jan Max Meyer
           * @memberof jscc.printtab
           */
          print_term_actions: function() {
              var code = "({\n";
              var re = /%match|%offset|%source/;
              var i, j, k;
              var semcode;
              var strmatch;
              for (i = 0; i < global.symbols.length; i++) {
                  if (global.symbols[i].kind == SYM.TERM && global.symbols[i].code != "") {
                      code += "   \"" + i + "\":";
                      code += " /** @suppress {uselessCode} */ function(PCB){";
                      semcode = "";
                      for (j = 0, k = 0; j < global.symbols[i].code.length; j++, k++) {
                          strmatch = re.exec(global.symbols[i].code.substr(j, global.symbols[i].code.length));
                          if (strmatch && strmatch.index == 0) {
                              if (strmatch[0] == "%match") {
                                  semcode += "PCB.att";
                              } else if (strmatch[0] == "%offset") {
                                  semcode += "( PCB.offset - PCB.att.length )";
                              } else if (strmatch[0] == "%source") {
                                  semcode += "PCB.src";
                              }

                              j += strmatch[0].length - 1;
                              k = semcode.length;
                          } else {
                              semcode += global.symbols[i].code.charAt(j);
                          }
                      }
                      code += "       " + semcode + "\n";
                      code += "       return PCB.att;},\n";
                  }
              }
              code += "\n})";
              return code;
          },

          /**
           * Generates a switch-case-construction that contains all
           * the semantic actions.  This construction should then be
           * generated into the static parser driver template.
           * @returns {string} The code to be inserted into the static
           * parser driver framework.
           * @author Jan Max Meyer
           * @memberof jscc.printtab
           */
          print_actions: function() {
              var code = "";
              var re = /%[0-9]+|%%/;
              var semcode, strmatch;
              var i, j, k, idx, src;
              code += "[";
              for (i = 0; i < global.productions.length; i++) {
                  src = global.productions[i].code;
                  semcode = "function(){\n";
                  semcode += "var rval;";
                  for (j = 0, k = 0; j < src.length; j++, k++) {
                      strmatch = re.exec(src.substr(j, src.length));
                      if (strmatch && strmatch.index == 0) {
                          if (strmatch[0] == "%%") {
                              semcode += "rval";
                          } else {
                              idx = parseInt(strmatch[0].substr(1, strmatch[0].length), 10);
                              idx = global.productions[i].rhs.length - idx;
                              if (idx < 0) {
                                  // The wildcard index is not valid.  Ideally, this
                                  // condition should be caught during parsing or
                                  // semantic analysis.
                                  var badProduction = global.productions[i],
                                      badLeftSymbol = global.symbols[badProduction.lhs];
                                  if (global.productions[i].rhs.length == 0) {
                                      // Likely, default code was used for an empty right-hand side
                                      log.error(
                                          "Default code was used for an empty right-hand side of a production, or a wildcard " +
                                          strmatch[0] +
                                          " was used explicitly.  The faulty left-hand side symbol label is '"
                                          + badLeftSymbol.label + "'.");
                                  } else {
                                      log.error("The wildcard " + strmatch[0] + " was used, but there are only " +
                                                global.productions[i].rhs.length +
                                                " symbols on the right-hand side of the production.  The faulty left-hand " +
                                                "side symbol label is '" + badLeftSymbol.label + "'.");
                                  }
                                  semcode += " \"\" ";
                              } else {
                                  semcode += " arguments[" + idx + "] ";
                              }
                          }
                          j += strmatch[0].length - 1;
                          k = semcode.length;
                      } else {
                          semcode += src.charAt(j);
                      }
                  }
                  code += "       " + semcode + "\nreturn rval;},\n";
              }
              code += "]";
              return code;
          },

          /**
           * Returns the value of the eof-symbol.
           * @returns {number} The id of the EOF-symbol.
           * @author Jan Max Meyer
           * @memberof jscc.printtab
           */
          get_eof_symbol_id: function() {
              var eof_id = -1;
              // Find out which symbol is for EOF
              for (var i = 0; i < global.symbols.length; i++) {
                  if (global.symbols[i].special == SPECIAL.EOF) {
                      eof_id = i;
                      break;
                  }
              }
              if (eof_id == -1) {
                  log.error("No EOF-symbol defined - This might not be possible (bug!)");
              }
              return eof_id;
          },

          /**
           * Returns the value of the error-symbol.
           * @returns {number} The id of the error-symbol.
           * @author Jan Max Meyer
           * @memberof jscc.printtab
           */
          get_error_symbol_id: function() {
              var error_id = -1;
              for (var i = 0; i < global.symbols.length; i++) {
                  if (global.symbols[i].special == SPECIAL.ERROR) {
                      error_id = i;
                      break;
                  }
              }
              if (error_id == -1) {
                  log.error("No ERROR-symbol defined - This might not be possible (bug!)");
              }
              return error_id;
          },

          /**
           * Returns the ID of the whitespace-symbol.
           * @returns {number} The id of the whitespace-symbol.
           * @author Jan Max Meyer
           * @memberof jscc.printtab
           */
          get_whitespace_symbol_id: function() {
              return global.whitespace_token;
          },

          /**
           * Returns the ID of a non-existing state.
           * @returns {number} One greater than the length of the
           * states array.
           * @author Jan Max Meyer
           * @memberof jscc.printtab
           */
          get_error_state: function() {
              return global.states.length + 1;
          }
      };
      return new jscc.printtab();
  }));

/*
 * Universal module definition for integrity.
 */
(function(root, factory) {
    /* istanbul ignore next */
    if (typeof define === 'function' && define.amd) {
        define('lib/jscc/integrity',['require', './global', './log/log', './enums/SYM'], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory(require);
    } else {
        root.jsccintegrity = factory(function(mod) {
            return root["jscc" + mod.split("/").pop()];
        });
    }
}(this,
  /**
   * @param {reqParameter} require
   * @param {...*} others
   * @returns {jscc.integrity}
   */
  function(require, others) {
            var log, global = /** @type {jscc.global} */ (require("./global")),
          SYM = require("./enums/SYM");

      /**
       * @suppress {uselessCode}
       */
      (function() {
          if (false) {
              log = /** @type {jscc.log} */ (require("./log/logNode"));
          } else {
              log = /** @type {jscc.log} */ (require("./log/log"));
          }
      })();

      /**
       * Error-checking functions.
       * @module {jscc.integrity} jscc/integrity
       * @requires module:jscc/global
       * @requires module:jscc/log/log
       */

      /**
       * @constructor
       */
      jscc.integrity = function() {
      };

      jscc.integrity.prototype = {
          /**
           * Checks the {@link jscc.global.symbols} array for
           * nonterminating, undefined symbols.  Logs an error if
           * any such symbols are found.
           */
          undef: function() {
              for (var i = 0; i < global.symbols.length; i++) {
                  if (global.symbols[i].kind == SYM.NONTERM
                      && global.symbols[i].defined == false) {
                      log.error("Call to undefined non-terminal \"" +
                                global.symbols[i].label + "\"");
                  }
              }
          },

          /**
           * Checks the {@link jscc.global.symbols} and
           * {@link jscc.global.productions} arrays for
           * unreachable, nonterminating symbols.  Logs a warning
           * if any such symbols are found.
           */
          unreachable: function() {
              var stack = [];
              var reachable = [];
              var i, j, k, l;

              for (i = 0; i < global.symbols.length; i++) {
                  if (global.symbols[i].kind == SYM.NONTERM) {
                      break;
                  }
              }

              if (i == global.symbols.length) {
                  return;
              }

              stack.push(i);
              reachable.push(i);

              while (stack.length > 0) {
                  i = stack.pop();
                  for (j = 0; j < global.symbols[i].prods.length; j++) {
                      for (k = 0; k < global.productions[global.symbols[i].prods[j]].rhs.length; k++) {
                          if (global.symbols[global.productions[global.symbols[i].prods[j]].rhs[k]].kind ==
                              SYM.NONTERM) {
                              for (l = 0; l < reachable.length; l++) {
                                  if (reachable[l] == global.productions[global.symbols[i].prods[j]].rhs[k]) {
                                      break;
                                  }
                              }

                              if (l == reachable.length) {
                                  stack.push(global.productions[global.symbols[i].prods[j]].rhs[k]);
                                  reachable.push(global.productions[global.symbols[i].prods[j]].rhs[k]);
                              }
                          }
                      }
                  }
              }

              for (i = 0; i < global.symbols.length; i++) {
                  if (global.symbols[i].kind == SYM.NONTERM) {
                      for (j = 0; j < reachable.length; j++) {
                          if (reachable[j] == i) {
                              break;
                          }
                      }
                      if (j == reachable.length) {
                          log.warn("Unreachable non-terminal \"" + global.symbols[i].label + "\"");
                      }
                  }
              }
          },

          /**
           * Checks the {@link jscc.global.states} array for
           * states with no lookahead information.  Logs an error
           * if any such states are found.
           */
          check_empty_states: function() {
              for (var i = 0; i < global.states.length; i++) {
                  if (global.states[i].actionrow.length == 0 && global.states[i].def_act == -1) {
                      log.error("No lookaheads in state " + i + ", watch for endless list definitions");
                  }
              }
          }
      };
      return new jscc.integrity();
  }));

/*
 * Universal module definition for lexdbg.
 */
(function(root, factory) {
    /* istanbul ignore next */
    if (typeof define === 'function' && define.amd) {
        define('lib/jscc/lexdbg',['require', './global', './io/io', './enums/EDGE'], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory(require);
    } else {
        root.jscclexdbg = factory(function(mod) {
            return root["jscc" + mod.split("/").pop()];
        });
    }
}(this,
  /**
   * @param {reqParameter} require
   * @param {...*} others
   * @returns {jscc.lexdbg}
   */
  function(require, others) {
            var io, global = /** @type {jscc.global} */ (require("./global")),
          EDGE = require("./enums/EDGE");

      /**
       * @suppress {uselessCode}
       */
      (function() {
          if (false) {
              io = /** @type {jscc.io} */ (require("./io/ioNode"));
          } else {
              io = /** @type {jscc.io} */ (require("./io/io"));
          }
      })();

      /**
       * Debugging-output functions for automata.
       * @module {jscc.lexdbg} jscc/lexdbg
       * @requires module:jscc/global
       * @requires module:jscc/io/io
       */
      /**
       * @constructor
       */
      jscc.lexdbg = function() {
      };
      jscc.lexdbg.prototype = {
          /**
           * Prints debugging information about the contents of the
           * {@link jscc.global.nfa_states.value} array.
           * @memberof jscc.lexdbg
           */
          print_nfa: function() {
              io.write_debug("Pos\tType\t\tfollow\t\tfollow2\t\taccept");
              io.write_debug("-----------------------------------------------------------------------");
              for (var i = 0; i < global.nfa_states.value.length; i++) {
                  io.write_debug(i + "\t" + ((global.nfa_states.value[i].edge == EDGE.FREE) ? "FREE" :
                                     ((global.nfa_states.value[i].edge == EDGE.EPSILON) ? "EPSILON" : "CHAR")) +
                                 "\t\t" +
                                 ((global.nfa_states.value[i].edge != EDGE.FREE &&
                                   global.nfa_states.value[i].follow > -1) ?
                                     global.nfa_states.value[i].follow :
                                     "") + "\t\t" +
                                 ((global.nfa_states.value[i].edge != EDGE.FREE &&
                                   global.nfa_states.value[i].follow2 > -1) ?
                                     global.nfa_states.value[i].follow2 :
                                     "") + "\t\t" +
                                 ((global.nfa_states.value[i].edge != EDGE.FREE &&
                                   global.nfa_states.value[i].accept > -1) ?
                                     global.nfa_states.value[i].accept :
                                     ""));

                  if (global.nfa_states.value[i].edge == EDGE.CHAR) {
                      var chars = "";
                      for (var j = global.MIN_CHAR; j < global.MAX_CHAR; j++) {
                          if (global.nfa_states.value[i].ccl.get(j)) {
                              chars += String.fromCharCode(j);
                              if (chars.length == 10) {
                                  io.write_debug("\t" + chars);
                                  chars = "";
                              }
                          }
                      }

                      if (chars.length > 0) {
                          io.write_debug("\t" + chars);
                      }
                  }
              }
              io.write_debug("");
          },

          /**
           * Prints debugging information about the provided array of
           * Dfa objects.
           * @param {Array<jscc.classes.Dfa>} dfa_states - The states for which to
           * print debugging information.
           * @memberof jscc.lexdbg
           */
          print_dfa: function(dfa_states) {
              var str = "";
              var chr_cnt = 0;
              for (var i = 0; i < dfa_states.length; i++) {
                  str = i + " => (";

                  chr_cnt = 0;
                  for (var j = 0; j < dfa_states[i].line.length; j++) {
                      if (dfa_states[i].line[j] > -1) {
                          str += " >" + String.fromCharCode(j) + "<," + dfa_states[i].line[j] + " ";
                          chr_cnt++;

                          if ((chr_cnt % 5) == 0) {
                              str += "\n       ";
                          }
                      }
                  }

                  str += ") " + dfa_states[i].accept;
                  io.write_debug(str);
              }
          }
      };
      return new jscc.lexdbg();
  }));

/*
 * Universal module definition for module containing Param class.
 */
(function(root, factory) {
    /* istanbul ignore next */
    if (typeof define === 'function' && define.amd) {
        define('lib/jscc/classes/Param',factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.jsccParam = factory();
    }
}(this, function() {
        /**
     * Creates a new Param instance.
     * @classdesc Contains indexes of start and end states.
     * @param {number=} start - Index of the starting state.
     * @param {number=} end - Index of the ending state.
     * @constructor
     * @memberof {jscc.classes}
     * @const
     */
    jscc.classes.Param = function(start, end) {
        if (typeof start === 'number') {
            this.start = start;
        }
        if (typeof end === 'number') {
            this.end = end;
        }
    };

    /**
     * Index of the starting state.
     * @type {!number}
     */
    jscc.classes.Param.prototype.start = -1;
    /**
     * Index of the ending state.
     * @type {!number}
     */
    jscc.classes.Param.prototype.end = -1;

    /**
     * The module containing the Param class.
     * @module jscc/classes/Param
     */
    return jscc.classes.Param;
}));

/*
	This is the general, platform-independent part of every parser driver;
	Input-/Output and Feature-Functions are done by the particular drivers
	created for the particular platform.
*/

(function(root, factory) {
    /* istanbul ignore next */
	if (typeof define === 'function' && define.amd) {
		define('lib/jscc/regex',['require', './global', './log/log', './classes/Param', './classes/Nfa', './enums/EDGE'], factory);
	} else if (typeof module === 'object' && module.exports) {
		module.exports = factory(require);
	} else {
		root.jsccregex = factory(function(mod) {
		    return root["jscc" + mod.split("/").pop()];
		});
	}
}(this,
  /**
   * @param {reqParameter} require
   * @param {...*} others
   * @returns {function(string, number, boolean, number)}
   */
  function(require, others) {
var first_nfa;
var last_nfa;

var log, global = /** @type {jscc.global} */ (require("./global")),
    Param = /** @type {function(new:jscc.classes.Param, number=, number=)} */ (require("./classes/Param")),
    Nfa = /** @type {function(new:jscc.classes.Nfa, ?NfaOptions=)} */ (require("./classes/Nfa")),
    EDGE = require("./enums/EDGE");

/**
 * @suppress {uselessCode}
 */
(function() {
    if (false) {
        log = /** @type {jscc.log} */ (require("./log/logNode"));
    } else {
        log = /** @type {jscc.log} */ (require("./log/log"));
    }
})();


var __parse=(function(/** number */ eof, /** number */ whitespace, /** number */ error_token){
	
/// there was "continue" in code, we must to replace it
var Continue = function(){throw Continue;};

	/**
	 * @template T
	 * @param {T} value
	 * @constructor
	 * @extends {Error}
     */
	var ReturnValue = function(value) {
		Error.call(this);
		this._value = value;
	};
	ReturnValue.prototype = Object.create(Error.prototype);
	ReturnValue.prototype.constructor = ReturnValue;
	/**
	 * @type {T}
	 * @private
     */
	ReturnValue.prototype._value = null;
	/**
	 * @returns {T}
     */
	ReturnValue.prototype.valueOf = function() {
		return this._value;
	};

	///can return value from any place of callback
	function Return(value){
		throw new ReturnValue(value);
	}

	var TERMINAL_ACTIONS = (function(){
		function emptyFn(PCB){return PCB.att;}
		var actions = ({

})
		return function(/** @type {!PcbClass} */ PCB, match){
			try{
				return (actions[match] || emptyFn)(PCB);
			}catch(e){
				if(e instanceof ReturnValue)return e.valueOf();
				if(e == Continue)return Continue;
				throw e;
			}
		}
	})();
	/**
	 * @constructor
     */
	var DfaLex = function() {
		this._dfaData = [{line:[[[[1,
	[[1,
	[[[2,
	3],
	[4,
	5]],
	[1,
	[6,
	1]]]],
	[1,
	[1,
	[1,
	[1,
	7]]]]]],
	[[1,
	[1,
	[[1,
	[1,
	8]],
	[[13,
	9],
	1]]]],
	[1,
	[1,
	[1,
	[[10,
	1],
	1]]]]]],
	[1,
	[1,
	[1,
	[1,
	[1,
	[1,
	[1,
	null]]]]]]]]],
	accept:-1},
	{line:[],
	accept:13},
	{line:[],
	accept:6},
	{line:[],
	accept:7},
	{line:[],
	accept:3},
	{line:[],
	accept:4},
	{line:[],
	accept:10},
	{line:[],
	accept:5},
	{line:[],
	accept:8},
	{line:[],
	accept:9},
	{line:[],
	accept:2},
	{line:[],
	accept:12},
	{line:[[[[null,
	[null,
	[12,
	[[12,
	null],
	null]]]],
	null],
	null]],
	accept:11},
	{line:[[[[11,
	[11,
	[12,
	[[12,
	11],
	11]]]],
	11],
	[11,
	[11,
	[11,
	[11,
	[11,
	[11,
	[11,
	null]]]]]]]]],
	accept:13}];
	};
	/**
	 * @type {!Array<!{line: !Array, accept: !number}>}
	 * @private
     */
	DfaLex.prototype._dfaData = [];
	/**
	 * @type {number}
     */
	DfaLex.prototype.match_pos = 0;
	/**
	 * @type {?number}
     */
	DfaLex.prototype.state = 0;
	/**
	 * @type {?number}
     */
	DfaLex.prototype.match = null;
	/**
	 * @param {number} chr
	 * @param {number} pos
     */
	DfaLex.prototype.exec = function(chr, pos) {
		if (this.state !== null) {
		    if ((typeof this.state !== "number") || this.state >= this._dfaData.length) {
		        this.state = null;
		        throw new Error("Invalid value for DfaLex.state at chr " + chr + " and pos " + pos);
		    }
			var line = this._dfaData[this.state].line;
			if (typeof line === "undefined" || line === null) {
			    var badState = this.state;
			    this.state = null;
			    throw new Error("At chr " + chr + " and pos " + pos +
			                    ", DfaLex._dfaData[" + badState +
			                    "] appears to exist, but its line property is " +
			                    (typeof line === "undefined" ? "undefined." : "null."));
			}
			var p, st;
			for (p = 1 << 8, st = line; p; p >>= 1) {
				if ((chr & p) !== 0) {
					st = st[1];
				} else {
					st = st[0];
				}
				if (typeof st === "undefined") {
				    st = null;
				}
				if (st === null)break;
				if (Array.isArray(st))continue;
				break;
			}
			var ac = this._dfaData[this.state].accept;
			this.state = /** @type {?number} */ (st);
			if (ac !== -1) {
				this.match = /** @type{number} */ (ac);
				this.match_pos = pos;
			}
		}
	};

var pop_tab =[[0,1],[15,1],[14,3],[14,1],[16,2],[16,1],[17,2],[17,2],[17,2],[17,1],[18,1],[18,1],[18,3],[20,3],[20,1],[21,2],[21,0],[19,1],[19,1],[19,1]];

/** @type {!Array<!Array<number>>} */
var act_tab =[[6,8,11,9,12,10,13,11,8,12,10,13],[],[2,14],[6,8,11,9,12,10,13,11,8,12,10,13],[],[5,16,4,17,3,18],[],[],[6,8,11,9,12,10,13,11,8,12,10,13],[],[],[],[],[],[6,8,11,9,12,10,13,11,8,12,10,13],[],[],[],[],[7,22,2,14],[9,24,11,9,12,10,13,11],[6,8,11,9,12,10,13,11,8,12,10,13],[],[],[]];

var goto_tab =[[15,1,14,2,16,3,17,4,18,5,19,6,20,7],[],[],[17,15,18,5,19,6,20,7],[],[],[],[],[14,19,16,3,17,4,18,5,19,6,20,7],[],[],[],[21,20],[],[16,21,17,4,18,5,19,6,20,7],[],[],[],[],[],[19,23],[17,15,18,5,19,6,20,7],[],[],[]];

var defact_tab =[-1,0,1,3,5,9,10,11,-1,17,18,19,16,14,-1,4,8,7,6,-1,-1,2,12,15,13];

var labels = [{"label":"RegEx'","kind":{},"prods":[0],"nullable":0,"id":0,"code":"","level":0,"special":{},"defined":true,"first":[6,11,12,13,8,10]},{"label":"ERROR_RESYNC","kind":{},"prods":[],"nullable":false,"id":1,"code":"","level":0,"special":{},"defined":true,"first":[1]},{"label":"|","kind":{},"prods":[],"nullable":false,"id":2,"code":"","level":0,"special":{},"defined":false,"first":[2]},{"label":"*","kind":{},"prods":[],"nullable":false,"id":3,"code":"","level":0,"special":{},"defined":false,"first":[3]},{"label":"+","kind":{},"prods":[],"nullable":false,"id":4,"code":"","level":0,"special":{},"defined":false,"first":[4]},{"label":"?","kind":{},"prods":[],"nullable":false,"id":5,"code":"","level":0,"special":{},"defined":false,"first":[5]},{"label":"(","kind":{},"prods":[],"nullable":false,"id":6,"code":"","level":0,"special":{},"defined":false,"first":[6]},{"label":")","kind":{},"prods":[],"nullable":false,"id":7,"code":"","level":0,"special":{},"defined":false,"first":[7]},{"label":"[","kind":{},"prods":[],"nullable":false,"id":8,"code":"","level":0,"special":{},"defined":false,"first":[8]},{"label":"]","kind":{},"prods":[],"nullable":false,"id":9,"code":"","level":0,"special":{},"defined":false,"first":[9]},{"label":"ANY_CHAR","kind":{},"prods":[],"nullable":false,"id":10,"code":"","level":0,"special":{},"defined":false,"first":[10]},{"label":"ASCII_CODE","kind":{},"prods":[],"nullable":false,"id":11,"code":"","level":0,"special":{},"defined":false,"first":[11]},{"label":"ESCAPED_CHAR","kind":{},"prods":[],"nullable":false,"id":12,"code":"","level":0,"special":{},"defined":false,"first":[12]},{"label":"ANY","kind":{},"prods":[],"nullable":false,"id":13,"code":"","level":0,"special":{},"defined":false,"first":[13]},{"label":"Expression","kind":{},"prods":[2,3],"nullable":0,"id":14,"code":"","level":0,"special":{},"defined":true,"first":[6,11,12,13,8,10]},{"label":"RegEx","kind":{},"prods":[1],"nullable":0,"id":15,"code":"","level":0,"special":{},"defined":true,"first":[6,11,12,13,8,10]},{"label":"Catenation","kind":{},"prods":[4,5],"nullable":0,"id":16,"code":"","level":0,"special":{},"defined":true,"first":[6,11,12,13,8,10]},{"label":"Factor","kind":{},"prods":[6,7,8,9],"nullable":0,"id":17,"code":"","level":0,"special":{},"defined":true,"first":[6,11,12,13,8,10]},{"label":"Term","kind":{},"prods":[10,11,12],"nullable":0,"id":18,"code":"","level":0,"special":{},"defined":true,"first":[6,11,12,13,8,10]},{"label":"Character","kind":{},"prods":[17,18,19],"nullable":0,"id":19,"code":"","level":0,"special":{},"defined":true,"first":[11,12,13]},{"label":"CharacterSet","kind":{},"prods":[13,14],"nullable":0,"id":20,"code":"","level":0,"special":{},"defined":true,"first":[8,10]},{"label":"CharClass","kind":{},"prods":[15,16],"nullable":1,"id":21,"code":"","level":0,"special":{},"defined":true,"first":[11,12,13]},{"label":"$","kind":{},"prods":[],"nullable":false,"id":22,"code":"","level":0,"special":{},"defined":false,"first":[22]}];


	var ACTIONS = (function(){
		var PCB = {};
		var actions = [		function(){
var rval;rval =  arguments[0] ;
return rval;},
		function(){
var rval;	rval = new Param();
													global.nfa_states.value[ first_nfa ].follow =  arguments[0] .start;
													last_nfa =  arguments[0] .end;
												
return rval;},
		function(){
var rval;
													rval = new Param(global.nfa_states.create(), global.nfa_states.create());
													global.nfa_states.value[rval.start].follow =  arguments[2] .start;
													global.nfa_states.value[rval.start].follow2 =  arguments[0] .start;

													global.nfa_states.value[ arguments[2] .end].follow = rval.end;
													global.nfa_states.value[ arguments[0] .end].follow = rval.end;
												
return rval;},
		function(){
var rval;rval =  arguments[0] ;
return rval;},
		function(){
var rval;
													var weight=global.nfa_states.value[ arguments[1] .end].weight;///SV: if weight unused - delete this
													global.nfa_states.value[ arguments[1] .end]=new Nfa(global.nfa_states.value[ arguments[0] .start]);
													global.nfa_states.value[ arguments[1] .end].weight=weight;///SV: if weight unused - delete this
													global.nfa_states.value[ arguments[0] .start].edge = EDGE.FREE;

													 arguments[1] .end =  arguments[0] .end;

													rval =  arguments[1] ;
												
return rval;},
		function(){
var rval;rval =  arguments[0] ;
return rval;},
		function(){
var rval;
													rval = new Param(global.nfa_states.create(), global.nfa_states.create());
													global.nfa_states.value[rval.start].follow =  arguments[1] .start;
													global.nfa_states.value[ arguments[1] .end].follow = rval.end;

													global.nfa_states.value[rval.start].follow2 = rval.end;
													global.nfa_states.value[ arguments[1] .end].follow2 =  arguments[1] .start;
												
return rval;},
		function(){
var rval;
													rval = new Param(global.nfa_states.create(), global.nfa_states.create());
													global.nfa_states.value[rval.start].follow =  arguments[1] .start;
													global.nfa_states.value[ arguments[1] .end].follow = rval.end;

													global.nfa_states.value[ arguments[1] .end].follow2 =  arguments[1] .start;
												
return rval;},
		function(){
var rval;
													rval = new Param(global.nfa_states.create(), global.nfa_states.create());
													global.nfa_states.value[rval.start].follow =  arguments[1] .start;
													global.nfa_states.value[rval.start].follow2 = rval.end;
													global.nfa_states.value[ arguments[1] .end].follow = rval.end;
												
return rval;},
		function(){
var rval;rval =  arguments[0] ;
return rval;},
		function(){
var rval;	rval = new Param();
													rval.start = global.nfa_states.create();
													rval.end = global.nfa_states.value[rval.start].follow
														= global.nfa_states.create();
													global.nfa_states.value[rval.start].edge = EDGE.CHAR;

													global.nfa_states.value[rval.start].ccl.set( arguments[0] .charCodeAt( 0 ), true );
												
return rval;},
		function(){
var rval;rval =  arguments[0] ;
return rval;},
		function(){
var rval;	rval =  arguments[1] ; 
return rval;},
		function(){
var rval;	var negate = false;
													var i = 0, j, start;
													rval = new Param();
													rval.start = global.nfa_states.create();
													rval.end = global.nfa_states.value[rval.start].follow
														= global.nfa_states.create();
													global.nfa_states.value[rval.start].edge = EDGE.CHAR;

													if(  arguments[1] .charAt( i ) == '^' ){
														negate = true;
														for( j = global.MIN_CHAR; j < global.MAX_CHAR; j++ )
															global.nfa_states.value[rval.start].ccl.set(j,true);
														i++;
													}
													for( ; i <  arguments[1] .length; i++ ){
														if(  arguments[1] .charAt( i+1 ) == '-'	&& i+2 <  arguments[1] .length ){
															i++;
															for( j =  arguments[1] .charCodeAt( i-1 );
																	j <  arguments[1] .charCodeAt( i+1 );
																		j++ )
																global.nfa_states.value[rval.start].ccl.set(j, !negate);
														}
														else
															global.nfa_states.value[rval.start].ccl.set( arguments[1] .charCodeAt(i), !negate);
													}
												
return rval;},
		function(){
var rval;	rval = new Param();

													rval.start = global.nfa_states.create();
													rval.end = global.nfa_states.value[rval.start].follow
														= global.nfa_states.create();
													global.nfa_states.value[rval.start].edge = EDGE.CHAR;
													for( var i = global.MIN_CHAR; i < global.MAX_CHAR; i++ )
														global.nfa_states.value[rval.start].ccl.set(i, true);
												
return rval;},
		function(){
var rval;	rval =  arguments[1]  +  arguments[0] ; 
return rval;},
		function(){
var rval;	rval = ""; 
return rval;},
		function(){
var rval;	rval = String.fromCharCode(  arguments[0] .substr( 1 ) ); 
return rval;},
		function(){
var rval;	rval = {n:'\n',r:'\r',t:'\t',a:'\a'}[ arguments[0] .substr(1)]|| arguments[0] .substr(1); 
return rval;},
		function(){
var rval;	rval =  arguments[0] ; 
return rval;},
];
		return function (/** number */ act, /** Array<*> */ vstack, /** !PcbClass */ pcb){
			try{
				PCB = pcb;
				return actions[act].apply(null,vstack);
			}catch(e){
				if(e instanceof ReturnValue)return e.valueOf();
				throw e;
			}
		}
	})();

	/**
	 * @param {number} top
	 * @param {?number} la
	 * @returns {?number}
     */
	function get_act(top, la){	
		for(var i = 0; i < act_tab[top].length; i+=2)
			if(act_tab[top][i] === la)
				return act_tab[top][i+1];
		return null;
	}
	function get_goto(top, pop){	
		for(var i = 0; i < goto_tab[top].length; i+=2)
			if(goto_tab[top][i] === pop)
				return goto_tab[top][i+1];
		return null;
	}

	/**
	 * @param {!string} src
	 * @constructor
     */
	var PcbClass = function(src) {
		this.src = src;
	};
	/**
	 * @type {number}
     */
	PcbClass.prototype.line = 1;
	/**
	 * @type {number}
     */
	PcbClass.prototype.column = 1;
	/**
	 * @type {number}
     */
	PcbClass.prototype.offset = 0;
	/**
	 * @type {number}
     */
	PcbClass.prototype.error_step = 0;
	/**
	 * @type {string}
     */
	PcbClass.prototype.src = "";
	/**
	 * @type {string}
     */
	PcbClass.prototype.att = "";
	/**
	 * @type {?number}
     */
	PcbClass.prototype.la = null;
	/**
	 * @type {?number}
     */
	PcbClass.prototype.act = null;
	/**
	 * @returns {?number}
     */
	PcbClass.prototype.lex = function() {
        var /** number */ start, /** number */ pos, /** number */ chr, actionResult;
		var dfa = new DfaLex();
		var loop = true;
		while(loop){
			dfa.match_pos = 0;
			pos = this.offset + 1;
			do{
				pos--;
				dfa.state = 0;
				dfa.match = null;
				start = pos;
				if(this.src.length <= start) {
					this.la = eof;
					return eof;
				}
				do{
					chr = this.src.charCodeAt(pos);
					dfa.exec(chr,pos);
					if(dfa.state !== null)
						this.accountChar(chr);
					pos++;
				}while(dfa.state !== null);
			}while(whitespace > -1 && dfa.match === whitespace);
			if(dfa.match !== null){
				this.att = this.src.slice(start, dfa.match_pos);
				this.offset = dfa.match_pos;
				actionResult = TERMINAL_ACTIONS(this,dfa.match);
				if(dfa.state !== null)
					this.accountChar(chr);
				if(actionResult === Continue)
					continue;
				this.att = actionResult;
			}else {
				this.att = "";
			}
			loop = false;
		}
		this.la = dfa.match;
		return this.la;
	};
	/**
	 * @param {number} chr
     */
    PcbClass.prototype.accountChar = function(chr) {
		if( chr === 10 ){
			this.line++;
			this.column = 0;
		}
		this.column++;
	};
	function parse(/** string */ src, err_off, err_la){
		/**
		 * @type {!Array<number>}
         */
		var		sstack			= [0];
		/**
		 * @type {!Array<*>}
         */
		var		vstack			= [0];
		/**
		 * @type {number}
         */
		var 	err_cnt			= 0;
		/**
		 * @type {*}
		 */
		var		rval;
		/**
		 * @type {?number}
		 */
		var		act;
		/**
		 * @type {number}
		 */
		var i = 0;

		var PCB	= new PcbClass(src);
		err_off	= err_off || [];
		err_la = err_la || [];
		PCB.lex();
		while(true){
			PCB.act = get_act(sstack[0],PCB.la);
			if(PCB.act === null && defact_tab[sstack[0]] >= 0)
				PCB.act = -defact_tab[sstack[0]];
			if(PCB.act === null){//Parse error? Try to recover!
				//Report errors only when error_step is 0, and this is not a
				//subsequent error from a previous parse
				if(PCB.error_step === 0){
					err_cnt++;
					err_off.unshift(PCB.offset - PCB.att.length);
					err_la.unshift([]);
					for(i = 0; i < act_tab[sstack[0]].length; i+=2)
						err_la[0].push(labels[act_tab[sstack[0]][i]]);
				}
				//Perform error recovery			
				while(sstack.length > 1 && PCB.act === null){
					sstack.shift();
					vstack.shift();
					//Try to shift on error token
					PCB.act = get_act(sstack[0],PCB.la);
					if(PCB.act === error_token){
						sstack.unshift(PCB.act);
						vstack.unshift("");
					}
				}
				//Is it better to leave the parser now?
				if(sstack.length > 1 && PCB.act !== null){
					//Ok, now try to shift on the next tokens
					while(PCB.la !== eof){
						PCB.act = act_tab[sstack[0]][i+1];
						if(PCB.act != null)break;
						while(PCB.lex() != null)PCB.offset++;
					}
				}
				if(PCB.act === null || PCB.la === eof){
					break;
				}
				//Try to parse the next three tokens successfully...
				PCB.error_step = 3;
			}
			if(PCB.act > 0){//Shift
				//Parse tree generation
				sstack.unshift(PCB.act);
				vstack.unshift(PCB.att);
				PCB.lex();
				//Successfull shift and right beyond error recovery?
				if(PCB.error_step > 0)
					PCB.error_step--;
			}else{	//Reduce	
				act = -PCB.act;
				//vstack.unshift(vstack);
				rval = ACTIONS(act,vstack,PCB);
				//vstack.shift();
				sstack.splice(0,pop_tab[act][1]);
				vstack.splice(0,pop_tab[act][1]);
				
				PCB.act = get_goto(sstack[0],pop_tab[act][0]);
				//Do some parse tree construction if desired
				//Goal symbol match?
				if(act === 0) break; //Don't use PCB.act here!
			
				//...and push it!
				sstack.unshift(PCB.act);
				vstack.unshift(rval);
			}
		}
		return err_cnt;
	}
	return parse;
})(22,-1,1);


/**
 * Compiles the given regex into a nondeterministic finite automata.
 * @param {string} str - The regex to compile.
 * @param {number} accept - The id of the symbol accepted.
 * @param {boolean} case_insensitive - Whether the regex is case insensitive.
 * @param {number} cur_line - The current line number being parsed.  Used in error
 * logging.
 * @module {jscc.regex} jscc/regex
 * @requires module:jscc/global
 * @requires module:jscc/log/log
 */
function compile_regex( str, accept, case_insensitive, cur_line ){
	var i, j;
	var weight = 0;
	var true_edges = 0;
	var error_offsets = [];
	var error_expects = [];
	var error_count = 0;

	if( str == "" )
		return;

	cur_line = cur_line || 0;

	//_print( "str = >" + str + "< " + case_insensitive );

	first_nfa = global.nfa_states.create();
	if( ( error_count = __parse( str, error_offsets, error_expects ) ) == 0 ){
		//If the symbol should be case-insensitive, manipulate the
		//character sets on the newly created items.
		if( case_insensitive ){
			for( i = 0; i < global.nfa_states.value.length; i++ ){
				if( global.nfa_states.value[i].edge == EDGE.CHAR ){
					for( j = global.MIN_CHAR; j < global.MAX_CHAR; j++ ){
						if( global.nfa_states.value[i].ccl.get( j ) ){
							global.nfa_states.value[i].ccl.set(String.fromCharCode( j ).toUpperCase().charCodeAt( 0 ), true );
							global.nfa_states.value[i].ccl.set(String.fromCharCode( j ).toLowerCase().charCodeAt( 0 ), true );
						}
					}
				}
			}
		}

		/*
			2008-5-9	Radim Cebis:

			I think that computing weight of the nfa_states.value is weird,
			IMHO nfa_state which accepts a symbol, should have
			weight according to the order...
		*/
		global.nfa_states.value[ last_nfa ].accept = accept;
		global.nfa_states.value[ last_nfa ].weight = global.regex_weight++;

		if( first_nfa > 0 ){
			i = 0;
			while( global.nfa_states.value[i].follow2 != -1 )
				i = global.nfa_states.value[i].follow2;

			global.nfa_states.value[i].follow2 = first_nfa;
		}
	}else{
		for( i = 0; i < error_count; i++ ){
			var spaces = '';
			for( j = 0; j < error_offsets[i]; j++ )
				spaces += " ";

			log.error( "Regular expression:\n\t" + str + "\n\t" +
			 		spaces + "^ expecting " + error_expects[i].join() + " on line " + cur_line );
		}
	}
}
return compile_regex;


//TESTING AREA ;)
//compile_regex( "[A-Z][A-Z0-9]*", 0 );
//compile_regex( "ab|c", 1 );
//compile_regex( "[0-9]+", 1 );
//print_nfa();
//var d = create_subset( nfa_states.value );
//print_dfa( d );
//d = minimize_dfa( d );
//print_dfa( d );
}));



/*
	This is the general, platform-independent part of every parser driver;
	Input-/Output and Feature-Functions are done by the particular drivers
	created for the particular platform.
*/

(function(root, factory) {
    /* istanbul ignore next */
	if (typeof define === 'function' && define.amd) {
		define('lib/jscc/parse',['require', './global', './regex', './tabgen', './log/log', './classes/Production', './enums/ASSOC', './enums/SYM', './enums/SPECIAL'], factory);
	} else if (typeof module === 'object' && module.exports) {
		module.exports = factory(require);
	} else {
		root.jsccparse = factory(function(mod) {
		    return root["jscc" + mod.split("/").pop()];
		});
	}
}(this,
  /**
   * @param {reqParameter} require
   * @param {...*} others
   * @returns {function(string, string=):number}
   */
  function(require, others) {
var log, global = /** @type {jscc.global} */ (require("./global")),
    compile_regex = /** @type {function(string, number, boolean, number)} */ (require("./regex")),
    tabgen = /** @type {jscc.tabgen} */ (require("./tabgen")),
    Production = /** @type {function(new:jscc.classes.Production, ?ProductionOptions=)} */ (require("./classes/Production")),
    ASSOC = require("./enums/ASSOC"),
    SYM = require("./enums/SYM"),
    SPECIAL = require("./enums/SPECIAL");


/**
 * @suppress {uselessCode}
 */
(function() {
    if (false) {
        log = /** @type {jscc.log} */ (require("./log/logNode"));
    } else {
        log = /** @type {jscc.log} */ (require("./log/log"));
    }
})();

var		first_lhs;
var		cur_line;

//Wrapper for semantic errors
function line_error( line, txt ){
	log.error( "line " + line + ": " + txt );
}

var __parse=(function(/** number */ eof, /** number */ whitespace, /** number */ error_token){
	
/// there was "continue" in code, we must to replace it
var Continue = function(){throw Continue;};

	/**
	 * @template T
	 * @param {T} value
	 * @constructor
	 * @extends {Error}
     */
	var ReturnValue = function(value) {
		Error.call(this);
		this._value = value;
	};
	ReturnValue.prototype = Object.create(Error.prototype);
	ReturnValue.prototype.constructor = ReturnValue;
	/**
	 * @type {T}
	 * @private
     */
	ReturnValue.prototype._value = null;
	/**
	 * @returns {T}
     */
	ReturnValue.prototype.valueOf = function() {
		return this._value;
	};

	///can return value from any place of callback
	function Return(value){
		throw new ReturnValue(value);
	}

	var TERMINAL_ACTIONS = (function(){
		function emptyFn(PCB){return PCB.att;}
		var actions = ({
	"13": /** @suppress {uselessCode} */ function(PCB){			return PCB.att.substr(2, PCB.att.length - 4 ); 
		return PCB.att;},
	"17": /** @suppress {uselessCode} */ function(PCB){		return Continue.apply(null, arguments);
		return PCB.att;},
	"18": /** @suppress {uselessCode} */ function(PCB){		return Continue.apply(null, arguments);
		return PCB.att;},
	"19": /** @suppress {uselessCode} */ function(PCB){		return Continue.apply(null, arguments);
		return PCB.att;},

})
		return function(/** @type {!PcbClass} */ PCB, match){
			try{
				return (actions[match] || emptyFn)(PCB);
			}catch(e){
				if(e instanceof ReturnValue)return e.valueOf();
				if(e == Continue)return Continue;
				throw e;
			}
		}
	})();
	/**
	 * @constructor
     */
	var DfaLex = function() {
		this._dfaData = [{line:[[[[[[null,
	[[[null,
	1],
	[2,
	null]],
	[[null,
	1],
	null]]],
	null],
	[[[[[1,
	3],
	[19,
	22]],
	[null,
	[4,
	23]]],
	[null,
	[[null,
	5],
	[null,
	24]]]],
	[5,
	[[5,
	[6,
	7]],
	[[8,
	25],
	[9,
	null]]]]]],
	[[[[[[null,
	5],
	5],
	5],
	5],
	[5,
	[[5,
	[5,
	26]],
	[null,
	[10,
	5]]]]],
	[[[[[null,
	5],
	5],
	5],
	5],
	[5,
	[[5,
	[5,
	null]],
	[[11,
	null],
	[12,
	null]]]]]]],
	null]],
	accept:-1},
	{line:[[[[[[null,
	[[[null,
	1],
	null],
	[[null,
	1],
	null]]],
	null],
	[[[[[1,
	null],
	null],
	null],
	null],
	null]],
	null],
	null]],
	accept:19},
	{line:[],
	accept:17},
	{line:[],
	accept:6},
	{line:[],
	accept:10},
	{line:[[[[null,
	[[null,
	[null,
	[[null,
	5],
	null]]],
	[5,
	[[5,
	null],
	null]]]],
	[[[[[[null,
	5],
	5],
	5],
	5],
	[5,
	[[5,
	[5,
	null]],
	[null,
	[null,
	5]]]]],
	[[[[[null,
	5],
	5],
	5],
	5],
	[5,
	[[5,
	[5,
	null]],
	null]]]]],
	null]],
	accept:16},
	{line:[],
	accept:8},
	{line:[],
	accept:7},
	{line:[],
	accept:3},
	{line:[],
	accept:4},
	{line:[],
	accept:5},
	{line:[],
	accept:9},
	{line:[],
	accept:11},
	{line:[],
	accept:15},
	{line:[],
	accept:2},
	{line:[],
	accept:14},
	{line:[],
	accept:12},
	{line:[],
	accept:18},
	{line:[],
	accept:13},
	{line:[[[[19,
	[[[[19,
	[13,
	19]],
	19],
	19],
	19]],
	[[19,
	[19,
	[19,
	[[27,
	19],
	19]]]],
	19]],
	[19,
	[19,
	[19,
	[19,
	[19,
	[19,
	[19,
	null]]]]]]]]],
	accept:-1},
	{line:[[[[19,
	[[[[19,
	[13,
	19]],
	19],
	19],
	19]],
	[[19,
	[19,
	[19,
	[[27,
	19],
	19]]]],
	19]],
	[19,
	[19,
	[19,
	[19,
	[19,
	[19,
	[19,
	null]]]]]]]]],
	accept:15},
	{line:[[[[23,
	[[[23,
	[23,
	[23,
	15]]],
	23],
	23]],
	[[23,
	[23,
	[23,
	[[28,
	23],
	23]]]],
	23]],
	[23,
	[23,
	[23,
	[23,
	[23,
	[23,
	[23,
	null]]]]]]]]],
	accept:14},
	{line:[[[[null,
	[[[[null,
	[null,
	14]],
	null],
	null],
	null]],
	null],
	null]],
	accept:-1},
	{line:[[[[23,
	[[[23,
	[23,
	[23,
	15]]],
	23],
	23]],
	[[23,
	[23,
	[23,
	[[28,
	23],
	23]]]],
	23]],
	[23,
	[23,
	[23,
	[23,
	[23,
	[23,
	[23,
	null]]]]]]]]],
	accept:-1},
	{line:[[[null,
	[null,
	[null,
	[null,
	[null,
	[null,
	[29,
	null]]]]]]],
	null]],
	accept:-1},
	{line:[[[[null,
	[null,
	[null,
	[null,
	[null,
	[16,
	null]]]]]],
	null],
	null]],
	accept:-1},
	{line:[[[[null,
	[[null,
	[[null,
	[37,
	null]],
	null]],
	null]],
	null],
	null]],
	accept:-1},
	{line:[[[[19,
	[[[[19,
	[20,
	19]],
	19],
	19],
	19]],
	[[19,
	[19,
	[19,
	[[27,
	19],
	19]]]],
	19]],
	[19,
	[19,
	[19,
	[19,
	[19,
	[19,
	[19,
	null]]]]]]]]],
	accept:-1},
	{line:[[[[23,
	[[[23,
	[23,
	[23,
	21]]],
	23],
	23]],
	[[23,
	[23,
	[23,
	[[28,
	23],
	23]]]],
	23]],
	[23,
	[23,
	[23,
	[23,
	[23,
	[23,
	[23,
	null]]]]]]]]],
	accept:-1},
	{line:[[[[38,
	[[38,
	[38,
	[38,
	[38,
	30]]]],
	38]],
	[38,
	[38,
	[38,
	[38,
	[38,
	[31,
	38]]]]]]],
	[38,
	[38,
	[38,
	[38,
	[38,
	[38,
	[38,
	null]]]]]]]]],
	accept:-1},
	{line:[[[[null,
	[[null,
	[null,
	[null,
	[null,
	29]]]],
	null]],
	null],
	null]],
	accept:-1},
	{line:[[[[29,
	[[29,
	[29,
	[29,
	[29,
	17]]]],
	29]],
	29],
	[29,
	[29,
	[29,
	[29,
	[29,
	[29,
	[29,
	null]]]]]]]]],
	accept:-1},
	{line:[[[[32,
	[[32,
	[[32,
	[33,
	32]],
	32]],
	32]],
	32],
	[32,
	[32,
	[32,
	[32,
	[32,
	[32,
	[32,
	null]]]]]]]]],
	accept:-1},
	{line:[[[36,
	[[36,
	[36,
	[36,
	[[36,
	18],
	36]]]],
	36]],
	[36,
	[36,
	[36,
	[36,
	[36,
	[36,
	[36,
	null]]]]]]]]],
	accept:-1},
	{line:[[[null,
	[[null,
	[null,
	[null,
	[[null,
	36],
	null]]]],
	null]],
	null]],
	accept:-1},
	{line:[[[[38,
	[[38,
	[38,
	[38,
	[38,
	35]]]],
	38]],
	[38,
	[38,
	[38,
	[38,
	[38,
	[31,
	38]]]]]]],
	[38,
	[38,
	[38,
	[38,
	[38,
	[38,
	[38,
	null]]]]]]]]],
	accept:-1},
	{line:[[[[32,
	[[32,
	[[32,
	[33,
	32]],
	32]],
	32]],
	[[32,
	[32,
	[32,
	[[32,
	34],
	32]]]],
	32]],
	[32,
	[32,
	[32,
	[32,
	[32,
	[32,
	[32,
	null]]]]]]]]],
	accept:-1},
	{line:[[[[32,
	[[32,
	[[32,
	[33,
	32]],
	32]],
	32]],
	[[32,
	[32,
	[32,
	[[32,
	34],
	32]]]],
	32]],
	[32,
	[32,
	[32,
	[32,
	[32,
	[32,
	[32,
	null]]]]]]]]],
	accept:-1},
	{line:[[[[38,
	[[38,
	[38,
	[38,
	[38,
	35]]]],
	38]],
	[38,
	[38,
	[38,
	[38,
	[38,
	[31,
	38]]]]]]],
	[38,
	[38,
	[38,
	[38,
	[38,
	[38,
	[38,
	null]]]]]]]]],
	accept:-1}];
	};
	/**
	 * @type {!Array<!{line: !Array, accept: !number}>}
	 * @private
     */
	DfaLex.prototype._dfaData = [];
	/**
	 * @type {number}
     */
	DfaLex.prototype.match_pos = 0;
	/**
	 * @type {?number}
     */
	DfaLex.prototype.state = 0;
	/**
	 * @type {?number}
     */
	DfaLex.prototype.match = null;
	/**
	 * @param {number} chr
	 * @param {number} pos
     */
	DfaLex.prototype.exec = function(chr, pos) {
		if (this.state !== null) {
		    if ((typeof this.state !== "number") || this.state >= this._dfaData.length) {
		        this.state = null;
		        throw new Error("Invalid value for DfaLex.state at chr " + chr + " and pos " + pos);
		    }
			var line = this._dfaData[this.state].line;
			if (typeof line === "undefined" || line === null) {
			    var badState = this.state;
			    this.state = null;
			    throw new Error("At chr " + chr + " and pos " + pos +
			                    ", DfaLex._dfaData[" + badState +
			                    "] appears to exist, but its line property is " +
			                    (typeof line === "undefined" ? "undefined." : "null."));
			}
			var p, st;
			for (p = 1 << 8, st = line; p; p >>= 1) {
				if ((chr & p) !== 0) {
					st = st[1];
				} else {
					st = st[0];
				}
				if (typeof st === "undefined") {
				    st = null;
				}
				if (st === null)break;
				if (Array.isArray(st))continue;
				break;
			}
			var ac = this._dfaData[this.state].accept;
			this.state = /** @type {?number} */ (st);
			if (ac !== -1) {
				this.match = /** @type{number} */ (ac);
				this.match_pos = pos;
			}
		}
	};

var pop_tab =[[0,1],[24,5],[20,1],[23,1],[21,2],[21,1],[26,3],[26,3],[26,3],[26,2],[26,3],[27,2],[27,1],[30,3],[30,2],[22,2],[22,1],[32,4],[32,2],[33,3],[33,1],[34,3],[36,2],[36,2],[36,0],[35,1],[35,0],[37,2],[37,1],[38,1],[38,1],[38,1],[25,1],[25,2],[25,2],[25,0],[39,2],[39,1],[28,1],[28,1],[31,1],[29,1],[29,0]];

/** @type {!Array<!Array<number>>} */
var act_tab =[[12,5,13,6],[],[3,9,4,10,5,11,6,13,14,16,15,17],[],[13,18],[13,19,16,21],[],[2,23,3,9,4,10,5,11,6,13,14,16,15,17],[],[14,16,15,17],[14,16,15,17],[14,16,15,17],[7,28,14,16,15,17],[14,16,15,17],[],[16,21,12,5,13,6],[],[],[],[],[],[],[],[1,35,16,21],[7,36,14,16,15,17],[7,37,14,16,15,17],[7,38,14,16,15,17],[],[],[7,40],[],[12,5,13,6],[1,35,12,5,16,21,13,6],[],[8,45],[7,46],[],[],[],[],[],[],[],[],[],[11,54,16,21,14,16,15,17],[],[9,55,7,56],[],[10,58],[11,54,16,21,14,16,15,17],[],[],[],[],[11,54,16,21,14,16,15,17],[],[12,5,13,6],[16,21,14,16,15,17],[],[],[],[],[]];

var goto_tab =[[24,1,20,2,25,3,39,4],[],[21,7,26,8,27,12,30,14,28,15],[],[],[31,20],[],[26,22,27,12,30,14,28,15],[],[27,24,30,14,28,15],[27,25,30,14,28,15],[27,26,30,14,28,15],[30,27,28,15],[28,29],[],[25,30,31,31,39,4],[],[],[],[],[],[],[],[22,32,32,33,31,34],[30,27,28,15],[30,27,28,15],[30,27,28,15],[],[],[29,39],[],[25,41,39,4],[32,42,23,43,25,44,31,34,39,4],[],[],[],[],[],[],[],[],[],[],[],[],[33,47,34,48,35,49,37,50,38,51,31,52,28,53],[],[],[],[36,57],[38,59,31,52,28,53],[],[],[],[],[34,60,35,49,37,50,38,51,31,52,28,53],[],[25,61,39,4],[28,62,31,63],[],[],[],[],[]];

var defact_tab =[35,0,-1,2,32,-1,37,-1,5,-1,-1,-1,-1,-1,12,35,38,39,36,34,33,40,4,-1,-1,-1,-1,11,9,42,14,35,35,16,-1,-1,6,7,8,10,41,13,15,1,3,26,18,-1,20,24,25,28,29,30,31,26,17,35,-1,27,19,21,23,22];

var labels = [{"label":"def'","kind":{},"prods":[0],"nullable":0,"id":0,"code":"","level":0,"special":{},"defined":true,"first":[12,3,4,5,6,13,14,15]},{"label":"ERROR_RESYNC","kind":{},"prods":[],"nullable":false,"id":1,"code":"","level":0,"special":{},"defined":true,"first":[1]},{"label":"##","kind":{},"prods":[],"nullable":false,"id":2,"code":"","level":0,"special":{},"defined":false,"first":[2]},{"label":"<","kind":{},"prods":[],"nullable":false,"id":3,"code":"","level":0,"special":{},"defined":false,"first":[3]},{"label":">","kind":{},"prods":[],"nullable":false,"id":4,"code":"","level":0,"special":{},"defined":false,"first":[4]},{"label":"^","kind":{},"prods":[],"nullable":false,"id":5,"code":"","level":0,"special":{},"defined":false,"first":[5]},{"label":"!","kind":{},"prods":[],"nullable":false,"id":6,"code":"","level":0,"special":{},"defined":false,"first":[6]},{"label":";","kind":{},"prods":[],"nullable":false,"id":7,"code":"","level":0,"special":{},"defined":false,"first":[7]},{"label":":","kind":{},"prods":[],"nullable":false,"id":8,"code":"","level":0,"special":{},"defined":false,"first":[8]},{"label":"|","kind":{},"prods":[],"nullable":false,"id":9,"code":"","level":0,"special":{},"defined":false,"first":[9]},{"label":"&","kind":{},"prods":[],"nullable":false,"id":10,"code":"","level":0,"special":{},"defined":false,"first":[10]},{"label":"~","kind":{},"prods":[],"nullable":false,"id":11,"code":"","level":0,"special":{},"defined":false,"first":[11]},{"label":"=>","kind":{},"prods":[],"nullable":false,"id":12,"code":"","level":0,"special":{},"defined":false,"first":[12]},{"label":"CODE","kind":{},"prods":[],"nullable":false,"id":13,"code":"\treturn %match.substr(2, %match.length - 4 ); ","level":0,"special":{},"defined":false,"first":[13]},{"label":"STRING_SINGLE","kind":{},"prods":[],"nullable":false,"id":14,"code":"","level":0,"special":{},"defined":false,"first":[14]},{"label":"STRING_DOUBLE","kind":{},"prods":[],"nullable":false,"id":15,"code":"","level":0,"special":{},"defined":false,"first":[15]},{"label":"IDENT","kind":{},"prods":[],"nullable":false,"id":16,"code":"","level":0,"special":{},"defined":false,"first":[16]},{"label":"n","kind":{},"prods":[],"nullable":false,"id":17,"code":"return Continue.apply(null, arguments);","level":0,"special":{},"defined":false,"first":[17]},{"label":"/~([^~]/|~[^/]|[^~/])*~/","kind":{},"prods":[],"nullable":false,"id":18,"code":"return Continue.apply(null, arguments);","level":0,"special":{},"defined":false,"first":[18]},{"label":"[tr ]+","kind":{},"prods":[],"nullable":false,"id":19,"code":"return Continue.apply(null, arguments);","level":0,"special":{},"defined":false,"first":[19]},{"label":"header_code","kind":{},"prods":[2],"nullable":1,"id":20,"code":"","level":0,"special":{},"defined":true,"first":[12,13]},{"label":"token_assocs","kind":{},"prods":[4,5],"nullable":0,"id":21,"code":"","level":0,"special":{},"defined":true,"first":[3,4,5,6,14,15]},{"label":"grammar_defs","kind":{},"prods":[15,16],"nullable":0,"id":22,"code":"","level":0,"special":{},"defined":true,"first":[16,1]},{"label":"footer_code","kind":{},"prods":[3],"nullable":1,"id":23,"code":"","level":0,"special":{},"defined":true,"first":[12,13]},{"label":"def","kind":{},"prods":[1],"nullable":0,"id":24,"code":"","level":0,"special":{},"defined":true,"first":[12,3,4,5,6,13,14,15]},{"label":"code_opt","kind":{},"prods":[32,33,34,35],"nullable":1,"id":25,"code":"","level":0,"special":{},"defined":true,"first":[12,13]},{"label":"token_assoc","kind":{},"prods":[6,7,8,9,10],"nullable":0,"id":26,"code":"","level":0,"special":{},"defined":true,"first":[3,4,5,6,14,15]},{"label":"token_defs","kind":{},"prods":[11,12],"nullable":0,"id":27,"code":"","level":0,"special":{},"defined":true,"first":[14,15]},{"label":"string","kind":{},"prods":[38,39],"nullable":0,"id":28,"code":"","level":0,"special":{},"defined":true,"first":[14,15]},{"label":"opt_semicolon","kind":{},"prods":[41,42],"nullable":1,"id":29,"code":"","level":0,"special":{},"defined":true,"first":[7]},{"label":"token_def","kind":{},"prods":[13,14],"nullable":0,"id":30,"code":"","level":0,"special":{},"defined":true,"first":[14,15]},{"label":"identifier","kind":{},"prods":[40],"nullable":0,"id":31,"code":"","level":0,"special":{},"defined":true,"first":[16]},{"label":"grammar_def","kind":{},"prods":[17,18],"nullable":0,"id":32,"code":"","level":0,"special":{},"defined":true,"first":[16,1]},{"label":"productions","kind":{},"prods":[19,20],"nullable":1,"id":33,"code":"","level":0,"special":{},"defined":true,"first":[10,12,13,9,16,14,15,11]},{"label":"rhs","kind":{},"prods":[21],"nullable":1,"id":34,"code":"","level":0,"special":{},"defined":true,"first":[10,12,13,16,14,15,11]},{"label":"sequence_opt","kind":{},"prods":[25,26],"nullable":1,"id":35,"code":"","level":0,"special":{},"defined":true,"first":[16,14,15,11]},{"label":"rhs_prec","kind":{},"prods":[22,23,24],"nullable":1,"id":36,"code":"","level":0,"special":{},"defined":true,"first":[10]},{"label":"sequence","kind":{},"prods":[27,28],"nullable":0,"id":37,"code":"","level":0,"special":{},"defined":true,"first":[16,14,15,11]},{"label":"symbol","kind":{},"prods":[29,30,31],"nullable":0,"id":38,"code":"","level":0,"special":{},"defined":true,"first":[16,14,15,11]},{"label":"code","kind":{},"prods":[36,37],"nullable":0,"id":39,"code":"","level":0,"special":{},"defined":true,"first":[13]},{"label":"$","kind":{},"prods":[],"nullable":false,"id":40,"code":"","level":0,"special":{},"defined":false,"first":[40]}];


	var ACTIONS = (function(){
		var PCB = {};
		var actions = [		function(){
var rval;rval =  arguments[0] ;
return rval;},
		function(){
var rval;rval =  arguments[4] ;
return rval;},
		function(){
var rval; global.code_head +=  arguments[0] ; 
return rval;},
		function(){
var rval; global.code_foot +=  arguments[0] ; 
return rval;},
		function(){
var rval;rval =  arguments[1] ;
return rval;},
		function(){
var rval;rval =  arguments[0] ;
return rval;},
		function(){
var rval;	global.assoc_level++;
														for( var i = 0; i <  arguments[1] .length; i++ ){
															global.symbols[  arguments[1] [i] ].level = global.assoc_level;
															global.symbols[  arguments[1] [i] ].assoc = ASSOC.LEFT;
														}
													
return rval;},
		function(){
var rval;	global.assoc_level++;
														for( var i = 0; i <  arguments[1] .length; i++ )
														{
															global.symbols[  arguments[1] [i] ].level = global.assoc_level;
															global.symbols[  arguments[1] [i] ].assoc = ASSOC.RIGHT;
														}
													
return rval;},
		function(){
var rval;	global.assoc_level++;
														for( var i = 0; i <  arguments[1] .length; i++ ){
															global.symbols[  arguments[1] [i] ].level = global.assoc_level;
															global.symbols[  arguments[1] [i] ].assoc = ASSOC.NOASSOC;
														}
													
return rval;},
		function(){
var rval;rval =  arguments[1] ;
return rval;},
		function(){
var rval;	if( global.whitespace_token == -1 ){
															var regex =  arguments[1] .substr( 1,  arguments[1] .length - 2 );
															global.whitespace_token = tabgen.create_symbol( "WHITESPACE", SYM.TERM, SPECIAL.WHITESPACE );
															compile_regex( regex, global.whitespace_token,  arguments[1] [0] != '\'', cur_line  );
														}
														else
															line_error( PCB.line, "Multiple whitespace definition" );
													
return rval;},
		function(){
var rval;	 arguments[1] .push( arguments[0] ); rval =  arguments[1] ; 
return rval;},
		function(){
var rval;	rval = [ arguments[0] ]; 
return rval;},
		function(){
var rval;	rval = tabgen.create_symbol(  arguments[1] , SYM.TERM, SPECIAL.NONE );
														var regex =  arguments[2] .substr( 1,  arguments[2] .length - 2 );
														global.symbols[rval].code =  arguments[0] ;
														compile_regex( regex, global.symbols[ rval ].id,  arguments[2] .charAt( 0 ) != '\'', cur_line  );
													
return rval;},
		function(){
var rval;	var regex =  arguments[1] .substr( 1,  arguments[1] .length - 2 );
														rval = tabgen.create_symbol( regex.replace( /\\/g, "" ), SYM.TERM, SPECIAL.NONE );
														global.symbols[rval].code =  arguments[0] ;

														compile_regex( regex, global.symbols[ rval ].id,   arguments[1] .charAt( 0 ) != '\'', cur_line );
													
return rval;},
		function(){
var rval;rval =  arguments[1] ;
return rval;},
		function(){
var rval;rval =  arguments[0] ;
return rval;},
		function(){
var rval;
														var nonterm = tabgen.create_symbol(  arguments[3] , SYM.NONTERM, SPECIAL.NONE );
														global.symbols[nonterm].defined = true;
														for( var i = 0; i <  arguments[1] .length; i++ ){
															global.productions[  arguments[1] [i] ].lhs = nonterm;
															global.symbols[nonterm].prods.push(  arguments[1] [i] );
														}

														if( first_lhs ){
															first_lhs = false;
															global.symbols[0].label = global.symbols[nonterm].label + "\'";
															global.productions[0].rhs.push( nonterm );
														}
													
return rval;},
		function(){
var rval;rval =  arguments[1] ;
return rval;},
		function(){
var rval;	 arguments[2] .push( arguments[0] ); rval =  arguments[2] ; 
return rval;},
		function(){
var rval;	rval = [ arguments[0] ]; 
return rval;},
		function(){
var rval;
														var prod = new Production({
															id:global.productions.length,
															lhs:null,
															rhs:/** @type {Array<number>} */ ( arguments[2] ),
															level:/** @type {number} */ ( arguments[1] ),
															code:( arguments[0] =="")?global.DEF_PROD_CODE:/** @type {string} */ ( arguments[0] )
														});
														//Get level of the leftmost terminal
														//as production level.
														if( prod.level == 0 )
														{
															if( prod.rhs.length > 0 )
																for( var i = prod.rhs.length-1; i >= 0; i-- )
																	if( global.symbols[prod.rhs[i]] &&
																		global.symbols[prod.rhs[i]].kind == SYM.TERM )
																	{
																		prod.level = global.symbols[prod.rhs[i]].level;
																		break;
																	}
														}

														global.productions.push( prod );
														rval = prod.id;
													
return rval;},
		function(){
var rval; 	var index;
														if( ( index = tabgen.find_symbol(  arguments[0] , SYM.TERM, SPECIAL.NONE ) ) > -1 )
															rval = global.symbols[index].level;
														else
															line_error( PCB.line, "Call to undefined terminal \"" +  arguments[0]  + "\"" );
													
return rval;},
		function(){
var rval;	var index;
														if( ( index = tabgen.find_symbol(  arguments[0] .substr( 1,  arguments[0] .length - 2).replace( /\\/g, "" ),
																		SYM.TERM, SPECIAL.NONE ) ) > -1 )
															rval = global.symbols[index].level;
														else
															line_error(  PCB.line, "Call to undefined terminal \"" +  arguments[0]  + "\"" );
													
return rval;},
		function(){
var rval;	rval = 0; 
return rval;},
		function(){
var rval;rval =  arguments[0] ;
return rval;},
		function(){
var rval;	rval = []; 
return rval;},
		function(){
var rval;  arguments[1] .push( arguments[0] ); rval =  arguments[1]  
return rval;},
		function(){
var rval; rval = [ arguments[0] ]; 
return rval;},
		function(){
var rval;
														if( ( rval = tabgen.find_symbol(  arguments[0] , SYM.TERM, SPECIAL.NONE ) ) <= -1 )
															rval = tabgen.create_symbol(  arguments[0] , SYM.NONTERM, SPECIAL.NONE );
													
return rval;},
		function(){
var rval;
														if( ( rval = tabgen.find_symbol(  arguments[0] .substr( 1,  arguments[0] .length - 2).replace( /\\/g, "" ), SYM.TERM, SPECIAL.NONE ) ) <= -1 )
															line_error(  PCB.line, "Call to undefined terminal " +  arguments[0]  );
													
return rval;},
		function(){
var rval; rval = tabgen.find_symbol( "ERROR_RESYNC", SYM.TERM,	SPECIAL.ERROR ); 
return rval;},
		function(){
var rval;rval =  arguments[0] ;
return rval;},
		function(){
var rval; rval = "return " +  arguments[0]  + ".apply(null, arguments);"; 
return rval;},
		function(){
var rval; rval = "(" +  arguments[0]  + ").apply(null, arguments);"; 
return rval;},
		function(){
var rval; rval = ""; 
return rval;},
		function(){
var rval; rval =  arguments[1]  +  arguments[0] ; 
return rval;},
		function(){
var rval;rval =  arguments[0] ;
return rval;},
		function(){
var rval;rval =  arguments[0] ;
return rval;},
		function(){
var rval;rval =  arguments[0] ;
return rval;},
		function(){
var rval;rval =  arguments[0] ;
return rval;},
		function(){
var rval;rval =  arguments[0] ;
return rval;},
		function(){
var rval; rval = ""; 
return rval;},
];
		return function (/** number */ act, /** Array<*> */ vstack, /** !PcbClass */ pcb){
			try{
				PCB = pcb;
				return actions[act].apply(null,vstack);
			}catch(e){
				if(e instanceof ReturnValue)return e.valueOf();
				throw e;
			}
		}
	})();

	/**
	 * @param {number} top
	 * @param {?number} la
	 * @returns {?number}
     */
	function get_act(top, la){	
		for(var i = 0; i < act_tab[top].length; i+=2)
			if(act_tab[top][i] === la)
				return act_tab[top][i+1];
		return null;
	}
	function get_goto(top, pop){	
		for(var i = 0; i < goto_tab[top].length; i+=2)
			if(goto_tab[top][i] === pop)
				return goto_tab[top][i+1];
		return null;
	}

	/**
	 * @param {!string} src
	 * @constructor
     */
	var PcbClass = function(src) {
		this.src = src;
	};
	/**
	 * @type {number}
     */
	PcbClass.prototype.line = 1;
	/**
	 * @type {number}
     */
	PcbClass.prototype.column = 1;
	/**
	 * @type {number}
     */
	PcbClass.prototype.offset = 0;
	/**
	 * @type {number}
     */
	PcbClass.prototype.error_step = 0;
	/**
	 * @type {string}
     */
	PcbClass.prototype.src = "";
	/**
	 * @type {string}
     */
	PcbClass.prototype.att = "";
	/**
	 * @type {?number}
     */
	PcbClass.prototype.la = null;
	/**
	 * @type {?number}
     */
	PcbClass.prototype.act = null;
	/**
	 * @returns {?number}
     */
	PcbClass.prototype.lex = function() {
        var /** number */ start, /** number */ pos, /** number */ chr, actionResult;
		var dfa = new DfaLex();
		var loop = true;
		while(loop){
			dfa.match_pos = 0;
			pos = this.offset + 1;
			do{
				pos--;
				dfa.state = 0;
				dfa.match = null;
				start = pos;
				if(this.src.length <= start) {
					this.la = eof;
					return eof;
				}
				do{
					chr = this.src.charCodeAt(pos);
					dfa.exec(chr,pos);
					if(dfa.state !== null)
						this.accountChar(chr);
					pos++;
				}while(dfa.state !== null);
			}while(whitespace > -1 && dfa.match === whitespace);
			if(dfa.match !== null){
				this.att = this.src.slice(start, dfa.match_pos);
				this.offset = dfa.match_pos;
				actionResult = TERMINAL_ACTIONS(this,dfa.match);
				if(dfa.state !== null)
					this.accountChar(chr);
				if(actionResult === Continue)
					continue;
				this.att = actionResult;
			}else {
				this.att = "";
			}
			loop = false;
		}
		this.la = dfa.match;
		return this.la;
	};
	/**
	 * @param {number} chr
     */
    PcbClass.prototype.accountChar = function(chr) {
		if( chr === 10 ){
			this.line++;
			this.column = 0;
		}
		this.column++;
	};
	function parse(/** string */ src, err_off, err_la){
		/**
		 * @type {!Array<number>}
         */
		var		sstack			= [0];
		/**
		 * @type {!Array<*>}
         */
		var		vstack			= [0];
		/**
		 * @type {number}
         */
		var 	err_cnt			= 0;
		/**
		 * @type {*}
		 */
		var		rval;
		/**
		 * @type {?number}
		 */
		var		act;
		/**
		 * @type {number}
		 */
		var i = 0;

		var PCB	= new PcbClass(src);
		err_off	= err_off || [];
		err_la = err_la || [];
		PCB.lex();
		while(true){
			PCB.act = get_act(sstack[0],PCB.la);
			if(PCB.act === null && defact_tab[sstack[0]] >= 0)
				PCB.act = -defact_tab[sstack[0]];
			if(PCB.act === null){//Parse error? Try to recover!
				//Report errors only when error_step is 0, and this is not a
				//subsequent error from a previous parse
				if(PCB.error_step === 0){
					err_cnt++;
					err_off.unshift(PCB.offset - PCB.att.length);
					err_la.unshift([]);
					for(i = 0; i < act_tab[sstack[0]].length; i+=2)
						err_la[0].push(labels[act_tab[sstack[0]][i]]);
				}
				//Perform error recovery			
				while(sstack.length > 1 && PCB.act === null){
					sstack.shift();
					vstack.shift();
					//Try to shift on error token
					PCB.act = get_act(sstack[0],PCB.la);
					if(PCB.act === error_token){
						sstack.unshift(PCB.act);
						vstack.unshift("");
					}
				}
				//Is it better to leave the parser now?
				if(sstack.length > 1 && PCB.act !== null){
					//Ok, now try to shift on the next tokens
					while(PCB.la !== eof){
						PCB.act = act_tab[sstack[0]][i+1];
						if(PCB.act != null)break;
						while(PCB.lex() != null)PCB.offset++;
					}
				}
				if(PCB.act === null || PCB.la === eof){
					break;
				}
				//Try to parse the next three tokens successfully...
				PCB.error_step = 3;
			}
			if(PCB.act > 0){//Shift
				//Parse tree generation
				sstack.unshift(PCB.act);
				vstack.unshift(PCB.att);
				PCB.lex();
				//Successfull shift and right beyond error recovery?
				if(PCB.error_step > 0)
					PCB.error_step--;
			}else{	//Reduce	
				act = -PCB.act;
				//vstack.unshift(vstack);
				rval = ACTIONS(act,vstack,PCB);
				//vstack.shift();
				sstack.splice(0,pop_tab[act][1]);
				vstack.splice(0,pop_tab[act][1]);
				
				PCB.act = get_goto(sstack[0],pop_tab[act][0]);
				//Do some parse tree construction if desired
				//Goal symbol match?
				if(act === 0) break; //Don't use PCB.act here!
			
				//...and push it!
				sstack.unshift(PCB.act);
				vstack.unshift(rval);
			}
		}
		return err_cnt;
	}
	return parse;
})(40,-1,1);


/**
 * Parses the specified grammar.
 * @module {jscc.parse} jscc/parse
 * @requires module:jscc/global
 * @requires module:jscc/regex
 * @requires module:jscc/tabgen
 * @requires module:jscc/log/log
 * @param {string} str - The grammar to parse.
 * @param {string=} filename - The filename being parsed.  Currently unused.
 * @returns {number} The number of parse errors.
 */
function parse_grammar( str, filename ){
	var error_offsets = [];
	var error_expects = [];
	var parse_error = 0;

	first_lhs = true;
	cur_line = 1;

	//_dbg_withstepbystep = true;
	//_dbg_withtrace = true;

	if( ( parse_error += __parse( str, error_offsets, error_expects ) ) > 0 )
	{
		for( var i = 0; i < parse_error; i++ )
			line_error( ( str.substr( 0, error_offsets[i] ).match( /\n/g ) ?
				str.substr( 0, error_offsets[i] ).match( /\n/g ).length : 1 ),
					"Parse error near\n\t"  + str.substr( error_offsets[i], 30 ) +
						( ( error_offsets[i] + 30 < str.substr( error_offsets[i] ).length ) ?
							"..." : "" ) + "\n\t" + error_expects[i].join() + " expected" );
	}
	return parse_error;
}
return parse_grammar;
}));



/*
 * Universal module definition for module containing Dfa class.
 */
(function(root, factory) {
    /* istanbul ignore next */
    if (typeof define === 'function' && define.amd) {
        define('lib/jscc/classes/Dfa',factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.jsccDfa = factory();
    }
}(this, function() {
        /**
     * Creates a new Dfa instance.
     * @classdesc Represents a state in a deterministic finite automata.
     * @param {DfaOptions=} o - Optional overrides for default property values.
     * @constructor
     */
    jscc.classes.Dfa = function(o) {
        var p = o || {};
        if (typeof p.line !== 'undefined' && Array.isArray(p.line)) {
            this.line = /** @type {!Array} */ (p.line);
        }
        if (typeof p.nfa_set !== 'undefined' && Array.isArray(p.nfa_set)) {
            this.nfa_set = /** @type {!Array<!number>} */ (p.nfa_set);
        }
        if (typeof p.accept === 'number') {
            this.accept = /** @type {!number} */ (p.accept);
        }
        if (typeof p.done === 'boolean') {
            this.done = /** @type {!boolean} */ (p.done);
        }
        if (typeof p.group === 'number') {
            this.group = /** @type {!number} */ (p.group);
        }
    };

    /**
     * A multidimensional, generated array corresponding to this DFA state.
     * @type {!Array}
     */
    jscc.classes.Dfa.prototype.line = [];
    /**
     * Indexes of NFA states represented in this DFA state.
     * @type {!Array<!number>}
     */
    jscc.classes.Dfa.prototype.nfa_set = [];
    /**
     * Index of an accepting state.
     * @type {!number}
     */
    jscc.classes.Dfa.prototype.accept = -1;
    /**
     * Whether this DFA state has been fully processed.
     * @type {!boolean}
     */
    jscc.classes.Dfa.prototype.done = false;
    /**
     * A group index for this DFA state.
     * @type {!number}
     */
    jscc.classes.Dfa.prototype.group = -1;

    /**
     * The module containing the Dfa class.
     * @module {function(new:jscc.classes.Dfa, DfaOptions=)} jscc/classes/Dfa
     */
    return jscc.classes.Dfa;
}));

/*
 * Universal module definition for lexdfa.
 */
(function(root, factory) {
    /* istanbul ignore next */
    if (typeof define === 'function' && define.amd) {
        define('lib/jscc/lexdfa',['require', './global', './log/log', './enums/EDGE', './classes/Dfa'], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory(require);
    } else {
        root.jscclexdfa = factory(function(mod) {
            return root["jscc" + mod.split("/").pop()];
        });
    }
}(this,
  /**
   * @param {reqParameter} require
   * @param {...*} others
   * @returns {jscc.lexdfa}
   */
  function(require, others) {
            var log, global = /** @type {jscc.global} */ (require("./global")),
          EDGE = require("./enums/EDGE"),
          Dfa = /** @type {function(new:jscc.classes.Dfa, ?DfaOptions=)} */ (require("./classes/Dfa"));

      /**
       * @suppress {uselessCode}
       */
      (function() {
          if (false) {
              log = /** @type {jscc.log} */ (require("./log/logNode"));
          } else {
              log = /** @type {jscc.log} */ (require("./log/log"));
          }
      })();

      /**
       * @constructor
       */
      jscc.lexdfa = function() {
      };
      /**
       * DFA-related functions.
       * @module {jscc.lexdfa} jscc/lexdfa
       * @requires module:jscc/global
       * @requires module:jscc/log/log
       */
      jscc.lexdfa.prototype = {
          /**
           * Creates a new {@link jscc.global.Dfa} object and
           * adds it to the provided array.
           * @param {Array<!jscc.classes.Dfa>} where - The array to which to add the
           * new Dfa object.
           * @returns {number} The prior length of the provided array.
           * @memberof jscc.lexdfa
           */
          create_dfa: function(where) {
              var dfa = new Dfa({
                  line: new Array(global.MAX_CHAR),
                  accept: -1,
                  nfa_set: [],
                  done: false,
                  group: -1
              });
              where.push(dfa);
              return where.length - 1;
          },

          /**
           * Determines whether the dfa_states array has a
           * Dfa object whose {@link jscc.global.Dfa#nfa_set}
           * property contains the same values as those in the
           * items parameter.
           * @param {Array<!jscc.classes.Dfa>} dfa_states - The array of Dfa
           * objects to check.
           * @param {Array<number>} items - The set to match.
           * @returns {number} The index in dfa_states of the first
           * matching item, or -1 if no match exists.
           * @memberof jscc.lexdfa
           */
          same_nfa_items: function(dfa_states, items) {
              var i, j;
              for (i = 0; i < dfa_states.length; i++) {
                  if (dfa_states[i].nfa_set.length == items.length) {
                      for (j = 0; j < dfa_states[i].nfa_set.length; j++) {
                          if (dfa_states[i].nfa_set[j] != items[j]) {
                              break;
                          }
                      }
                      if (j == dfa_states[i].nfa_set.length) {
                          return i;
                      }
                  }
              }
              return -1;
          },

          /**
           * Determines the next Dfa object in the provided array
           * whose {@link jscc.classes.Dfa#done} value is false.
           * @param {Array<!jscc.classes.Dfa>} dfa_states - The array to check.
           * @returns {number} The index of the first array element for
           * which done is false, or -1 if no such element exists.
           * @memberof jscc.lexdfa
           */
          get_undone_dfa: function(dfa_states) {
              for (var i = 0; i < dfa_states.length; i++) {
                  if (!dfa_states[i].done) {
                      return i;
                  }
              }
              return -1;
          },

          /**
           * Performs a move operation on a given input character from a
           * set of NFA states.
           * @param {Array<!number>} state_set - The set of epsilon-closure
           * states on which base the move should be performed.
           * @param {Array<!jscc.classes.Nfa>} machine - The NFA state machine.
           * @param {number} ch - A character code to be moved on.
           * @returns {Array<!number>} If there is a possible move, a new
           * set of NFA-states is returned, else the returned array has a
           * length of 0.
           * @author Jan Max Meyer
           * @memberof jscc.lexdfa
           */
          move: function(state_set, machine, ch) {
              var hits = [];
              var tos = -1;
              try {
                  do {
                      tos = state_set.pop();
                      if (machine[tos].edge == EDGE.CHAR) {
                          if (machine[tos].ccl.get(ch)) {
                              hits.push(machine[tos].follow);
                          }
                      }
                  } while (state_set.length > 0);
              } catch (e) {
                  log.error("\n state_set= " + state_set + " machine= " + machine + " ch= " + ch);
                  throw e;
              }
              return hits;
          },

          /**
           * Performs an epsilon closure from a set of NFA states.
           * @param {Array<!number>} state_set - The set of states on which
           * base the closure is started.  The whole epsilon closure will
           * be appended to this parameter, so this parameter acts as
           * input/output value.
           * @param {Array<!jscc.classes.Nfa>} machine - The NFA state machine.
           * @returns {Array<!number>} An array of accepting states, if
           * available.
           * @author Jan Max Meyer
           * @memberof jscc.lexdfa
           */
          epsilon_closure: function(state_set, machine) {
              var stack = [];
              var accept = [];
              var tos = -1;
              for (var i = 0; i < state_set.length; i++) {
                  stack.push(state_set[i]);
              }
              do {
                  tos = stack.pop();
                  if (machine[tos].accept >= 0) {
                      accept.push(machine[tos].accept);
                  }
                  if (machine[tos].edge == EDGE.EPSILON) {
                      if (machine[tos].follow > -1) {
                          for (var i = 0; i < state_set.length; i++) {
                              if (state_set[i] == machine[tos].follow) {
                                  break;
                              }
                          }
                          if (i == state_set.length) {
                              state_set.push(machine[tos].follow);
                              stack.push(machine[tos].follow);
                          }
                      }
                      if (machine[tos].follow2 > -1) {
                          for (var i = 0; i < state_set.length; i++) {
                              if (state_set[i] == machine[tos].follow2) {
                                  break;
                              }
                          }
                          if (i == state_set.length) {
                              state_set.push(machine[tos].follow2);
                              stack.push(machine[tos].follow2);
                          }
                      }
                  }
              } while (stack.length > 0);
              return accept.sort();
          },

          /**
           * Constructs a deterministic finite automata (DFA) from a
           * nondeterministic finite automata, by using the subset
           * construction algorithm.
           * @param {!Array<!jscc.classes.Nfa>} nfa_states - The NFA-state machine
           * on which base the DFA will be constructed.
           * @returns {!Array<!jscc.classes.Dfa>} An array of DFA-objects forming the
           * new DFA-state machine.  This machine is not minimized here.
           * @author Jan Max Meyer
           * @memberof jscc.lexdfa
           */
          create_subset: function(nfa_states) {
              var dfa_states = [];
              var stack = [0];
              var current = this.create_dfa(dfa_states);
              var trans;
              var next = -1;
              var lowest_weight;

              if (nfa_states.length == 0) {
                  return dfa_states;
              }
              this.epsilon_closure(stack, nfa_states);
              dfa_states[current].nfa_set = dfa_states[current].nfa_set.concat(stack);
              while ((current = this.get_undone_dfa(dfa_states)) > -1) {
                  dfa_states[current].done = true;
                  lowest_weight = -1;
                  for (var i = 0; i < dfa_states[current].nfa_set.length; i++) {
                      if (nfa_states[dfa_states[current].nfa_set[i]].accept > -1
                          && nfa_states[dfa_states[current].nfa_set[i]].weight < lowest_weight
                          || lowest_weight == -1) {
                          dfa_states[current].accept = nfa_states[dfa_states[current].nfa_set[i]].accept;
                          lowest_weight = nfa_states[dfa_states[current].nfa_set[i]].weight;
                      }
                  }
                  for (var i = global.MIN_CHAR; i < global.MAX_CHAR; i++) {
                      trans = [].concat(dfa_states[current].nfa_set);
                      trans = this.move(trans, nfa_states, i);

                      if (trans.length > 0) {
                          this.epsilon_closure(trans, nfa_states);
                      }

                      if (trans.length == 0) {
                          next = -1;
                      } else if ((next = this.same_nfa_items(dfa_states, trans)) == -1) {
                          next = this.create_dfa(dfa_states);
                          dfa_states[next].nfa_set = trans;
                      }
                      dfa_states[current].line[i] = next;
                  }
              }
              return dfa_states;
          },

          /**
           * Minimizes a DFA, by grouping equivalent states together.
           * These groups form the new, minimized dfa-states.
           * @param {!Array<!jscc.classes.Dfa>} dfa_states - The DFA-state machine on
           * which base the minimized DFA is constructed.
           * @returns {!Array<!jscc.classes.Dfa>} An array of DFA-objects forming the
           * minimized DFA-state machine.
           * @author Jan Max Meyer
           * @memberof jscc.lexdfa
           */
          minimize_dfa: function(dfa_states) {
              var groups = [[]];
              var accept_groups = [];
              var min_dfa_states = [];
              var old_cnt = 0;
              var cnt = 0;
              var new_group;
              var i, j, k;

              if (dfa_states.length == 0) {
                  return min_dfa_states;
              }
              // Forming a general starting state:
              // Accepting and non-accepting states are pushed in separate groups first
              for (i = 0; i < dfa_states.length; i++) {
                  if (dfa_states[i].accept > -1) {
                      for (j = 0; j < accept_groups.length; j++) {
                          if (accept_groups[j] == dfa_states[i].accept) {
                              break;
                          }
                      }
                      if (j == accept_groups.length) {
                          accept_groups.push(dfa_states[i].accept);
                          groups.push([]);
                      }
                      groups[j + 1].push(i);
                      dfa_states[i].group = j + 1;
                  } else {
                      groups[0].push(i);
                      dfa_states[i].group = 0;
                  }
              }

              // Now the minimization is performed on base of these default groups
              do {
                  old_cnt = cnt;
                  for (i = 0; i < groups.length; i++) {
                      new_group = [];
                      if (groups[i].length > 0) {
                          for (j = 1; j < groups[i].length; j++) {
                              for (k = global.MIN_CHAR; k < global.MAX_CHAR; k++) {
                                  // This verifies the equality of the first state
                                  // in this group with its successors
                                  var groupZeroLineK = dfa_states[groups[i][0]].line[k];
                                  var groupJLineK = dfa_states[groups[i][j]].line[k];
                                  if (groupZeroLineK != groupJLineK &&
                                      (groupZeroLineK == -1 ||
                                       groupJLineK == -1) ||
                                      (groupZeroLineK > -1 &&
                                       groupJLineK > -1 &&
                                       dfa_states[groupZeroLineK].group
                                       != dfa_states[groupJLineK].group)) {
                                      // If this item does not match, put it to a new group
                                      dfa_states[groups[i][j]].group = groups.length;
                                      new_group = new_group.concat(groups[i].splice(j, 1));
                                      j--;
                                      break;
                                  }
                              }
                          }
                      }
                      if (new_group.length > 0) {
                          groups[groups.length] = [];
                          groups[groups.length - 1] = groups[groups.length - 1].concat(new_group);
                          cnt += new_group.length;
                      }
                  }
              } while (old_cnt != cnt);

              // Updating the dfa-state transitions; each group forms a new state.
              for (i = 0; i < dfa_states.length; i++) {
                  for (j = global.MIN_CHAR; j < global.MAX_CHAR; j++) {
                      if (dfa_states[i].line[j] > -1) {
                          dfa_states[i].line[j] = dfa_states[dfa_states[i].line[j]].group;
                      }
                  }
              }
              for (i = 0; i < groups.length; i++) {
                  min_dfa_states.push(dfa_states[groups[i][0]]);
              }
              return min_dfa_states;
          }
      };
      return new jscc.lexdfa();
  }));

/*
 * Universal module definition for main entry point of JS/CC.
 */
(function(root, factory) {
    /* istanbul ignore next */
    if (typeof define === 'function' && define.amd) {
        define('lib/jscc/main',['require', './global', './io/io', './first',
                './printtab', './tabgen', './util',
                './integrity', './lexdbg',
                './parse', './log/log', './enums/LOG_LEVEL', './enums/EXEC', './lexdfa',
                './enums/MODE_GEN'], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory(require);
    } else {
        root.jscc = factory(function(mod) {
            return root["jscc" + mod.split("/").pop()];
        });
    }
}(this,
  /**
   * @param {reqParameter} require
   * @param {...*} others
   * @returns {function(?mainOptions=)}
   */
  function(require, others) {
    var io, log, global = /** @type {jscc.global} */ (require("./global")),
        first = /** @type {jscc.first} */ (require("./first")),
        printtab = /** @type {jscc.printtab} */ (require("./printtab")),
        tabgen = /** @type {jscc.tabgen} */ (require("./tabgen")),
        util = /** @type {jscc.util} */ (require("./util")),
        integrity = /** @type {jscc.integrity} */ (require("./integrity")),
        lexdbg = /** @type {jscc.lexdbg} */ (require("./lexdbg")),
        parse = /** @type {function(string, string=):number} */ (require("./parse")),
        LOG_LEVEL = require("./enums/LOG_LEVEL"),
        EXEC = require("./enums/EXEC"),
        lexdfa = /** @type {jscc.lexdfa} */ (require("./lexdfa")),
        MODE_GEN = require("./enums/MODE_GEN");

            /**
       * @suppress {uselessCode}
       */
      (function() {
          if (false) {
              io = /** @type {jscc.io} */ (require("./io/ioNode"));
              log = /** @type {jscc.log} */ (require("./log/logNode"));
          } else {
              io = /** @type {jscc.io} */ (require("./io/io"));
              log = /** @type {jscc.log} */ (require("./log/log"));
          }
      })();
    
    /**
     * The main entry point of JS/CC.  Call this module as a function to
     * process a grammar specification.
     * @module jscc
     * @requires module:jscc/global
     * @requires module:jscc/io/io
     * @requires module:jscc/first
     * @requires module:jscc/printtab
     * @requires module:jscc/tabgen
     * @requires module:jscc/util
     * @requires module:jscc/integrity
     * @requires module:jscc/lexdbg
     * @requires module:jscc/parse
     * @requires module:jscc/log/log
     * @param {?mainOptions=} options - Configuration options for the jscc module.
     */
    var main =
        function(options) {
            var opt = options || {};
            var logLevel = /** jscc.enums.LOG_LEVEL */ (LOG_LEVEL.WARN);
            if (typeof opt['logLevel'] === 'string') {
                logLevel = util.log_level_value(opt['logLevel']);
            } else if (opt['logLevel']) {
                logLevel = /** jscc.enums.LOG_LEVEL */ (opt['logLevel']);
            }
            log.setLevel(logLevel);
            log.trace("jscc main: processing options");
            var out_file = (typeof opt['out_file'] === 'string') ? opt['out_file'] : "";
            var src_file = (typeof opt['src_file'] === 'string') ? opt['src_file'] : "";
            var tpl_file = (typeof opt['tpl_file'] === 'string') ? opt['tpl_file'] : "";
            var dump_nfa = (typeof opt['dump_nfa'] === 'boolean') ? opt['dump_nfa'] : false;
            var dump_dfa = (typeof opt['dump_dfa'] === 'boolean') ? opt['dump_dfa'] : false;
            var verbose = (typeof opt['verbose'] === 'boolean') ? opt['verbose'] : false;
            var inputString = /** @type {string} */ ((typeof opt['input'] === 'string') ? opt['input'] : "");
            var inputFunction = (typeof opt['input'] === 'function') ? opt['input'] : null;
            var templateString = (typeof opt['template'] === 'string') ? opt['template'] : global.DEFAULT_DRIVER;
            var templateFunction = (typeof opt['template'] === 'function') ? opt['template'] : null;
            var outputCallback = (typeof opt['outputCallback'] === 'function') ? opt['outputCallback'] : null;
            var throwIfErrors = (typeof opt['throwIfErrors'] === 'boolean') ? opt['throwIfErrors'] : false;
            var exitIfErrors = (typeof opt['exitIfErrors'] === 'boolean') ? opt['exitIfErrors'] : false;

            // Only relevant to browsers, but include anyway
            if (inputString !== "") {
                global.read_all_input_function = function() {
                    return inputString;
                }
            } else if (inputFunction) {
                global.read_all_input_function = inputFunction;
            }

            if (templateString !== "") {
                global.read_template_function = function() {
                    return templateString;
                }
            } else if (templateFunction) {
                global.read_template_function = templateFunction;
            }

            if (outputCallback) {
                global.write_output_function = outputCallback;
            }

            global.file = (src_file || "") === "" ? "[input]" : src_file;
            global.dump_nfa = dump_nfa;
            global.dump_dfa = dump_dfa;

            log.trace("jscc main: reading source");
            var src = inputString;
            if (src === "") {
                if (inputFunction) {
                    src = inputFunction();
                } else if (src_file !== "") {
                    src = /** @type {string} */ (io.read_all_input(src_file));
                } else {
                    // TODO: read standard input
                    log.error("No input.  Specify input or src_file in the options parameter.");
                }
            }
            if (src !== "") {
                log.trace("jscc main: parse");
                parse(src, global.file);

                if (global.errors == 0) {
                    log.trace("jscc main: integrity.undef()");
                    integrity.undef();
                    log.trace("jscc main: integrity.unreachable()");
                    integrity.unreachable();

                    if (global.errors == 0) {
                        log.trace("jscc main: first.first()");
                        first.first();
                        log.trace("jscc main: tabgen.lalr1_parse_table(false)");
                        tabgen.lalr1_parse_table(false);
                        log.trace("jscc main: integrity.check_empty_states()");
                        integrity.check_empty_states();

                        if (global.errors == 0) {
                            if (global.dump_dfa) {
                                lexdbg.print_dfa(global.dfa_states);
                            }
                            log.trace("jscc main: lexdfa.create_subset(global.nfa_states.value)");
                            global.dfa_states = lexdfa.create_subset(global.nfa_states.value);
                            log.trace("jscc main: lexdfa.minimize_dfa(global.dfa_states)");
                            global.dfa_states = lexdfa.minimize_dfa(global.dfa_states);
                            log.trace("jscc main: read template");
                            /**
                             * @type {string}
                             */
                            var driver = templateString;
                            if (templateFunction) {
                                driver = templateFunction();
                            } else if (tpl_file !== "") {
                                driver = /** @type {string} */ (io.read_template(tpl_file));
                            }

                            log.trace("jscc main: replace template strings");
                            driver = driver.replace(/##HEADER##/gi, global.code_head);
                            driver = driver.replace(/##TABLES##/gi, printtab.print_parse_tables(MODE_GEN.JS));
                            driver = driver.replace(/##DFA##/gi, printtab.print_dfa_table(global.dfa_states));
                            driver = driver.replace(/##TERMINAL_ACTIONS##/gi, printtab.print_term_actions());
                            driver = driver.replace(/##LABELS##/gi, printtab.print_symbol_labels());
                            driver = driver.replace(/##ACTIONS##/gi, printtab.print_actions());
                            driver = driver.replace(/##FOOTER##/gi, global.code_foot);
                            driver = driver.replace(/##ERROR_TOKEN##/gi, printtab.get_error_symbol_id().toString());
                            driver = driver.replace(/##EOF##/gi, printtab.get_eof_symbol_id().toString());
                            driver = /** @type {string} */
                                (driver.replace(/##WHITESPACE##/gi, printtab.get_whitespace_symbol_id().toString()));

                            log.trace("jscc main: output");
                            if (global.errors == 0) {
                                if (outputCallback) {
                                    outputCallback(driver);
                                } else if (out_file != "") {
                                    io.write_output({
                                                        text: driver,
                                                        destination: out_file
                                                    });
                                } else {
                                    io.write_output(driver);
                                }
                            }

                            if (verbose) {
                                log.info("\"" + src_file + "\" produced " + global.states.length + " states (" +
                                         global.shifts + " shifts," +
                                         global.reduces + " reductions, " + global.gotos + " gotos)");
                            }
                        }
                    }
                }

                if (verbose) {
                    log.info(global.warnings + " warning" + (global.warnings > 1 ? "s" : "") + ", " +
                             global.errors + " error" + (global.errors > 1 ? "s" : ""));
                }

            }

            if (exitIfErrors && global.errors > 0) {
                io.exit(1);
            }

            if (throwIfErrors && global.errors > 0) {
                throw new Error("There were one or more compilation errors.  See the log output for more information.");
            }
        };
    return main;
}));

(function(root, factory) {
    /* istanbul ignore next */
    if (typeof define === 'function' && define.amd) {
        define('main',["require", "./lib/jscc/main"], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory(require);
    } else {
        root.jsccmain = factory(function() {
            return root.jscc;
        });
    }
}(this,
  /**
   * @param {reqParameter} require
   * @param {...*} others
   * @returns {function(?mainOptions=)}
   */
  function(require, others) {
    var main = /** @type {function(?mainOptions=)} */ (require("./lib/jscc/main"));
    return main;
}));

/*
 * Export statements for Closure's use.
 */
jscc['enums'] = jscc.enums;
//noinspection ThisExpressionReferencesGlobalObjectJS
/** @suppress {globalThis} */
//(this['jscc'] = jscc);
//noinspection ThisExpressionReferencesGlobalObjectJS
/** @suppress {globalThis} */
jglobal.requireLib = require;
jscc.require = require;

/*
 * RequireJS configuration for browser environments.
 */
requirejs.config({
    baseUrl: ".",
    paths: {
        "text": "bin/text",
        "requireLib": "node_modules/requirejs/require",
        "has": "volo/has"
    },
    map: {
        "*": {
            "lib/jscc/io/io": "lib/jscc/io/ioBrowser",
            "lib/jscc/log/log": "lib/jscc/log/logBrowser",
            "lib/jscc/bitset": "lib/jscc/bitset/BitSet32"
        }
    },
    nodeRequire: require,
    config: {
        "lib/jscc/global": {
            "version": "0.40.1"
        }
    }
});
require(["main"]);

//# sourceMappingURL=jscc-browser.js.src.js.map
