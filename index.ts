/*
 * Copyright (c) 2012 Andrea Bonomi
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

declare var require: any;
declare var module: any;
declare var process: any;
var Buffer: any = require('buffer').Buffer;

var ENOENT: string = "No such file or directory";
var EEXIST: string = "File exists";
var ENOTDIR: string = "Not a directory";
var EISDIR: string = "Is a directory";
var ENOTEMPTY: string = "Directory not empty";
var ENOROOT: string = "Cannot delete root directory";
var ECOPYDIR: string = "Cannot copy directories";
var EINVALIDTYPE: string = "Invalid file type: valid types are 'json' and 'raw'";
var ENOINODE: string = 'Invalid inode';
var EACCES: string = 'Permission denied';
var EBADF: string = 'Bad file descriptor';
var EINVAL: string = 'Invalid argument';

var S_IXOTH:number = 1;     // 00001
var S_IWOTH:number = 2;     // 00002
var S_IROTH:number = 4;     // 00004
var S_IXGRP:number = 8;     // 00010
var S_IWGRP:number = 16;    // 00020
var S_IRGRP:number = 32;    // 00040
var S_IXUSR:number = 64;    // 00100
var S_IWUSR:number = 128;   // 00200
var S_IRUSR:number = 256;   // 00400

var S_IFDIR:number = 16384; // 040000
var S_IFREG:number = 32768; // 0100000
var S_IFLNK:number = 40960; // 0120000

var O_RDONLY:number     = 0;
var O_WRONLY:number     = 1;
var O_RDWR:number       = 2;
var O_APPEND:number     = 8;
var O_CREAT:number      = 512;
var O_EXCL:number       = 2048;
var O_TRUNC:number      = 1024;

var MODE_644:number     = 420;
var MODE_666:number     = 438;
var MODE_755:number     = 493;
var MODE_777:number     = 511;
var ALL_MODES:number    = 4095;

var ROOT_INODE:number   =  1;

enum InodeType { Raw, Dir, Json, Symlink };

// --------------------------------------------------------

class InodeContent {

    iCount: number;
    atime: Date;
    mtime: Date;
    ctime: Date;
    dataBlock: number;
    type: InodeType;
    uid: number;
    gid: number;
    mode: number;
    size: number;
    symlink: string; // symlink target

    constructor(dataBlock: number, type: InodeType = InodeType.Json, mode: number = MODE_777, size: number = 0, symlink: string = null) {
        var time: Date = new Date();
        this.iCount = 0;
        this.atime = time;
        this.mtime = time;
        this.ctime = time;
        this.dataBlock = dataBlock;
        this.type = type;
        this.uid = process.getuid();
        this.gid = process.getgid();
        this.mode = mode;
        this.size = size;
        this.symlink = symlink;
    }
}

// --------------------------------------------------------

class Inode {

    content: InodeContent;
    inodeBlock: number;
    valid: boolean;

    constructor(inodeBlock: number = null) {
        if (inodeBlock != null) {
            this.inodeBlock = inodeBlock;
            this.read()
        } else {
            this.inodeBlock = this.getFreeBlock();
            this.valid = false;
        }
    }

    getFreeBlock(): number {
        var keys: number[] = [];
        for (var key in localStorage){
            if (!isNaN(key)) {
                keys.push(Number(key));
            }
        }
        keys.sort();
        var num: number = 1;
        while (keys.indexOf(num) != -1) {
            num++;
        }
        localStorage.setItem(String(num), ''); // mark the block as reserved
        return num;
    }

    newInode(type: InodeType, dataBlock: number = null, mode: number = MODE_777, symlink: string = null) {
        dataBlock = dataBlock || this.getFreeBlock();
        mode = (mode & MODE_777);
        if (type == InodeType.Dir) {
            mode = mode | S_IFDIR;
        } else if (type == InodeType.Symlink) {
            mode = mode | S_IFLNK;
        } else {
            mode = mode | S_IFREG;
        }
        var time: Date = new Date();
        this.content = new InodeContent(dataBlock, type, mode, 0, symlink);
        this.valid = true;
    }

    /** Increment the inode references count */
    incCount(): void {
        this.content.iCount++;
        this.write();
    }

    /** Decrement the inode references count. Delete the inode if zero */
    decCount(): void {
        this.content.iCount--;
        this.write();
    }

    write(updateTime: boolean = true): void {
        if (this.content.iCount > 0) {
            if (updateTime) {
                var time: Date = new Date();
                this.content.atime = time;
                this.content.mtime = time;
            }
            fs._writeBlock(this.inodeBlock, this.content);
            this.valid = true;
        } else {
            // Delete the inode and the content if count is 0
            fs._removeBlock(this.inodeBlock);
            fs._removeBlock(this.content.dataBlock);
            this.content.iCount = 0;
            this.valid = false;
        }
    }

    read(): void {
        this.content = fs._readBlock(this.inodeBlock);
        if (this.content) {
            this.valid = true;
        } else {
            this.valid = false;
        }
    }

    stat(): fs.Stats {
        if (!this.valid) {
            this.read();
        }
        if (!this.valid) {
            throw new Error(ENOINODE);
        }
        return new fs.Stats(this);
    }

    writeContent(data): void {
        if (!this.valid) {
            this.read();
        }
        if (!this.valid) {
            throw new Error(ENOINODE);
        }
        if (this.content.type == InodeType.Dir) {
            throw new Error(EISDIR);
        }
        fs._writeBlock(this.content.dataBlock, data, InodeType.Raw);
        // Write file size
        this.content.size = data && data.length || 0;
        this.write();
    }

    readContent(): any {
        if (!this.valid) {
            this.read();
        }
        if (!this.valid) {
            throw new Error(ENOINODE);
        }
        return fs._readBlock(this.content.dataBlock, InodeType.Raw);
    }

    /**
     * Change ownership of a file
     */
    chown(uid: number, gid: number): void {
        if (!this.valid) {
            this.read();
        }
        if (uid !== undefined && uid !== null) {
            this.content.uid = uid; 
        }
        if (gid !== undefined && gid !== null) {
            this.content.gid = gid; 
        }
        this.write();
    }

    /**
     * Change permissions of a file
     */
    chmod(mode: number): void {
        if (!this.valid) {
            this.read();
        }
        this.content.mode = (this.content.mode & ~ALL_MODES) | (mode & ALL_MODES);
        this.write();
    }

    /**
     * Change file last access and modification times
     */
    utimes(atime: Date, mtime: Date): void {
        if (!this.valid) {
            this.read();
        }
        if (atime !== undefined && atime !== null) {
            this.content.atime = atime; 
        }
        if (mtime !== undefined && mtime !== null) {
            this.content.mtime = mtime; 
        }
        this.write(false);
    }

    /**
     * Returns the symbolic link's string value.
     */
    readlink(): string {
        if (!this.valid) {
            this.read();
        }
        if (! (this.content.mode & S_IFLNK)) {
            throw new Error(EINVAL);
        }
        return this.content.symlink;
    }

}

