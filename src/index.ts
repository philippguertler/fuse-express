import * as fuse from 'fuse-bindings';
import { Path } from 'fuse-bindings';
import { promisify } from 'util';
import pathToRegexp, { Key } from 'path-to-regexp';
import { Matcher, Route, FuseHandler, ReadDirResponse, FuseHandlerRequest, Operation, MatcherFunction, PathParameters, FileAttributeCache, ReadResponse, OpenFiles, SimpleResponse, FuseHandlerResponse } from './types';
import { readDirResponse } from './FuseResponse';
import { release } from 'os';

export * from 'fuse-bindings';
export * from './constants';
export * from './types';

export default function createApp() {
  return new FuseExpress();
}

const mountPaths: Set<string> = new Set();
let fdCounter = 0;

class FuseExpress {
  private handlers: Matcher[] = [];
  private fileAttrCache: FileAttributeCache = new Map();
  private openFiles: OpenFiles = {};

  public ls(route: Route, handler: FuseHandler<ReadDirResponse>) {
    this.handlers.push({
      matches: simpleMatcher(route, 'readdir'),
      handler
    })
  }

  public read(route: Route, handler: FuseHandler<ReadResponse>) {
    this.handlers.push({
      matches: simpleMatcher(route, 'read'),
      handler
    });
  }

  public async mount(mountPath: Path): Promise<void> {
    mountPaths.add(mountPath);
    await promisify(fuse.mount)(mountPath, this.createFuseCallbacks());
  }

  private createFuseCallbacks(): fuse.Operations {
    return {
      readdir: (path, callback) => {
        console.log("readdir", path)

        const response = readDirResponse(path, this.fileAttrCache, callback);
        this.callHandlers("readdir", path, response, () => callback(0, [".", ".."]))
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

        let cached = this.fileAttrCache.get(path);
        if (cached) {
          return callback(0, cached);
        }

        return callback(fuse.ENOENT);
      },

      open: (path, flags, cb) => {
        console.log("open", path, flags)
        const operation = "read";
        const matchingHandlers = this.handlers.filter(h => h.matches(path, operation));
        if (matchingHandlers.length > 0) {
          cb(0, fdCounter++);
        } else {
          cb(fuse.ENOENT);
        }
      },

      read: async (path, fd, buffer, length, position, cb) => {
        console.log("read", path, fd, length, position)
        let responseBuffer = this.openFiles[fd];
        if (!responseBuffer) {
          const response = await this.simpleResponse<ReadResponse>("read", path, () => cb(fuse.ENOENT));
          if (!response) {
            return cb(fuse.ENOENT);
          }
          if (response.status < 0) {
            return cb(response.status);
          }
          responseBuffer = Buffer.from(response.result);
          this.openFiles[fd] = responseBuffer;
        }
        const bytesWritten = responseBuffer.copy(buffer, 0, position, position + length);
        cb(bytesWritten);
      },

      release: (path, fd, cb) => {
        console.log("release", path, fd)
        delete this.openFiles[fd];
        cb(0);
      }
    }
  }

  private simpleResponse<T>(operation: Operation, path: Path, fallback: () => any): Promise<SimpleResponse<T> | undefined> {
    return new Promise((resolve, reject) => {
      let statusResponse = 0;
      const response: FuseHandlerResponse<T> = {
        status(nr) {
          statusResponse = nr;
          return response;
        },
        send(result) {
          resolve({
            status: statusResponse,
            result
          });
        }
      };
      return this.callHandlers(operation, path, response, fallback);
    });
  }

  private callHandlers<T>(operation: Operation, path: Path, response: FuseHandlerResponse<T>, fallback: () => any): void {
    let nextHandler = fallback;
    forEachRight(this.handlers, handler => {
      const params = handler.matches(path, operation);
      if (params) {
        const request: FuseHandlerRequest = { operation, path, params };
        nextHandler = () => handler.handler(request, response, nextHandler);
      }
    });

    nextHandler();
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
    params[keys[i - 1].name] = result[i];
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