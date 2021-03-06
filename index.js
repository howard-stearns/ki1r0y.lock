"use strict";
/*jslint node: true, vars: true, ass: true*/
/*Copyright (c) 2013-2015 Howard Stearns. MIT License*/

// This improves performance when there are a lot of locks pending on the same key.
var Queue = exports.Queue = require('./queue.js');
var util = require('util');
var async = require('async'); // for lockMultiple
function noop () {}

// Execute iterator(unlock) while no other asynchronous proc has locked the same key.
// iterator can be asynchronous, but it must call unlock() to release key when ready (e.g., in its own callback), regardless of error.
var locks = {}, lockMultiple;
function lock(key, critical) {
    if (!key) { return critical(noop); } // As a convenience, if key is falsey, don't actually lock.
    if (util.isArray(key)) { return lockMultiple(key, critical); }
    var pending = locks[key];
    if (pending) {
        pending.enqueue(critical); //push
    } else {
        pending = locks[key] = new Queue(); //[]
        var unlock = function () {
            if (!pending.isEmpty()) { //!length
                var cont = pending.dequeue(); //shift, but faster
                setImmediate(function () { cont(unlock); });
            } else {
                delete locks[key];
            }
        };
        critical(unlock);
    }
}

// Lock a number of keys at once, freeing them when all critical(unlock) calls unlock.
// keys must not have duplciates!
function lockMultiple(keys, critical) {   // Critical is run only in a context in which the locks for all keys are closed for our use.
    async.map(keys, function (key, lcb) { // Acquire a lock on each key and accumulate the unlock functions.
        lock(key, function (unlock) { lcb(null, unlock); });
    }, function (e, pendingLocks) {       // It is now our turn. Every lock critical has been called, but we haven't unlocked anything yet.
        noop(e);                          // never set, by construction
        critical(function () { pendingLocks.forEach(function (unlock) { unlock(); }); });
    });
}
exports.lock = lock;
exports.lockMultiple = util.deprecate(lockMultiple, "lockMultiple is deprecated: Use lock with an array first argument instead.");