// --------------------------------------------------------

class Dir {

    inode: Inode;
    dirBlock: number;
    content: any;

    constructor(inode: Inode) {
        this.inode = inode;
        this.dirBlock = inode.content.dataBlock;
        this.content = fs._readBlock(inode.content.dataBlock) || {};
    }

    link(name: string, inode: Inode, skipHardLinkCheck: boolean = false): void {
        if (this.content[name]) {
            throw new Error(EEXIST);
        }
        if (!inode || !inode.valid) {
            throw new Error(ENOINODE);
        }
        if (inode.content.type == InodeType.Dir && !skipHardLinkCheck) {
            throw new Error(EISDIR);
        }
        this.content[name] = inode.inodeBlock;
        inode.incCount();
        this.write();
    }

    unlink(name: string): void {
        if (!this.content[name]) {
            throw new Error(ENOENT);
        }
        if (name == '.' || name == '..') {
            throw new Error(name + ': "." and ".." may not be removed');
        }
        var inode: Inode = new Inode(this.content[name]);
        if (inode && inode.valid) {
            if (inode.content.type == InodeType.Dir) {
                throw new Error(EISDIR);
            }
            inode.decCount();
        }
        delete this.content[name];
        this.write();
    }

    symlink(name: string, target: string): void {
        if (this.content[name]) {
            throw new Error(EEXIST);
        }
        if (!target) {
            throw new Error(ENOENT);
        }
        var inode: Inode = new Inode();
        inode.newInode(InodeType.Symlink, null, MODE_755, target);
        this.content[name] = inode.inodeBlock;
        inode.incCount();
        this.write();
    }

    mkdir(name: string, mode: number = MODE_777): Dir {
        if (this.content[name]) {
            throw new Error(EEXIST);
        }
        var inode: Inode = new Inode();
        inode.newInode(InodeType.Dir, null, mode);
        var dir = new Dir(inode);
        dir.link('.', inode, true);
        dir.link('..', this.inode, true);
        this.link(name, inode, true);
        return dir;
    }

    rmdir(name: string): void {
        if (!this.content[name]) {
            throw new Error(ENOENT);
        }
        if (name == '.' || name == '..') {
            throw new Error(name + ': "." and ".." may not be removed');
        }
        var inode: Inode = new Inode(this.content[name]);
        if (inode && inode.valid) {
            if (inode.content.type != InodeType.Dir) {
                throw new Error(name + ': Not a directory');
            }
            var dir = new Dir(inode);
            if (Object.keys(dir.content).length > 2) {
                throw new Error(name + ': Directory not empty');
            }
            inode.decCount();
        }
        delete this.content[name];
        this.write();
    }

    mknod(name: string, mode: number = MODE_666): Inode {
        if (this.content[name]) {
            throw new Error(EEXIST);
        }
        var inode: Inode = new Inode();
        inode.newInode(InodeType.Raw, null, mode);
        this.link(name, inode);
        return inode;
    }

    readdir(excludeDot: boolean = false): string[] {
        var files: string[] = [];
        for(var k in this.content) {
            if (!excludeDot || (k != '.' && k != '..')) {
                files.push(k);
            }
        }
        return files;
    }

    getInode(name: string): Inode {
        if (!this.content[name]) {
            throw new Error(ENOENT);
        }
        var inode: Inode = new Inode(this.content[name]);
        if (!inode || !inode.valid) {
            throw new Error(ENOINODE);
        }
        return inode;
    }

    stat(name: string): fs.Stats {
        var inode: Inode = this.getInode(name);
        return inode.stat();
    }

    write(): void {
        fs._writeBlock(this.dirBlock, this.content);
    }

}

// --------------------------------------------------------

class FileHandler {
    num: number;
    inode: Inode; 
    readable: boolean;
    writable: boolean;
    offset: number;
    ref: number; // reference count
    data: any; // Buffer;

