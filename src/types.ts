import { Path, StatusCode, FsAttributes } from "fuse-bindings";

export type Route = string;
export type NextFunction = () => void;
export type FuseHandler<T> = (request: FuseHandlerRequest, response: FuseHandlerResponse<T>, next: NextFunction) => any;
export type MatcherFunction = (path: Path, operation: Operation) => RegExpExecArray | null;
export type PathParameters = any;

export const operations = <const> ["readdir"];
export type Operation = typeof operations[number];

export interface FuseHandlerRequest {
  operation: Operation,
  path: Path,
}

export interface FuseHandlerResponse<T> {
  status(status: StatusCode): FuseHandlerResponse<T>;
  send(result: T): void;
}

export type ReadDirResponse = Array<string | ReadDirFile>;
export interface ReadDirFile extends FsAttributes {
  name: string;
}

export type FileAttributeCache = Map<string, FsAttributes>;

export interface Matcher {
  matches: MatcherFunction;
  handler: FuseHandler<any>;
}