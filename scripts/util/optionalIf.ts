export type BoolOr<A extends true | false | undefined, B extends true | false | undefined> = A extends true ? true : B
export type OptionalIf<T, D extends true | false | undefined> = D extends true ? T | undefined : T
export type OptionalIfNot<T, D extends true | false | undefined> = D extends false | undefined ? T | undefined : T