    constructor(num: number, inode: Inode, mode: number) {
        this.num = num;
        this.inode = inode;
        this.offset = 0;
        this.readable = !(mode & O_WRONLY);
        this.writable = ((mode & O_WRONLY) || (mode & O_RDWR)) != 0;
        this.ref = 0;
        if (this.readable) {
            this.data = new Buffer(inode.readContent());
        } else {
            this.data = new Buffer(0);
        }
    }

    fsync(): void {
        if (this.writable) {
            // TODO
        }
    }




}

class FileHandlers {

    handlers: any = {};

    addHandler(inode: Inode, mode: number): FileHandler {
        var keys: string[] = Object.keys(this.handlers).sort(function(a, b) { return Number(a) - Number(b) } );
        var num: number = 0;
        while (num in keys) {
            num++;
        }
        var fd: FileHandler = new FileHandler(num, inode, mode);
        this.handlers[num] = fd;
        return fd;
    }

    getHandler(num: number): FileHandler {
        var result : FileHandler = this.handlers[num];
        if (!result) {
            throw new Error(EBADF);
        }
        return result;
    }

    fsync(num: number): void {
        this.getHandler(num).fsync();
    }

}

// --------------------------------------------------------

module fs {

    export var _handlers: FileHandlers = new FileHandlers();

    export class Stats {
   
        ino: any;
        dev: number;
        mode: number;
        nlink: number;
        uid: number;
        gid: number;
        rdev: number;
        blksize: number;
        size: number;
        blocks: number;
        atime: Date;
        mtime: Date;
        ctime: Date;
        private _type: InodeType;

        constructor(inode) {
            this.ino = inode.inodeBlock;
            this.dev = inode.content.dev || 0;
            this.mode = inode.content.mode || MODE_777;
            this.nlink = inode.content.iCount;
            this.uid = inode.content.uid || 0;
            this.gid = inode.content.gid || 0;
            this.rdev = inode.content.rdev || 0;
            this.blksize = inode.content.blkdsize || 4096;
            this.size = inode.content.size || 0;
            this.blocks = Math.ceil(this.size / this.blksize);
            this.atime = new Date(inode.content.atime);
            this.mtime = new Date(inode.content.mtime);
            this.ctime = new Date(inode.content.ctime);
            this._type = inode.content.type;
        }

        isDirectory(): boolean {
            return this._type == InodeType.Dir;
        }

        isFile(): boolean {
            return this._type == InodeType.Raw || this._type == InodeType.Json;
        }
        
        isSymbolicLink(): boolean {
            return this._type == InodeType.Symlink;
        }

        isBlockDevice(): boolean {
            return false;
        }
        
        isCharacterDevice(): boolean {
            return false;
        }
        
        isFIFO(): boolean {
            return false;
        }
        
        isSocket(): boolean {
            return false;
        }

    }

    export class ReadStream {
   
        /* TODO
           options is an object with the following defaults:
           { flags: 'r',
             encoding: null,
             fd: null,
             mode: 0666,
             autoClose: true
           }
        */
        constructor(path: string, options) {
        }

    }

    export function _stringToFlags(flag: any): number {
        if (!isNaN(flag)) {
            return <number> flag;
        }

        switch (flag) {
            case 'r':
            case 'rs':
            case 'sr':
                return O_RDONLY;
            case 'r+':
            case 'rs+':
            case 'sr+':
                return O_RDWR;
            case 'w':
                return O_TRUNC | O_CREAT | O_WRONLY;
            case 'wx':
            case 'xw':
                return O_TRUNC | O_CREAT | O_WRONLY | O_EXCL;
            case 'w+':
                return O_TRUNC | O_CREAT | O_RDWR;
            case 'wx+':
            case 'xw+':
                return O_TRUNC | O_CREAT | O_RDWR | O_EXCL;
            case 'a':
                return O_APPEND | O_CREAT | O_WRONLY;
            case 'ax':
            case 'xa':
                return O_APPEND | O_CREAT | O_WRONLY | O_EXCL;
            case 'a+':
                return O_APPEND | O_CREAT | O_RDWR;
            case 'ax+':
            case 'xa+':
                return O_APPEND | O_CREAT | O_RDWR | O_EXCL;
        }
        return 0;
    }

    export function _readBlock(block: number, type: InodeType = InodeType.Json): any {
        var content = localStorage.getItem(String(block));
        if (type == InodeType.Json && content) {
            content = JSON.parse(content);
        }
        return content;
    }

    export function _writeBlock(block: number, content: any, type: InodeType = InodeType.Json) {
        if (type == InodeType.Json) {
            content = JSON.stringify(content);
        }
        return localStorage.setItem(String(block), content);
    }

    export function _removeBlock(block: number): void {
        localStorage.removeItem(String(block));
    }

    export function _syncToAsync(fn, args, optionalArgId, returnResult): void {
        if (optionalArgId !== undefined && optionalArgId !== null) {
            if (args[optionalArgId + 1] == undefined) {
                args[optionalArgId + 1] = args[optionalArgId];
                args[optionalArgId] = undefined;
            }
        }
        var callback = args.pop();
        try {
            var result = fn.apply(fs, args);
            if (returnResult) {
                callback(null, result);
            } else {
                callback(null);
            }
        } catch (err) {
            if (returnResult) {
                callback(err, null);
            } else {
                callback(err);
            }
        }
    }

