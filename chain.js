/* Copyright (c) 2010 Chris O'Hara <cohara87@gmail.com>. MIT Licensed */

(function(exports) {
    
    exports = exports || {};
    
    var handlers = {}, createChain, add, nop = function(){};
    
    createChain = function (context, stack, lastMethod) {
    
        var inHandler = context.halt = false;
        
        //The default error handler 
        context.error = function (e) {
            throw e;
        }
        
        //Run the next method in the chain
        context.next = function (exit) {
            if (exit) {
                inHandler = false;
            }
            if (!context.halt && stack && stack.length) {
                var args = stack.shift(), method = args.shift();
                inHandler = true;
                try {
                    handlers[method].apply(context, [args, args.length, method]);
                } catch (e) {
                    context.error(e);
                }
            }
            return context;
        }
        
        //Bind each method to the context
        for (var alias in handlers) {
            if (typeof context[alias] === 'function') {
                continue;
            }
            (function (alias) {
                context[alias] = function () {
                    var args = Array.prototype.slice.call(arguments);
                    args.unshift(alias);
                    if (!stack) {
                        return createChain({}, [args], alias);
                    }
                    context.then = context[alias];
                    stack.push(args);
                    return inHandler ? context : context.next();
                }
            }(alias));
        }
        
        //'then' is an alias for the last method that was called
        if (lastMethod) {
            context.then = context[lastMethod];
        }
        
        //Used to call run(), chain() or another existing method when defining a new method
        //See load.js (https://github.com/chriso/load.js/blob/master/load.js) for an example
        context.call = function (method, args) {
            args.unshift(method);
            stack.unshift(args);
            context.next(true);
        }
        
        return context.next();
    }
    
    //Add a custom method/handler (see below)
    add = exports.addMethod = function (method /*, alias1, alias2, ..., callback */) {
        var args = Array.prototype.slice.call(arguments), 
            handler = args.pop();
        for (var i = 0, len = args.length; i < len; i++) {
            if (typeof args[i] === 'string') {
                handlers[args[i]] = handler;
            }
        }
        //When no aliases have been defined, automatically add 'then<Method>'
        //e.g. adding 'run' also adds 'thenRun' as a method
        if (!--len) {
            handlers['then' + method[0].toUpperCase() + method.substr(1)] = handler;
        }
        createChain(exports);
    }
    
    //chain() - Run each function sequentially
    add('chain', function (args) {
        var self = this, next = function () {
            if (self.halt) {
                return;
            } else if (!args.length) {
                return self.next(true);
            }
            try {
                if (null != args.shift().call(self, next, self.error)) {
                    next();
                }
            } catch (e) {
                self.error(e);
            }
        }
        next();
    });
    
    //run() - Run each function in parallel and progress once all functions are complete
    add('run', function (args, arg_len) {
        var self = this, chain = function () {
            if (self.halt) {
                return;
            } else if (!--arg_len) {
                self.next(true);
            }
        }
        for (var i = 0, len = arg_len; !self.halt && i < len; i++) {
            if (null != args[i].call(self, chain, self.error)) {
                chain();
            }
        }
    });

    //onError() - Attach an error handler
    add('onError', function (args, arg_len) {
        var self = this;
        this.error = function (err) {
            self.halt = true;
            for (var i = 0; i < arg_len; i++) {
                args[i].call(self, err);
            }
        }
        this.next(true);
    });
    
}(this));