export declare type Resolver<A> = (resolve: (result: A) => void, reject: (error: Error) => void) => void;
export default class Promise<A> {
    onResolve: Array<(result: A) => void>;
    onReject: Array<(error: Error) => void>;
    resolved: boolean;
    failed: boolean;
    value: A;
    error: Error;
    resolve: (result: A) => void;
    reject: (error: Error) => void;
    static resolved: <A>(val: A) => Promise<A>;
    static rejected: <A>(error: Error) => Promise<A>;
    static sequence: <A>(as: Promise<A>[]) => Promise<A[]>;
    static all: <A>(as: Promise<A>[]) => Promise<A[]>;
    static race: <A>(as: Promise<A>[]) => Promise<A>;
    constructor(resolver?: Resolver<A>);
    callback(): (err?: Error, res?: A) => void;
    then<B>(onFulfilled: (result: A) => Promise<B> | B, onRejected?: (error: Error) => void): Promise<B>;
}