    /**
     * Resolves 'path' to an absolute path
     */
    export function _resolvePath(path: string): string {
        if (path.substring(0, 1) != '/') {
            path = process.cwd() + '/' + path;
        }
        var newPath = new Array();
        var splittedPath = path.split('/');
        for (var i in splittedPath) {
            var t = splittedPath[i];		
            if (t == '..') {
                newPath.pop();
            } else if (t != '' && t != '.') {
                newPath.push(t);
            }
        }	
        return '/' + newPath.join('/');
    };

    export class NamexResult {
        inode: Inode;
        dir: Dir;
        parentDir: Dir;
        name: string;

        constructor(inode: Inode, dir: Dir, parentDir: Dir, name: string) {
            this.inode = inode;
            this.dir = dir;
            this.parentDir = parentDir;
            this.name = name;
        }
    }
    
    export function _namex(path: string, ignoredNonExistingLast: boolean = false, dontResolveLastSymlink: boolean = false): NamexResult {
        if (typeof path != 'string') {
            throw new TypeError('path must be a string');
        }
        path = fs._resolvePath(path);
        var spath: string[] = path.split(/\/+/);
        if (!spath[0] && spath.length > 1) {
            spath = spath.slice(1);
        }
        var name: string = spath.pop();
        if (name == '' && spath.length > 0) {
            name = spath.pop();
        }
        if (name) {
            spath.push(name);
        }
        if (spath.length == 0 && !name) {
            name = '.';
        }
        var inode: Inode = new Inode(ROOT_INODE);
        var dir: Dir = new Dir(inode);
        var parentDir: Dir = dir;
        var fullName: string = '';
        for (var i: number=0; i<spath.length; i++) {
            parentDir = dir;
            try {
                inode = dir.getInode(spath[i]);
                if (inode.content.type == InodeType.Symlink && (!dontResolveLastSymlink || i != spath.length -1)) { // symlink
                    var target: string = inode.content.symlink;
                    if (target[0] != '/') { // not an absolute name, compose the target path with the current path
                        target = fullName + '/' + target;
                    }
                    fullName = target;
                    var symlinkTarget: NamexResult = fs._namex(target);
                    inode = symlinkTarget.inode;
                } else { // regular dir or file
                    fullName += '/' + spath[i];
                }
                if (inode.content.type != InodeType.Dir) {
                    if (i != spath.length - 1) {
                        throw new Error(ENOENT);
                    }
                } else {
                    // _access(inode, S_IXUSR);
                    dir = new Dir(inode);
                }
            } catch (ex) {
                if (!(i == spath.length - 1 && ignoredNonExistingLast)) {
                    throw ex
                }
            }
        }
        return new NamexResult(inode, dir, parentDir, name);
    }

    function _access(inode: Inode, mode: number)
    {
        if (process.getuid() == 0) {
            if (mode == S_IXUSR && (inode.content.mode & (S_IXUSR | S_IXGRP | S_IXOTH)) == 0) {
                return false;
            }
            return true;
        }
        if (process.getuid() != inode.content.uid) {
            mode = mode >> 3;
            if (process.getgid() != inode.content.gid) {
                mode = mode >> 3;
            }
        }
        if ((inode.content.mode & mode) != 0) {
            return true;
        }
        throw new Error(EACCES);
    }

    /**
     * Synchronous mkdir(2)
     * @param {String} path - Path
     * @param {Number} mode - Mode (ignored)
     */
    export function mkdirSync(path: string, mode: number = MODE_777) {
        var params: NamexResult = fs._namex(path, true);
        params.parentDir.mkdir(params.name, mode);
    };

    /**
     * Asynchronous mkdir(2)
     * @param {String} path - Path
     * @param {Number} mode - Mode (ignored)
     * @param {Function} callback - Callback function
     */
    export function mkdir(path: string, mode: number, callback): void {
        fs._syncToAsync(fs.mkdirSync, [path, mode, callback], 1, false);
    }

    /**
     * Synchronous rmdir(2)
     * @param {String} path - Path
     */
    export function rmdirSync(path: string) {
        var params: NamexResult = fs._namex(path, false, true);
        params.parentDir.rmdir(params.name);
    };

    /**
     * Asynchronous rmdir(2)
     * @param {String} path - Path
     * @param {Function} callback - Callback function
     */
    export function rmdir(path: string, callback): void {
        fs._syncToAsync(fs.rmdirSync, [path, callback], null, false);
    }

    /**
     * Synchronous unlink(2)
     * @param {String} path - Path
     */
    export function unlinkSync(path: string) {
        var params: NamexResult = fs._namex(path, false, true);
        params.parentDir.unlink(params.name);
    }

    /**
     * Asynchronous unlink(2)
     * @param {String} path - Path
     * @param {Function} callback - Callback function
     */
    export function unlink(path: string, callback): void {
        fs._syncToAsync(fs.unlinkSync, [path, callback], null, false);
    }

    /**
     * Reads the contents of a directory.
     * Return an array of the names of the files in the directory excluding '.' and '..'.
     * @param {String} path - Path
     */
    export function readdirSync(path: string) {
        var params: NamexResult = fs._namex(path);
        return params.dir.readdir(true);
    }

    /**
     * Reads the contents of a directory.
     * Return an array of the names of the files in the directory excluding '.' and '..'.
     * @param {String} path - Path
     * @param {Function} callback - Callback function
     */
    export function readdir(path: string, callback): void {
        fs._syncToAsync(fs.readdirSync, [path, callback], null, true);
    }

