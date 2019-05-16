import { Path, StatusCode, FsAttributes } from "fuse-bindings";

export type Route = string;
export type NextFunction = () => void;
export type FuseHandler<T> = (request: FuseHandlerRequest, response: FuseHandlerResponse<T>, next: NextFunction) => any;
export type MatcherFunction = (path: Path, operation: Operation) => PathParameters | null;
export type PathParameters = any;

export const operations = <const> ["readdir", "read"];
export type Operation = typeof operations[number];

export interface FuseHandlerRequest {
  operation: Operation,
  path: Path,
  params: any
}

export interface FuseHandlerResponse<T> {
  status(status: StatusCode): FuseHandlerResponse<T>;
  send(result: T): void;
}

export type ReadResponse = string;
export type ReadDirResponse = Array<string | ReadDirFile>;
export interface ReadDirFile extends FsAttributes {
  name: string;
}

export type FileAttributeCache = Map<string, FsAttributes>;

export interface Matcher {
  matches: MatcherFunction;
  handler: FuseHandler<any>;
}

export interface OpenFiles {
  [fd: number]: Buffer;
}

export interface SimpleResponse<T> {
  status: StatusCode,
  result: T
}