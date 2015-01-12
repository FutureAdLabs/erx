/* @flow */

class Observer<A> {
    value: (value: A) => void;
    error: (error: Error) => void;
    close: () => void;
    constructor(onValue: ?(value: A) => void, onError: ?(error: Error) => void, onClose: ?() => void): void{
      this.value = onValue || nop;
      this.error =  onError || nop;
      this.close =  onClose || nop;
    }
}


type Sink<A> = {
    value: (value: A) => void;
    error: (error: Error) => void;
    close: () => void;
};

type Producer<A> = (sink: Sink<A>) => (void | () => void)

type Observable<A> = {
    observe: (observer: Observer<A>) => void;
    unobserve: (observer: Observer<A>) => void;
    subscribe: (onValue: ?(value: A) => void,
                onError: ?(error: Error) => void,
                onClose: ?() => void) => Observer<A>;

                map: <B>(fn: (value: A) => B) => Observable<B>;
                filter: (fn: (value: A) => boolean) => Observable<A>;
                merge: (other: Observable<A>) => Observable<A>;
                concat: (other: Observable<A>) => Observable<A>;
};

var isFn = (v) => typeof v === "function";
var nop = function() {};



function tryFn<A,B>(fn: (val: A) => B, val: A, onValue: (val: B) => void, onError: (err: Error) => void) {
    var v;
    try {
        v = fn(val);
    } catch(e) {
        onError(e);
        return;
    }
    onValue(v);
}

function observable<A>(producer: Producer<A>): Observable<A> {
    var observers = [];
    var sink: Sink = {
        value: (value) => observers.forEach((o) => o.value(value)),
        error: (err) => {
            observers.forEach((o) => o.error(err));
            if (free && isFn(free)) free();
            observers = [];
        },
        close: () => {
            observers.forEach((o) => o.close());
            if (free && isFn(free)) free();
            observers = [];
        }
    };
    var free = null;
    var produce = () => {
        free = producer(sink);
    }

    // Observable
    var me: Observable = {

        // add an observer
        observe: (o) => {
            var fresh = observers.length === 0;
            observers.push(o);
            if (fresh) produce();
        },

        // remove an observer
        unobserve: (o) => {
            var i = observers.indexOf(o);
            if (i >= 0) {
                observers = observers.slice(0, i).concat(observers.slice(i + 1))
                if (observers.length === 0) {
                    if (free && isFn(free)) free();
                    free = null;
                }
            }
        },

        // listen to events (quickie create observer)
        subscribe: (onValue, onError, onClose) => {
            var o = new Observer(onValue, onError, onClose);
            me.observe(o);
            return o;
        },

        // map a function over an observable
        map: function map<B>(fn): Observable<B> {
            return observable((sink) => {
                var o = me.subscribe((val) => tryFn(fn, val, sink.value, sink.error),
                                     sink.error, sink.close);
                                     return () => me.unobserve(o);
            });
        },

        // filter an observable
        filter: (fn) => {
            return observable((sink) => {
                var o = me.subscribe((val) => tryFn(fn, val, (v) => { if (v) sink.value(val) }, sink.error),
                                     sink.error, sink.close);
                                 return () => me.unobserve(o);
            });
        },

        // merge two observables
        merge: (other) => {
            return observable((sink) => {
                var c = [false, false];
                var unsub = () => { me.unobserve(o1); other.unobserve(o2); }
                var onError = (err) => {
                    sink.error(err);
                    unsub();
                };
                var onClose = (i) => () => {
                    c[i] = true;
                    if (c[0] && c[1]) {
                        sink.close();
                        unsub();
                    }
                };
                var o1 = me.subscribe(sink.value, onError, onClose(0));
                var o2 = other.subscribe(sink.value, onError, onClose(1));
                return unsub;
            });
        },

        // concatenates two observables
        concat: (other) => {
            return observable((sink) => {
                var cur = me;
                var o = me.subscribe(sink.value, sink.error, () => {
                    me.unobserve(o);
                    cur = other;
                    o = other.subscribe(sink.value, sink.error, sink.close);
                });
                return () => cur.unobserve(o);
            });
        }
    };

    return me;
}

module.exports = {
    observable: observable,
    Observer: Observer,

    // saner aliases
    channel: observable,

    // constructors
    interval: function(ms: number): Observable<number>{
      return observable((sink) => {
        setInterval(() => sink.value(Date.now()), ms);
    })}

};

try {
  module.exports.Observable = Observable;
  module.exports.Sink = Sink;
  module.exports.Producer = Producer;
} catch(e) {}