    /**
     * Synchronous stat(2). Return a fs.Stats object.
     * @param {String} path - Path
     */
    export function statSync(path: string) {
        var params: NamexResult = fs._namex(path);
        return params.inode.stat();
    };

    /**
     * Asynchronous stat(2). Return a fs.Stats object.
     * @param {String} path - Path
     * @param {Function} callback - Callback function
     */
    export function stat(path: string, callback): void {
        fs._syncToAsync(fs.statSync, [path, callback], null, true);
    }

    /**
     * Synchronous lstat(2). Return a fs.Stats object.
     * lstat() is identical to stat(), except that if path is a symbolic link, then the link itself is stat-ed, not the file that it refers to.
     * @param {String} path - Path
     */
    export function lstatSync(path: string) {
        var params: NamexResult = fs._namex(path, false, true);
        return params.inode.stat();
    };

    /**
     * Asynchronous lstat(2). Return a fs.Stats object.
     * lstat() is identical to stat(), except that if path is a symbolic link, then the link itself is stat-ed, not the file that it refers to.
     * @param {String} path - Path
     * @param {Function} callback - Callback function
     */
    export function lstat(path: string, callback): void {
        fs._syncToAsync(fs.lstatSync, [path, callback], null, true);
    }

    /**
     * Synchronous fstat(2). Return a fs.Stats object.
     * @param {String} fd - File descriptor
     */
    export function fstatSync(fd: number) {
        var handler: FileHandler = _handlers.getHandler(fd);
        return handler.inode.stat();
    }

    /**
     * Asynchronous fstat(2). Return a fs.Stats object.
     * @param {String} fd - File descriptor
     * @param {Function} callback - Callback function
     */
    export function fstat(fd: number, callback): void {
        fs._syncToAsync(fs.fstatSync, [fd, callback], null, true);
    }

    /**
     * Writes data to a file, replacing the file if it already exists.
     * @param {String} filename - File name
     * @param {Buffer} data - Data (string or Buffer)
     * @param {Object} options - Option5ys
     *                 encoding - default = 'utf8'
     *                 mode - default = 0666
     *                 flag - default = 'w' (ignored)
     */
    export function writeFileSync(filename: string, data: any, options) {
        if (!options) {
            options = {};
        }
        if (!options.encoding) {
            options.encoding = 'utf8';
        }
        if (!options.mode) {
            options.mode = MODE_666;
        }
        if (!options.flag) {
            options.flag = 'w';
        }
        var wdata: string;
        if (Buffer.isBuffer(data)) {
            wdata = <string> data.toString(options.encoding);
        } else {
            wdata = <string> data;
        }
        var params: NamexResult = fs._namex(filename, true);
        try {
            var inode = params.parentDir.mknod(params.name, options.mode);
            inode.writeContent(wdata);
        } catch (ex) { // File already exist
            params = fs._namex(filename);
            params.inode.writeContent(wdata);
        }
    }

    /**
     * Asynchronously writes data to a file, replacing the file if it already exists.
     * @param {String} filename - File name
     * @param {Buffer} data - Data (string or Buffer)
     * @param {Object} options - Option5ys
     *                 encoding - default = 'utf8'
     *                 mode - default = 0666
     *                 flag - default = 'w' (ignored)
     * @param {Function} callback - Callback function
     */
    export function writeFile(filename: string, data: any, options, callback): void {
        fs._syncToAsync(fs.writeFileSync, [filename, data, options, callback], 2, false);
    }

    /**
     * Reads the entire contents of a file. Returns the contents of the filename.
     * @param {String} filename - File name
     * @param {Object} options - Option
     *                 encoding - default = 'utf8'
     *                 flag - default = 'r' (ignored)
     * @param {Object} options - Options (ignored)
     */
    export function readFileSync(filename: string, options) /*: Buffer*/ {
        if (!options) {
            options = {};
        }
        if (!options.encoding) {
            options.encoding = 'utf8';
        }
        if (!options.flag) {
            options.flag = 'r';
        }
        var params: NamexResult = fs._namex(filename);
        return new Buffer(params.inode.readContent(), options.encoding);
    }

    /**
     * Asynchronously reads the entire contents of a file. Returns the contents of the filename.
     * @param {String} filename - File name
     * @param {Object} options - Option
     *                 encoding - default = 'utf8'
     *                 flag - default = 'r' (ignored)
     * @param {Function} callback - Callback function
     */
    export function readFile(filename: string, options, callback): void {
        fs._syncToAsync(fs.readFileSync, [filename, options, callback], 1, true);
    }

    /**
     * Synchronous ftruncate(2)
     * @param {String} path - File name
     * @param {Number} len - file length
     */
    export function truncateSync(path: string, len: number): void {
        var params: NamexResult = fs._namex(path);
        var content = params.inode.readContent();
        content = content.substring(0, len || 0);
        params.inode.writeContent(content);
    }

    /**
     * Asynchronous ftruncate(2)
     * @param {String} path - File name
     * @param {Number} len - file length
     */
    export function truncate(path: string, len: number, callback): void {
        fs._syncToAsync(fs.truncateSync, [path, len, callback], 1, false);
    }

