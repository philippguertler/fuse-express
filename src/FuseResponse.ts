import { FuseHandlerResponse, ReadDirResponse, FileAttributeCache, ReadDirFile } from "./types";
import { StatusCode, FsAttributes } from "fuse-bindings";
import { FileType } from "./constants";
import * as pathUtil from 'path';

function withStatus<T>(callbacker: (status: StatusCode, result: T) => void): FuseHandlerResponse<T> {
  let boundStatus = 0;
  const handler: FuseHandlerResponse<T> = {
    status(statusCode) {
      boundStatus = statusCode;
      return handler;
    },
    send(result) {
      return callbacker(boundStatus, result);
    }
  }

  return handler;
}


export function readDirResponse(path: string, cache: FileAttributeCache, callback: Function): FuseHandlerResponse<ReadDirResponse> {
  return withStatus((status, result) => {
    const cacheEntries = result.map(toFsAttributes);
    cacheEntries.forEach(entry => cache.set(pathUtil.join(path, entry.name), entry))
    callback(status, [".", "..", ...cacheEntries.map(entry => entry.name)]);
  })
}



const defaultAttributes: FsAttributes = {
  mtime: new Date(),
  atime: new Date(),
  ctime: new Date(),
  nlink: 1,
  size: 100,
  mode: FileType.REGULAR_FILE | 0o644,
  uid: process.getuid ? process.getuid() : 0,
  gid: process.getgid ? process.getgid() : 0
}

function toFsAttributes(value: string | ReadDirFile): ReadDirFile {
  if (typeof value === 'string') {
    return { name: value, ...defaultAttributes };
  } else {
    return { ...defaultAttributes, ...value };
  }
}