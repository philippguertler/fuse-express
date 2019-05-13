import * as fuse from 'fuse-bindings';
import { Path } from 'fuse-bindings';
import { promisify } from 'util';
import pathToRegexp, { Key } from 'path-to-regexp';
import { Matcher, Route, FuseHandler, ReadDirResponse, FuseHandlerRequest, Operation, MatcherFunction, PathParameters, FileAttributeCache } from './types';
import { readDirResponse } from './FuseResponse';

export * from 'fuse-bindings';
export * from './constants';
export * from './types';

export default function createApp() {
  return new FuseExpress();
}

const mountPaths: Set<string> = new Set();

class FuseExpress {
  private handlers: Matcher[] = [];
  private fileAttrCache: FileAttributeCache = new Map();

  public ls(route: Route, handler: FuseHandler<ReadDirResponse>) {
    this.handlers.push({
      matches: simpleMatcher(route, 'readdir'),
      handler
    })
  }

  public async mount(mountPath: Path): Promise<void> {
    mountPaths.add(mountPath);
    await promisify(fuse.mount)(mountPath, this.createFuseCallbacks());
  }

  private createFuseCallbacks(): fuse.Operations {
    return {
      readdir: (path, callback) => {
        console.log("readdir", path)
        const operation = "readdir";
        const matchingHandlers = this.handlers.filter(h => h.matches(path, operation));
        if (matchingHandlers.length === 0) {
          console.log("shortcut");
          callback(0, [".", ".."])
          return;
        }
        const request: FuseHandlerRequest = { operation, path };
        const response = readDirResponse(path, this.fileAttrCache, callback);

        let nextHandler = () => { callback(0, [".", ".."]) };
        forEachRight(matchingHandlers, handler => {
          nextHandler = () => handler.handler(request, response, nextHandler);
        });

        nextHandler();
      },
      getattr: (path, callback) => {
        console.log("getattr", path);
        if (path === "/") {
          return callback(0, {
            mtime: new Date(),
            atime: new Date(),
            ctime: new Date(),
            nlink: 1,
            size: 100,
            mode: 16877,
            uid: process.getuid ? process.getuid() : 0,
            gid: process.getgid ? process.getgid() : 0
          })
        }

        const cached = this.fileAttrCache.get(path);
        if (cached) {
          return callback(0, cached);
        }

        return callback(fuse.ENOENT);
      }
    }
  }
}

function simpleMatcher(route: Route, operation: Operation): MatcherFunction {
  const keys: Key[] = [];
  const regex = pathToRegexp(route, keys);
  return (path, op) => {
    if (op !== operation) return null;

    const result = regex.exec(path);
    if (result) {
      return createPathParameters(keys, result);
    } else {
      return null;
    }
  };
}

function createPathParameters(keys: Key[], result: RegExpExecArray): PathParameters {
  let params: any = {};
  for (let i = 1; i < result.length; i++) {
    params[keys[i-1].name] = result[i];
  }
  return params;
}

function forEachRight<T>(arr: T[], callback: (value: T, index: number) => void): void {
  for (let i = arr.length - 1; i >= 0; i--) {
    callback(arr[i], i);
  }
}

function exit() {
  mountPaths.forEach(path => fuse.unmount(path, (err) => {
    if (err) {
      console.log('filesystem at ' + path + ' not unmounted', err.name, err.message)
    }
  }));
}

process.on('exit', exit);
process.on('SIGINT', exit);
process.on('SIGTERM', exit);