    /**
     * Synchronous link(2).
     * @param {String} srcpath - Source path
     * @param {String} dstpath - Destination path
     */
    export function linkSync(srcpath: string, dstpath: string): void {
        var srcParams: NamexResult = fs._namex(srcpath);
        var dstParams: NamexResult = fs._namex(dstpath, true);
        dstParams.parentDir.link(dstParams.name, srcParams.inode);
    }
    
    /**
     * Asynchronous link(2).
     * @param {String} srcpath - Source path
     * @param {String} dstpath - Destination path
     */
    export function link(srcpath: string, dstpath: string, callback): void {
        fs._syncToAsync(fs.linkSync, [srcpath, dstpath, callback], null, false);
    }

    /**
     * Synchronous symlink(2).
     * @param {String} srcpath - Source path
     * @param {String} dstpath - Destination path
     * @param {String} type - Ignored
     */
    export function symlinkSync(srcpath: string, dstpath: string, type = null): void {
        var dstParams: NamexResult = fs._namex(dstpath, true);
        dstParams.parentDir.symlink(dstParams.name, srcpath);
    }
    
    /**
     * Asynchronous symlink(2).
     * @param {String} srcpath - Source path
     * @param {String} dstpath - Destination path
     */
    export function symlink(srcpath: string, dstpath: string, type, callback): void {
        fs._syncToAsync(fs.symlinkSync, [srcpath, dstpath, type, callback], 2, false);
    }

    /**
     * Test whether or not the given path exists by checking with the file system. 
     * @param {String} path - Path
     */
    export function existsSync(path: string): boolean {
        try {
            fs._namex(path);
            return true;
        } catch (ex) {
            return false;
        }
    }

    /**
     * Test whether or not the given path exists by checking with the file system.
     * Then call the callback argument with either true or false.
     * @param {String} srcpath - Source path
     */
    export function exists(path: string, callback): void {
        fs._syncToAsync(fs.existsSync, [path, callback], null, true);
    }

    /**
     * TODO
     * Returns a new ReadStream object
     */
    /*
    export function createReadStream(path: string, options): ReadStream {
        return new ReadStream(path, options);
    };
    */

    /**
     * Synchronous chown(2).
     * @param {String} path - Path
     * @param {number} uid - User id
     * @param {number} gid - Group id
     */
    export function chownSync(path: string, uid: number, gid: number) {
        var params: NamexResult = fs._namex(path);
        params.inode.chown(uid, gid);
    }
    
    /**
     * Asynchronous chown(2).
     * @param {String} path - Path
     * @param {number} uid - User id
     * @param {number} gid - Group id
     */
    export function chown(path: string, uid: number, gid: number, callback) {
        fs._syncToAsync(fs.chownSync, [path, uid, gid, callback], null, false);
    }

    /**
     * Synchronous fchown(2).
     * @param {Number} fd - File descriptor
     * @param {number} uid - User id
     * @param {number} gid - Group id
     */
    export function fchownSync(fd: number, uid: number, gid: number) {
        var handler: FileHandler = _handlers.getHandler(fd);
        handler.inode.chown(uid, gid);
    }

    /**
     * Asynchronous fchown(2).
     * @param {Number} fd - File descriptor
     * @param {number} uid - User id
     * @param {number} gid - Group id
     */
    export function fchown(fd: number, uid: number, gid: number, callback) {
        fs._syncToAsync(fs.fchownSync, [fd, uid, gid, callback], null, false);
    }

    /**
     * Synchronous lchown(2).
     * @param {String} path - Path
     * @param {number} uid - User id
     * @param {number} gid - Group id
     */
    export function lchownSync(path: string, uid: number, gid: number) {
        var params: NamexResult = fs._namex(path, false, true);
        params.inode.chown(uid, gid);
    }
    
    /**
     * Synchronous lchown(2).
     * @param {String} path - Path
     * @param {number} uid - User id
     * @param {number} gid - Group id
     */
    export function lchown(path: string, uid: number, gid: number, callback) {
        fs._syncToAsync(fs.lchownSync, [path, uid, gid, callback], null, false);
    }

    /**
     * Synchronous chmod(2).
     * @param {String} path - Path
     * @param {number} mode - Mode
     */
    export function chmodSync(path: string, mode: number) {
        var params: NamexResult = fs._namex(path);
        params.inode.chmod(mode);
    }
    
    /**
     * Asynchronous chmod(2).
     * @param {String} path - Path
     * @param {number} mode - Mode
     */
    export function chmod(path: string, mode: number, callback) {
        fs._syncToAsync(fs.chmodSync, [path, mode, callback], null, false);
    }

    /**
     * Synchronous fchmod(2).
     * @param {Number} fd - File descriptor
     * @param {number} mode - Mode
     */
    export function fchmodSync(fd: number, mode: number) {
        var handler: FileHandler = _handlers.getHandler(fd);
        handler.inode.chmod(mode);
    }

    /**
     * Asynchronous fchmod(2).
     * @param {Number} fd - File descriptor
     * @param {number} mode - Mode
     */
    export function fchmod(fd: number, mode: number,  callback) {
        fs._syncToAsync(fs.fchmodSync, [fd, mode, callback], null, false);
    }

    /**
     * Synchronous lchmod(2).
     * @param {String} path - Path
     * @param {number} mode - Mode
     */
    export function lchmodSync(path: string, mode: number) {
        var params: NamexResult = fs._namex(path, false, true);
        params.inode.chmod(mode);
    }
    
    /**
     * Synchronous lchmod(2).
     * @param {String} path - Path
     * @param {number} mode - Mode
     */
    export function lchmod(path: string, mode: number, callback) {
        fs._syncToAsync(fs.lchmodSync, [path, mode, callback], null, false);
    }

    /** TODO */
    export function openSync(path: string, flags: any, mode: number): Number {
        var fflags: number = _stringToFlags(flags);
        if ((fflags & O_CREAT) != 0) {
            // TODO
            throw new Error('TODO');
        } else {
            var params: NamexResult = fs._namex(path);
            if (params.inode.content.type == InodeType.Dir && fflags != O_RDONLY) {
                throw new Error(EISDIR);
            }
        }
        var fd: FileHandler = _handlers.addHandler(params.inode, fflags);
        return fd.num;
    }

    /**
     * Change file timestamps of the file referenced by the supplied path.
     * @param {String} path - Path
     * @param {Date} atime - Access time
     * @param {Date} mtime - Modification time
     */
    export function utimesSync(path: string, atime: Date, mtime: Date) {
        var params: NamexResult = fs._namex(path);
        params.inode.utimes(atime, mtime);
    }
    
    /**
     * Change file timestamps of the file referenced by the supplied path.
     * @param {String} path - Path
     * @param {Date} atime - Access time
     * @param {Date} mtime - Modification time
     */
    export function utimes(path: string, atime: Date, mtime: Date, callback) {
        fs._syncToAsync(fs.utimesSync, [path, atime, mtime, callback], null, false);
    }

    /**
     * Change the file timestamps of a file referenced by the supplied file descriptor.
     * @param {Number} fd - File descriptor
     * @param {Date} atime - Access time
     * @param {Date} mtime - Modification time
     */
    export function futimesSync(fd: number, atime: Date, mtime: Date) {
        var handler: FileHandler = _handlers.getHandler(fd);
        handler.inode.utimes(atime, mtime);
    }
    
    /**
     * Change the file timestamps of a file referenced by the supplied file descriptor.
     * @param {Number} fd - File descriptor
     * @param {Date} atime - Access time
     * @param {Date} mtime - Modification time
     */
    export function futimes(fd: number, atime: Date, mtime: Date, callback) {
        fs._syncToAsync(fs.futimesSync, [fd, atime, mtime, callback], null, false);
    }

    /**
     * Synchronous fsync(2).
     * @param {Number} fd - File descriptor
     */
    export function fsyncSync(fd: number): void {
        _handlers.fsync(fd);
    }
    
    /**
     * Asynchronous fsync(2).
     * @param {Number} fd - File descriptor
     */
    export function fsync(fd: number, callback): void {
        fs._syncToAsync(fs.fsync, [fd, callback], null, false);
    }

    /**
     * Synchronous readlink(2). Returns the symbolic link's string value.
     * @param {String} path - Path
     */
    export function readlinkSync(path: string): string {
        var params: NamexResult = fs._namex(path, false, true);
        return params.inode.readlink(); 
    }

    /**
     * Asynchronous readlink(2).
     * @param {String} path - Path
     */
    export function readlink(path: string, callback): void {
        fs._syncToAsync(fs.readlinkSync, [path, callback], null, true);
    }

    /**
     * Synchronous realpath(2). Returns the resolved path.
     * @param {String} path - Path
     * @param {Object} cache - cache is an object literal of mapped paths that can be used to force a specific path resolution or avoid additional fs.stat calls for known real paths.
     */
    export function realpathSync(path: string, cache): string {
        // make p is absolute
        var p: string = fs._resolvePath(path);
        var nextPartRe = /(.*?)(?:[\/]+|$)/g; 
        var original: string = p;
        var seenLinks = {};
        var knownHard = {};
        // current character position in p
        var pos: number;
        // the partial path so far, including a trailing slash if any
        var current: string;
        // the partial path without a trailing slash (except when pointing at a root)
        var base: string;
        // the partial path scanned in the previous round, with slash
        var previous: string;

        if (cache === undefined || cache === null) {
            cache = {}
        }
        if (Object.prototype.hasOwnProperty.call(cache, p)) {
            return cache[p];
        }

        start();

        function start() {
            // Skip over roots
            var m = /^[\/]*/.exec(p);
            pos = m[0].length;
            current = m[0];
            base = m[0];
            previous = '';
        }

        // walk down the path, swapping out linked pathparts for their real values
        // NB: p.length changes.
        while (pos < p.length) {
            // find the next part
            nextPartRe.lastIndex = pos;
            var result = nextPartRe.exec(p);
            previous = current;
            current += result[0];
            base = previous + result[1];
            pos = nextPartRe.lastIndex;

            // continue if not a symlink
            if (knownHard[base] || (cache[base] === base)) {
                continue;
            }

            var resolvedLink: string;
            if (Object.prototype.hasOwnProperty.call(cache, base)) {
                // some known symbolic link.  no need to stat again.
                resolvedLink = cache[base];
            } else {
                var stat = fs.lstatSync(base);
                if (!stat.isSymbolicLink()) {
                    knownHard[base] = true;
                    cache[base] = base;
                    continue;
                }

                // read the link if it wasn't read before
                var linkTarget: string = null;
                var id = stat.dev.toString(32) + ':' + stat.ino.toString(32);
                if (seenLinks.hasOwnProperty(id)) {
                    linkTarget = seenLinks[id];
                }
                if (linkTarget === undefined || linkTarget === null) {
                    fs.statSync(base);
                    linkTarget = fs.readlinkSync(base);
                }
                if (linkTarget[0] == '/') { // absolute path
                    resolvedLink = fs._resolvePath(linkTarget);
                } else {
                    resolvedLink = fs._resolvePath(previous + '/' + linkTarget);
                }
                // track this, if given a cache.
                cache[base] = resolvedLink;
                seenLinks[id] = linkTarget;
            }

            // resolve the link, then start over
            var sl: string = p.slice(pos);
            if (sl[0] == '/') { // absolute path
                p = fs._resolvePath(sl);
            } else {
                p = fs._resolvePath(resolvedLink + '/' + sl);
            }
            start();
        }
        cache[original] = p;

        return p;
    };

    /**
     * Asynchronous realpath(2). Returns the resolved path.
     * @param {String} path - Path
     * @param {Object} cache - cache is an object literal of mapped paths that can be used to force a specific path resolution or avoid additional fs.stat calls for known real paths.
     */
    export function realpath(path: string, cache, callback): void {
        fs._syncToAsync(fs.realpathSync, [path, cache, callback], null, true);
    }

    /**
     * Read data from the file specified by fd.
     * @param {String} fd - File descriptor
     * @param {Buffer} buffer - the buffer that the data will be written to.
     * @param {number} offset - the offset in the buffer to start writing at.
     * @param {number} length - an integer specifying the number of bytes to read.
     * @param {number} position - an integer specifying where to begin reading from in the file.
     * If position is null, data will be read from the current file position.
     */
    export function readSync(fd: number, buffer, offset: number, length: number, position: number) {
        var handler: FileHandler = _handlers.getHandler(fd);
        if (!handler.readable) {
            throw new Error(EBADF);
        }
        if (position === undefined || position === null) {
            position = handler.offset;
        }
        var sourceStart:number = position;
        var sourceEnd = length ? sourceStart + length : null;
        if (sourceEnd > handler.data.length) {
            sourceEnd = handler.data.length;
        }
        var length: number = sourceEnd - sourceStart;
        if (length > buffer.length) {
            length = buffer.length;
            sourceEnd = sourceStart + length;
        }
        handler.offset = sourceEnd;
        handler.data.copy(buffer, offset || 0, sourceStart, sourceEnd);
        return length;
    }

    /**
     * Read data from the file specified by fd.
     * @param {String} fd - File descriptor
     * @param {Buffer} buffer - the buffer that the data will be written to.
     * @param {number} offset - the offset in the buffer to start writing at.
     * @param {number} length - an integer specifying the number of bytes to read.
     * @param {number} position - an integer specifying where to begin reading from in the file.
     * If position is null, data will be read from the current file position.
     * The callback is given the three arguments, (err, bytesRead, buffer).
     */
    export function read(fd: number, buffer, offset: number, length: number, position: number, callback) {
        // The callback is given the three arguments, (err, bytesRead, buffer).
        function prepareResultCallback(err, bytesRead: number) {
            callback(err, bytesRead, buffer);
        }
        fs._syncToAsync(fs.readSync, [fd, buffer, offset, length, position, prepareResultCallback], null, true);
    }

    export function mkfs() {
        localStorage.clear();
        var inode = new Inode();
        inode.inodeBlock = ROOT_INODE;
        inode.newInode(InodeType.Dir);
        var rootDir = new Dir(inode);
        rootDir.link('.', inode, true);
        rootDir.link('..', inode, true);
    }

    // access to process when using browserify standalone
    export function getProcess() {
        return process;
    }

}

module.exports = fs;

/*

   Class: fs.ReadStream#
   ReadStream is a Readable Stream.

var s = new stream.Readable();
s._read = function noop() {}; // redundant? see update below
s.push('your text here');
s.push(null);
*/

// --------------------------------------------------------
//  monkey-patch process

var _uid: number = 0;
var _gid: number = 0;
var _cwd: string = '/';

process.setuid = function(uid: number): void {
    _uid = uid;
};

process.getuid = function(): number {
    return _uid;
};

process.setgid = function(gid: number): void {
    _gid = gid;
};

process.getgid = function(): number {
    return _gid;
};

/**
 * Returns the current working directory of the process.
 */
process.cwd = function(): string {
    return _cwd;
};

/**
 * Changes the current working directory of the process or throws an exception if that fails.
 */
process.chdir = function(directory: string) {
    if (typeof directory != 'string') {
        throw new Error('Bad argument.');
    }
    directory = fs._resolvePath(directory);
    if (!fs.statSync(directory).isDirectory()) {
        throw new Error(ENOTDIR);
    }
    process.env['OLDPWD'] = process.env['PWD'];
    process.env['PWD'] = directory;
    _cwd = directory;
};

process.env['OLDPWD'] = process.env['PWD'] = '/';

// Check the fs
function init(): void {
    var inode: Inode = new Inode(ROOT_INODE);
    if (!inode.valid) {
        fs.mkfs();
        fs.mkdirSync('/tmp');
        fs.mkdirSync('/etc', MODE_755);
        fs.writeFileSync('/etc/passwd', 'root::0:0::/:\nnobody:*:65534:65534::/tmp:', { mode: MODE_644 });
        fs.writeFileSync('/etc/group', 'wheel:*:0:root\nnobody:*:65534:\nnogroup:*:65535:', { mode: MODE_644 });
    }
}

init();

