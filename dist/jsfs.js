!function(e){if("object"==typeof exports)module.exports=e();else if("function"==typeof define&&define.amd)define(e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.jsfs=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(_dereq_,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
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

var Buffer = _dereq_('buffer').Buffer;

var ENOENT = "No such file or directory";
var EEXIST = "File exists";
var ENOTDIR = "Not a directory";
var EISDIR = "Is a directory";
var ENOTEMPTY = "Directory not empty";
var ENOROOT = "Cannot delete root directory";
var ECOPYDIR = "Cannot copy directories";
var EINVALIDTYPE = "Invalid file type: valid types are 'json' and 'raw'";
var ENOINODE = 'Invalid inode';
var EACCES = 'Permission denied';
var EBADF = 'Bad file descriptor';
var EINVAL = 'Invalid argument';

var S_IXOTH = 1;
var S_IWOTH = 2;
var S_IROTH = 4;
var S_IXGRP = 8;
var S_IWGRP = 16;
var S_IRGRP = 32;
var S_IXUSR = 64;
var S_IWUSR = 128;
var S_IRUSR = 256;

var S_IFDIR = 16384;
var S_IFREG = 32768;
var S_IFLNK = 40960;

var O_RDONLY = 0;
var O_WRONLY = 1;
var O_RDWR = 2;
var O_APPEND = 8;
var O_CREAT = 512;
var O_EXCL = 2048;
var O_TRUNC = 1024;

var MODE_644 = 420;
var MODE_666 = 438;
var MODE_755 = 493;
var MODE_777 = 511;
var ALL_MODES = 4095;

var ROOT_INODE = 1;

var InodeType;
(function (InodeType) {
    InodeType[InodeType["Raw"] = 0] = "Raw";
    InodeType[InodeType["Dir"] = 1] = "Dir";
    InodeType[InodeType["Json"] = 2] = "Json";
    InodeType[InodeType["Symlink"] = 3] = "Symlink";
})(InodeType || (InodeType = {}));
;

// --------------------------------------------------------
var InodeContent = (function () {
    function InodeContent(dataBlock, type, mode, size, symlink) {
        if (typeof type === "undefined") { type = 2 /* Json */; }
        if (typeof mode === "undefined") { mode = MODE_777; }
        if (typeof size === "undefined") { size = 0; }
        if (typeof symlink === "undefined") { symlink = null; }
        var time = new Date();
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
    return InodeContent;
})();

// --------------------------------------------------------
var Inode = (function () {
    function Inode(inodeBlock) {
        if (typeof inodeBlock === "undefined") { inodeBlock = null; }
        if (inodeBlock != null) {
            this.inodeBlock = inodeBlock;
            this.read();
        } else {
            this.inodeBlock = this.getFreeBlock();
            this.valid = false;
        }
    }
    Inode.prototype.getFreeBlock = function () {
        var keys = [];
        for (var key in localStorage) {
            if (!isNaN(key)) {
                keys.push(Number(key));
            }
        }
        keys.sort();
        var num = 1;
        while (keys.indexOf(num) != -1) {
            num++;
        }
        localStorage.setItem(String(num), ''); // mark the block as reserved
        return num;
    };

    Inode.prototype.newInode = function (type, dataBlock, mode, symlink) {
        if (typeof dataBlock === "undefined") { dataBlock = null; }
        if (typeof mode === "undefined") { mode = MODE_777; }
        if (typeof symlink === "undefined") { symlink = null; }
        dataBlock = dataBlock || this.getFreeBlock();
        mode = (mode & MODE_777);
        if (type == 1 /* Dir */) {
            mode = mode | S_IFDIR;
        } else if (type == 3 /* Symlink */) {
            mode = mode | S_IFLNK;
        } else {
            mode = mode | S_IFREG;
        }
        var time = new Date();
        this.content = new InodeContent(dataBlock, type, mode, 0, symlink);
        this.valid = true;
    };

    /** Increment the inode references count */
    Inode.prototype.incCount = function () {
        this.content.iCount++;
        this.write();
    };

    /** Decrement the inode references count. Delete the inode if zero */
    Inode.prototype.decCount = function () {
        this.content.iCount--;
        this.write();
    };

    Inode.prototype.write = function (updateTime) {
        if (typeof updateTime === "undefined") { updateTime = true; }
        if (this.content.iCount > 0) {
            if (updateTime) {
                var time = new Date();
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
    };

    Inode.prototype.read = function () {
        this.content = fs._readBlock(this.inodeBlock);
        if (this.content) {
            this.valid = true;
        } else {
            this.valid = false;
        }
    };

    Inode.prototype.stat = function () {
        if (!this.valid) {
            this.read();
        }
        if (!this.valid) {
            throw new Error(ENOINODE);
        }
        return new fs.Stats(this);
    };

    Inode.prototype.writeContent = function (data) {
        if (!this.valid) {
            this.read();
        }
        if (!this.valid) {
            throw new Error(ENOINODE);
        }
        if (this.content.type == 1 /* Dir */) {
            throw new Error(EISDIR);
        }
        fs._writeBlock(this.content.dataBlock, data, 0 /* Raw */);

        // Write file size
        this.content.size = data && data.length || 0;
        this.write();
    };

    Inode.prototype.readContent = function () {
        if (!this.valid) {
            this.read();
        }
        if (!this.valid) {
            throw new Error(ENOINODE);
        }
        return fs._readBlock(this.content.dataBlock, 0 /* Raw */);
    };

    /**
    * Change ownership of a file
    */
    Inode.prototype.chown = function (uid, gid) {
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
    };

    /**
    * Change permissions of a file
    */
    Inode.prototype.chmod = function (mode) {
        if (!this.valid) {
            this.read();
        }
        this.content.mode = (this.content.mode & ~ALL_MODES) | (mode & ALL_MODES);
        this.write();
    };

    /**
    * Change file last access and modification times
    */
    Inode.prototype.utimes = function (atime, mtime) {
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
    };

    /**
    * Returns the symbolic link's string value.
    */
    Inode.prototype.readlink = function () {
        if (!this.valid) {
            this.read();
        }
        if (!(this.content.mode & S_IFLNK)) {
            throw new Error(EINVAL);
        }
        return this.content.symlink;
    };
    return Inode;
})();

// --------------------------------------------------------
var Dir = (function () {
    function Dir(inode) {
        this.inode = inode;
        this.dirBlock = inode.content.dataBlock;
        this.content = fs._readBlock(inode.content.dataBlock) || {};
    }
    Dir.prototype.link = function (name, inode, skipHardLinkCheck) {
        if (typeof skipHardLinkCheck === "undefined") { skipHardLinkCheck = false; }
        if (this.content[name]) {
            throw new Error(EEXIST);
        }
        if (!inode || !inode.valid) {
            throw new Error(ENOINODE);
        }
        if (inode.content.type == 1 /* Dir */ && !skipHardLinkCheck) {
            throw new Error(EISDIR);
        }
        this.content[name] = inode.inodeBlock;
        inode.incCount();
        this.write();
    };

    Dir.prototype.unlink = function (name) {
        if (!this.content[name]) {
            throw new Error(ENOENT);
        }
        if (name == '.' || name == '..') {
            throw new Error(name + ': "." and ".." may not be removed');
        }
        var inode = new Inode(this.content[name]);
        if (inode && inode.valid) {
            if (inode.content.type == 1 /* Dir */) {
                throw new Error(EISDIR);
            }
            inode.decCount();
        }
        delete this.content[name];
        this.write();
    };

    Dir.prototype.symlink = function (name, target) {
        if (this.content[name]) {
            throw new Error(EEXIST);
        }
        if (!target) {
            throw new Error(ENOENT);
        }
        var inode = new Inode();
        inode.newInode(3 /* Symlink */, null, MODE_755, target);
        this.content[name] = inode.inodeBlock;
        inode.incCount();
        this.write();
    };

    Dir.prototype.mkdir = function (name, mode) {
        if (typeof mode === "undefined") { mode = MODE_777; }
        if (this.content[name]) {
            throw new Error(EEXIST);
        }
        var inode = new Inode();
        inode.newInode(1 /* Dir */, null, mode);
        var dir = new Dir(inode);
        dir.link('.', inode, true);
        dir.link('..', this.inode, true);
        this.link(name, inode, true);
        return dir;
    };

    Dir.prototype.rmdir = function (name) {
        if (!this.content[name]) {
            throw new Error(ENOENT);
        }
        if (name == '.' || name == '..') {
            throw new Error(name + ': "." and ".." may not be removed');
        }
        var inode = new Inode(this.content[name]);
        if (inode && inode.valid) {
            if (inode.content.type != 1 /* Dir */) {
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
    };

    Dir.prototype.mknod = function (name, mode) {
        if (typeof mode === "undefined") { mode = MODE_666; }
        if (this.content[name]) {
            throw new Error(EEXIST);
        }
        var inode = new Inode();
        inode.newInode(0 /* Raw */, null, mode);
        this.link(name, inode);
        return inode;
    };

    Dir.prototype.readdir = function (excludeDot) {
        if (typeof excludeDot === "undefined") { excludeDot = false; }
        var files = [];
        for (var k in this.content) {
            if (!excludeDot || (k != '.' && k != '..')) {
                files.push(k);
            }
        }
        return files;
    };

    Dir.prototype.getInode = function (name) {
        if (!this.content[name]) {
            throw new Error(ENOENT);
        }
        var inode = new Inode(this.content[name]);
        if (!inode || !inode.valid) {
            throw new Error(ENOINODE);
        }
        return inode;
    };

    Dir.prototype.stat = function (name) {
        var inode = this.getInode(name);
        return inode.stat();
    };

    Dir.prototype.write = function () {
        fs._writeBlock(this.dirBlock, this.content);
    };
    return Dir;
})();

// --------------------------------------------------------
var FileHandler = (function () {
    function FileHandler(num, inode, mode) {
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
    FileHandler.prototype.fsync = function () {
        if (this.writable) {
            // TODO
        }
    };
    return FileHandler;
})();

var FileHandlers = (function () {
    function FileHandlers() {
        this.handlers = {};
    }
    FileHandlers.prototype.addHandler = function (inode, mode) {
        var keys = Object.keys(this.handlers).sort(function (a, b) {
            return Number(a) - Number(b);
        });
        var num = 0;
        while (num in keys) {
            num++;
        }
        var fd = new FileHandler(num, inode, mode);
        this.handlers[num] = fd;
        return fd;
    };

    FileHandlers.prototype.getHandler = function (num) {
        var result = this.handlers[num];
        if (!result) {
            throw new Error(EBADF);
        }
        return result;
    };

    FileHandlers.prototype.fsync = function (num) {
        this.getHandler(num).fsync();
    };
    return FileHandlers;
})();

// --------------------------------------------------------
var fs;
(function (fs) {
    fs._handlers = new FileHandlers();

    var Stats = (function () {
        function Stats(inode) {
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
        Stats.prototype.isDirectory = function () {
            return this._type == 1 /* Dir */;
        };

        Stats.prototype.isFile = function () {
            return this._type == 0 /* Raw */ || this._type == 2 /* Json */;
        };

        Stats.prototype.isSymbolicLink = function () {
            return this._type == 3 /* Symlink */;
        };

        Stats.prototype.isBlockDevice = function () {
            return false;
        };

        Stats.prototype.isCharacterDevice = function () {
            return false;
        };

        Stats.prototype.isFIFO = function () {
            return false;
        };

        Stats.prototype.isSocket = function () {
            return false;
        };
        return Stats;
    })();
    fs.Stats = Stats;

    var ReadStream = (function () {
        /* TODO
        options is an object with the following defaults:
        { flags: 'r',
        encoding: null,
        fd: null,
        mode: 0666,
        autoClose: true
        }
        */
        function ReadStream(path, options) {
        }
        return ReadStream;
    })();
    fs.ReadStream = ReadStream;

    function _stringToFlags(flag) {
        if (!isNaN(flag)) {
            return flag;
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
    fs._stringToFlags = _stringToFlags;

    function _readBlock(block, type) {
        if (typeof type === "undefined") { type = 2 /* Json */; }
        var content = localStorage.getItem(String(block));
        if (type == 2 /* Json */ && content) {
            content = JSON.parse(content);
        }
        return content;
    }
    fs._readBlock = _readBlock;

    function _writeBlock(block, content, type) {
        if (typeof type === "undefined") { type = 2 /* Json */; }
        if (type == 2 /* Json */) {
            content = JSON.stringify(content);
        }
        return localStorage.setItem(String(block), content);
    }
    fs._writeBlock = _writeBlock;

    function _removeBlock(block) {
        localStorage.removeItem(String(block));
    }
    fs._removeBlock = _removeBlock;

    function _syncToAsync(fn, args, optionalArgId, returnResult) {
        if (optionalArgId !== undefined && optionalArgId !== null) {
            if (args[optionalArgId + 1] == undefined) {
                args[optionalArgId + 1] = args[optionalArgId];
                args[optionalArgId] = undefined;
            }
        }
        var callback = args.pop();
        try  {
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
    fs._syncToAsync = _syncToAsync;

    /**
    * Resolves 'path' to an absolute path
    */
    function _resolvePath(path) {
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
    }
    fs._resolvePath = _resolvePath;
    ;

    var NamexResult = (function () {
        function NamexResult(inode, dir, parentDir, name) {
            this.inode = inode;
            this.dir = dir;
            this.parentDir = parentDir;
            this.name = name;
        }
        return NamexResult;
    })();
    fs.NamexResult = NamexResult;

    function _namex(path, ignoredNonExistingLast, dontResolveLastSymlink) {
        if (typeof ignoredNonExistingLast === "undefined") { ignoredNonExistingLast = false; }
        if (typeof dontResolveLastSymlink === "undefined") { dontResolveLastSymlink = false; }
        if (typeof path != 'string') {
            throw new TypeError('path must be a string');
        }
        path = fs._resolvePath(path);
        var spath = path.split(/\/+/);
        if (!spath[0] && spath.length > 1) {
            spath = spath.slice(1);
        }
        var name = spath.pop();
        if (name == '' && spath.length > 0) {
            name = spath.pop();
        }
        if (name) {
            spath.push(name);
        }
        if (spath.length == 0 && !name) {
            name = '.';
        }
        var inode = new Inode(ROOT_INODE);
        var dir = new Dir(inode);
        var parentDir = dir;
        var fullName = '';
        for (var i = 0; i < spath.length; i++) {
            parentDir = dir;
            try  {
                inode = dir.getInode(spath[i]);
                if (inode.content.type == 3 /* Symlink */ && (!dontResolveLastSymlink || i != spath.length - 1)) {
                    var target = inode.content.symlink;
                    if (target[0] != '/') {
                        target = fullName + '/' + target;
                    }
                    fullName = target;
                    var symlinkTarget = fs._namex(target);
                    inode = symlinkTarget.inode;
                } else {
                    fullName += '/' + spath[i];
                }
                if (inode.content.type != 1 /* Dir */) {
                    if (i != spath.length - 1) {
                        throw new Error(ENOENT);
                    }
                } else {
                    // _access(inode, S_IXUSR);
                    dir = new Dir(inode);
                }
            } catch (ex) {
                if (!(i == spath.length - 1 && ignoredNonExistingLast)) {
                    throw ex;
                }
            }
        }
        return new NamexResult(inode, dir, parentDir, name);
    }
    fs._namex = _namex;

    function _access(inode, mode) {
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
    function mkdirSync(path, mode) {
        if (typeof mode === "undefined") { mode = MODE_777; }
        var params = fs._namex(path, true);
        params.parentDir.mkdir(params.name, mode);
    }
    fs.mkdirSync = mkdirSync;
    ;

    /**
    * Asynchronous mkdir(2)
    * @param {String} path - Path
    * @param {Number} mode - Mode (ignored)
    * @param {Function} callback - Callback function
    */
    function mkdir(path, mode, callback) {
        fs._syncToAsync(fs.mkdirSync, [path, mode, callback], 1, false);
    }
    fs.mkdir = mkdir;

    /**
    * Synchronous rmdir(2)
    * @param {String} path - Path
    */
    function rmdirSync(path) {
        var params = fs._namex(path, false, true);
        params.parentDir.rmdir(params.name);
    }
    fs.rmdirSync = rmdirSync;
    ;

    /**
    * Asynchronous rmdir(2)
    * @param {String} path - Path
    * @param {Function} callback - Callback function
    */
    function rmdir(path, callback) {
        fs._syncToAsync(fs.rmdirSync, [path, callback], null, false);
    }
    fs.rmdir = rmdir;

    /**
    * Synchronous unlink(2)
    * @param {String} path - Path
    */
    function unlinkSync(path) {
        var params = fs._namex(path, false, true);
        params.parentDir.unlink(params.name);
    }
    fs.unlinkSync = unlinkSync;

    /**
    * Asynchronous unlink(2)
    * @param {String} path - Path
    * @param {Function} callback - Callback function
    */
    function unlink(path, callback) {
        fs._syncToAsync(fs.unlinkSync, [path, callback], null, false);
    }
    fs.unlink = unlink;

    /**
    * Reads the contents of a directory.
    * Return an array of the names of the files in the directory excluding '.' and '..'.
    * @param {String} path - Path
    */
    function readdirSync(path) {
        var params = fs._namex(path);
        return params.dir.readdir(true);
    }
    fs.readdirSync = readdirSync;

    /**
    * Reads the contents of a directory.
    * Return an array of the names of the files in the directory excluding '.' and '..'.
    * @param {String} path - Path
    * @param {Function} callback - Callback function
    */
    function readdir(path, callback) {
        fs._syncToAsync(fs.readdirSync, [path, callback], null, true);
    }
    fs.readdir = readdir;

    /**
    * Synchronous stat(2). Return a fs.Stats object.
    * @param {String} path - Path
    */
    function statSync(path) {
        var params = fs._namex(path);
        return params.inode.stat();
    }
    fs.statSync = statSync;
    ;

    /**
    * Asynchronous stat(2). Return a fs.Stats object.
    * @param {String} path - Path
    * @param {Function} callback - Callback function
    */
    function stat(path, callback) {
        fs._syncToAsync(fs.statSync, [path, callback], null, true);
    }
    fs.stat = stat;

    /**
    * Synchronous lstat(2). Return a fs.Stats object.
    * lstat() is identical to stat(), except that if path is a symbolic link, then the link itself is stat-ed, not the file that it refers to.
    * @param {String} path - Path
    */
    function lstatSync(path) {
        var params = fs._namex(path, false, true);
        return params.inode.stat();
    }
    fs.lstatSync = lstatSync;
    ;

    /**
    * Asynchronous lstat(2). Return a fs.Stats object.
    * lstat() is identical to stat(), except that if path is a symbolic link, then the link itself is stat-ed, not the file that it refers to.
    * @param {String} path - Path
    * @param {Function} callback - Callback function
    */
    function lstat(path, callback) {
        fs._syncToAsync(fs.lstatSync, [path, callback], null, true);
    }
    fs.lstat = lstat;

    /**
    * Synchronous fstat(2). Return a fs.Stats object.
    * @param {String} fd - File descriptor
    */
    function fstatSync(fd) {
        var handler = fs._handlers.getHandler(fd);
        return handler.inode.stat();
    }
    fs.fstatSync = fstatSync;

    /**
    * Asynchronous fstat(2). Return a fs.Stats object.
    * @param {String} fd - File descriptor
    * @param {Function} callback - Callback function
    */
    function fstat(fd, callback) {
        fs._syncToAsync(fs.fstatSync, [fd, callback], null, true);
    }
    fs.fstat = fstat;

    /**
    * Writes data to a file, replacing the file if it already exists.
    * @param {String} filename - File name
    * @param {Buffer} data - Data (string or Buffer)
    * @param {Object} options - Option5ys
    *                 encoding - default = 'utf8'
    *                 mode - default = 0666
    *                 flag - default = 'w' (ignored)
    */
    function writeFileSync(filename, data, options) {
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
        var wdata;
        if (Buffer.isBuffer(data)) {
            wdata = data.toString(options.encoding);
        } else {
            wdata = data;
        }
        var params = fs._namex(filename, true);
        try  {
            var inode = params.parentDir.mknod(params.name, options.mode);
            inode.writeContent(wdata);
        } catch (ex) {
            params = fs._namex(filename);
            params.inode.writeContent(wdata);
        }
    }
    fs.writeFileSync = writeFileSync;

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
    function writeFile(filename, data, options, callback) {
        fs._syncToAsync(fs.writeFileSync, [filename, data, options, callback], 2, false);
    }
    fs.writeFile = writeFile;

    /**
    * Reads the entire contents of a file. Returns the contents of the filename.
    * @param {String} filename - File name
    * @param {Object} options - Option
    *                 encoding - default = 'utf8'
    *                 flag - default = 'r' (ignored)
    * @param {Object} options - Options (ignored)
    */
    function readFileSync(filename, options) {
        if (!options) {
            options = {};
        }
        if (!options.encoding) {
            options.encoding = 'utf8';
        }
        if (!options.flag) {
            options.flag = 'r';
        }
        var params = fs._namex(filename);
        return new Buffer(params.inode.readContent(), options.encoding);
    }
    fs.readFileSync = readFileSync;

    /**
    * Asynchronously reads the entire contents of a file. Returns the contents of the filename.
    * @param {String} filename - File name
    * @param {Object} options - Option
    *                 encoding - default = 'utf8'
    *                 flag - default = 'r' (ignored)
    * @param {Function} callback - Callback function
    */
    function readFile(filename, options, callback) {
        fs._syncToAsync(fs.readFileSync, [filename, options, callback], 1, true);
    }
    fs.readFile = readFile;

    /**
    * Synchronous ftruncate(2)
    * @param {String} path - File name
    * @param {Number} len - file length
    */
    function truncateSync(path, len) {
        var params = fs._namex(path);
        var content = params.inode.readContent();
        content = content.substring(0, len || 0);
        params.inode.writeContent(content);
    }
    fs.truncateSync = truncateSync;

    /**
    * Asynchronous ftruncate(2)
    * @param {String} path - File name
    * @param {Number} len - file length
    */
    function truncate(path, len, callback) {
        fs._syncToAsync(fs.truncateSync, [path, len, callback], 1, false);
    }
    fs.truncate = truncate;

    /**
    * Synchronous link(2).
    * @param {String} srcpath - Source path
    * @param {String} dstpath - Destination path
    */
    function linkSync(srcpath, dstpath) {
        var srcParams = fs._namex(srcpath);
        var dstParams = fs._namex(dstpath, true);
        dstParams.parentDir.link(dstParams.name, srcParams.inode);
    }
    fs.linkSync = linkSync;

    /**
    * Asynchronous link(2).
    * @param {String} srcpath - Source path
    * @param {String} dstpath - Destination path
    */
    function link(srcpath, dstpath, callback) {
        fs._syncToAsync(fs.linkSync, [srcpath, dstpath, callback], null, false);
    }
    fs.link = link;

    /**
    * Synchronous symlink(2).
    * @param {String} srcpath - Source path
    * @param {String} dstpath - Destination path
    * @param {String} type - Ignored
    */
    function symlinkSync(srcpath, dstpath, type) {
        if (typeof type === "undefined") { type = null; }
        var dstParams = fs._namex(dstpath, true);
        dstParams.parentDir.symlink(dstParams.name, srcpath);
    }
    fs.symlinkSync = symlinkSync;

    /**
    * Asynchronous symlink(2).
    * @param {String} srcpath - Source path
    * @param {String} dstpath - Destination path
    */
    function symlink(srcpath, dstpath, type, callback) {
        fs._syncToAsync(fs.symlinkSync, [srcpath, dstpath, type, callback], 2, false);
    }
    fs.symlink = symlink;

    /**
    * Test whether or not the given path exists by checking with the file system.
    * @param {String} path - Path
    */
    function existsSync(path) {
        try  {
            fs._namex(path);
            return true;
        } catch (ex) {
            return false;
        }
    }
    fs.existsSync = existsSync;

    /**
    * Test whether or not the given path exists by checking with the file system.
    * Then call the callback argument with either true or false.
    * @param {String} srcpath - Source path
    */
    function exists(path, callback) {
        fs._syncToAsync(fs.existsSync, [path, callback], null, true);
    }
    fs.exists = exists;

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
    function chownSync(path, uid, gid) {
        var params = fs._namex(path);
        params.inode.chown(uid, gid);
    }
    fs.chownSync = chownSync;

    /**
    * Asynchronous chown(2).
    * @param {String} path - Path
    * @param {number} uid - User id
    * @param {number} gid - Group id
    */
    function chown(path, uid, gid, callback) {
        fs._syncToAsync(fs.chownSync, [path, uid, gid, callback], null, false);
    }
    fs.chown = chown;

    /**
    * Synchronous fchown(2).
    * @param {Number} fd - File descriptor
    * @param {number} uid - User id
    * @param {number} gid - Group id
    */
    function fchownSync(fd, uid, gid) {
        var handler = fs._handlers.getHandler(fd);
        handler.inode.chown(uid, gid);
    }
    fs.fchownSync = fchownSync;

    /**
    * Asynchronous fchown(2).
    * @param {Number} fd - File descriptor
    * @param {number} uid - User id
    * @param {number} gid - Group id
    */
    function fchown(fd, uid, gid, callback) {
        fs._syncToAsync(fs.fchownSync, [fd, uid, gid, callback], null, false);
    }
    fs.fchown = fchown;

    /**
    * Synchronous lchown(2).
    * @param {String} path - Path
    * @param {number} uid - User id
    * @param {number} gid - Group id
    */
    function lchownSync(path, uid, gid) {
        var params = fs._namex(path, false, true);
        params.inode.chown(uid, gid);
    }
    fs.lchownSync = lchownSync;

    /**
    * Synchronous lchown(2).
    * @param {String} path - Path
    * @param {number} uid - User id
    * @param {number} gid - Group id
    */
    function lchown(path, uid, gid, callback) {
        fs._syncToAsync(fs.lchownSync, [path, uid, gid, callback], null, false);
    }
    fs.lchown = lchown;

    /**
    * Synchronous chmod(2).
    * @param {String} path - Path
    * @param {number} mode - Mode
    */
    function chmodSync(path, mode) {
        var params = fs._namex(path);
        params.inode.chmod(mode);
    }
    fs.chmodSync = chmodSync;

    /**
    * Asynchronous chmod(2).
    * @param {String} path - Path
    * @param {number} mode - Mode
    */
    function chmod(path, mode, callback) {
        fs._syncToAsync(fs.chmodSync, [path, mode, callback], null, false);
    }
    fs.chmod = chmod;

    /**
    * Synchronous fchmod(2).
    * @param {Number} fd - File descriptor
    * @param {number} mode - Mode
    */
    function fchmodSync(fd, mode) {
        var handler = fs._handlers.getHandler(fd);
        handler.inode.chmod(mode);
    }
    fs.fchmodSync = fchmodSync;

    /**
    * Asynchronous fchmod(2).
    * @param {Number} fd - File descriptor
    * @param {number} mode - Mode
    */
    function fchmod(fd, mode, callback) {
        fs._syncToAsync(fs.fchmodSync, [fd, mode, callback], null, false);
    }
    fs.fchmod = fchmod;

    /**
    * Synchronous lchmod(2).
    * @param {String} path - Path
    * @param {number} mode - Mode
    */
    function lchmodSync(path, mode) {
        var params = fs._namex(path, false, true);
        params.inode.chmod(mode);
    }
    fs.lchmodSync = lchmodSync;

    /**
    * Synchronous lchmod(2).
    * @param {String} path - Path
    * @param {number} mode - Mode
    */
    function lchmod(path, mode, callback) {
        fs._syncToAsync(fs.lchmodSync, [path, mode, callback], null, false);
    }
    fs.lchmod = lchmod;

    /** TODO */
    function openSync(path, flags, mode) {
        var fflags = _stringToFlags(flags);
        if ((fflags & O_CREAT) != 0) {
            throw new Error('TODO');
        } else {
            var params = fs._namex(path);
            if (params.inode.content.type == 1 /* Dir */ && fflags != O_RDONLY) {
                throw new Error(EISDIR);
            }
        }
        var fd = fs._handlers.addHandler(params.inode, fflags);
        return fd.num;
    }
    fs.openSync = openSync;

    /**
    * Change file timestamps of the file referenced by the supplied path.
    * @param {String} path - Path
    * @param {Date} atime - Access time
    * @param {Date} mtime - Modification time
    */
    function utimesSync(path, atime, mtime) {
        var params = fs._namex(path);
        params.inode.utimes(atime, mtime);
    }
    fs.utimesSync = utimesSync;

    /**
    * Change file timestamps of the file referenced by the supplied path.
    * @param {String} path - Path
    * @param {Date} atime - Access time
    * @param {Date} mtime - Modification time
    */
    function utimes(path, atime, mtime, callback) {
        fs._syncToAsync(fs.utimesSync, [path, atime, mtime, callback], null, false);
    }
    fs.utimes = utimes;

    /**
    * Change the file timestamps of a file referenced by the supplied file descriptor.
    * @param {Number} fd - File descriptor
    * @param {Date} atime - Access time
    * @param {Date} mtime - Modification time
    */
    function futimesSync(fd, atime, mtime) {
        var handler = fs._handlers.getHandler(fd);
        handler.inode.utimes(atime, mtime);
    }
    fs.futimesSync = futimesSync;

    /**
    * Change the file timestamps of a file referenced by the supplied file descriptor.
    * @param {Number} fd - File descriptor
    * @param {Date} atime - Access time
    * @param {Date} mtime - Modification time
    */
    function futimes(fd, atime, mtime, callback) {
        fs._syncToAsync(fs.futimesSync, [fd, atime, mtime, callback], null, false);
    }
    fs.futimes = futimes;

    /**
    * Synchronous fsync(2).
    * @param {Number} fd - File descriptor
    */
    function fsyncSync(fd) {
        fs._handlers.fsync(fd);
    }
    fs.fsyncSync = fsyncSync;

    /**
    * Asynchronous fsync(2).
    * @param {Number} fd - File descriptor
    */
    function fsync(fd, callback) {
        fs._syncToAsync(fs.fsync, [fd, callback], null, false);
    }
    fs.fsync = fsync;

    /**
    * Synchronous readlink(2). Returns the symbolic link's string value.
    * @param {String} path - Path
    */
    function readlinkSync(path) {
        var params = fs._namex(path, false, true);
        return params.inode.readlink();
    }
    fs.readlinkSync = readlinkSync;

    /**
    * Asynchronous readlink(2).
    * @param {String} path - Path
    */
    function readlink(path, callback) {
        fs._syncToAsync(fs.readlinkSync, [path, callback], null, true);
    }
    fs.readlink = readlink;

    /**
    * Synchronous realpath(2). Returns the resolved path.
    * @param {String} path - Path
    * @param {Object} cache - cache is an object literal of mapped paths that can be used to force a specific path resolution or avoid additional fs.stat calls for known real paths.
    */
    function realpathSync(path, cache) {
        // make p is absolute
        var p = fs._resolvePath(path);
        var nextPartRe = /(.*?)(?:[\/]+|$)/g;
        var original = p;
        var seenLinks = {};
        var knownHard = {};

        // current character position in p
        var pos;

        // the partial path so far, including a trailing slash if any
        var current;

        // the partial path without a trailing slash (except when pointing at a root)
        var base;

        // the partial path scanned in the previous round, with slash
        var previous;

        if (cache === undefined || cache === null) {
            cache = {};
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

            var resolvedLink;
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
                var linkTarget = null;
                var id = stat.dev.toString(32) + ':' + stat.ino.toString(32);
                if (seenLinks.hasOwnProperty(id)) {
                    linkTarget = seenLinks[id];
                }
                if (linkTarget === undefined || linkTarget === null) {
                    fs.statSync(base);
                    linkTarget = fs.readlinkSync(base);
                }
                if (linkTarget[0] == '/') {
                    resolvedLink = fs._resolvePath(linkTarget);
                } else {
                    resolvedLink = fs._resolvePath(previous + '/' + linkTarget);
                }

                // track this, if given a cache.
                cache[base] = resolvedLink;
                seenLinks[id] = linkTarget;
            }

            // resolve the link, then start over
            var sl = p.slice(pos);
            if (sl[0] == '/') {
                p = fs._resolvePath(sl);
            } else {
                p = fs._resolvePath(resolvedLink + '/' + sl);
            }
            start();
        }
        cache[original] = p;

        return p;
    }
    fs.realpathSync = realpathSync;
    ;

    /**
    * Asynchronous realpath(2). Returns the resolved path.
    * @param {String} path - Path
    * @param {Object} cache - cache is an object literal of mapped paths that can be used to force a specific path resolution or avoid additional fs.stat calls for known real paths.
    */
    function realpath(path, cache, callback) {
        fs._syncToAsync(fs.realpathSync, [path, cache, callback], null, true);
    }
    fs.realpath = realpath;

    /**
    * Read data from the file specified by fd.
    * @param {String} fd - File descriptor
    * @param {Buffer} buffer - the buffer that the data will be written to.
    * @param {number} offset - the offset in the buffer to start writing at.
    * @param {number} length - an integer specifying the number of bytes to read.
    * @param {number} position - an integer specifying where to begin reading from in the file.
    * If position is null, data will be read from the current file position.
    */
    function readSync(fd, buffer, offset, length, position) {
        var handler = fs._handlers.getHandler(fd);
        if (!handler.readable) {
            throw new Error(EBADF);
        }
        if (position === undefined || position === null) {
            position = handler.offset;
        }
        var sourceStart = position;
        var sourceEnd = length ? sourceStart + length : null;
        if (sourceEnd > handler.data.length) {
            sourceEnd = handler.data.length;
        }
        var length = sourceEnd - sourceStart;
        if (length > buffer.length) {
            length = buffer.length;
            sourceEnd = sourceStart + length;
        }
        handler.offset = sourceEnd;
        handler.data.copy(buffer, offset || 0, sourceStart, sourceEnd);
        return length;
    }
    fs.readSync = readSync;

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
    function read(fd, buffer, offset, length, position, callback) {
        // The callback is given the three arguments, (err, bytesRead, buffer).
        function prepareResultCallback(err, bytesRead) {
            callback(err, bytesRead, buffer);
        }
        fs._syncToAsync(fs.readSync, [fd, buffer, offset, length, position, prepareResultCallback], null, true);
    }
    fs.read = read;

    function mkfs() {
        localStorage.clear();
        var inode = new Inode();
        inode.inodeBlock = ROOT_INODE;
        inode.newInode(1 /* Dir */);
        var rootDir = new Dir(inode);
        rootDir.link('.', inode, true);
        rootDir.link('..', inode, true);
    }
    fs.mkfs = mkfs;

    // access to process when using browserify standalone
    function getProcess() {
        return process;
    }
    fs.getProcess = getProcess;
})(fs || (fs = {}));

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
var _uid = 0;
var _gid = 0;
var _cwd = '/';

process.setuid = function (uid) {
    _uid = uid;
};

process.getuid = function () {
    return _uid;
};

process.setgid = function (gid) {
    _gid = gid;
};

process.getgid = function () {
    return _gid;
};

/**
* Returns the current working directory of the process.
*/
process.cwd = function () {
    return _cwd;
};

/**
* Changes the current working directory of the process or throws an exception if that fails.
*/
process.chdir = function (directory) {
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
function init() {
    var inode = new Inode(ROOT_INODE);
    if (!inode.valid) {
        fs.mkfs();
        fs.mkdirSync('/tmp');
        fs.mkdirSync('/etc', MODE_755);
        fs.writeFileSync('/etc/passwd', 'root::0:0::/:\nnobody:*:65534:65534::/tmp:', { mode: MODE_644 });
        fs.writeFileSync('/etc/group', 'wheel:*:0:root\nnobody:*:65534:\nnogroup:*:65535:', { mode: MODE_644 });
    }
}

init();

}).call(this,_dereq_("IrXUsu"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},_dereq_("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/fake_f3516cc7.js","/")
},{"IrXUsu":5,"buffer":2}],2:[function(_dereq_,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * @license  MIT
 */

var base64 = _dereq_('base64-js')
var ieee754 = _dereq_('ieee754')

exports.Buffer = Buffer
exports.SlowBuffer = Buffer
exports.INSPECT_MAX_BYTES = 50
Buffer.poolSize = 8192

/**
 * If `Buffer._useTypedArrays`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Use Object implementation (compatible down to IE6)
 */
Buffer._useTypedArrays = (function () {
  // Detect if browser supports Typed Arrays. Supported browsers are IE 10+, Firefox 4+,
  // Chrome 7+, Safari 5.1+, Opera 11.6+, iOS 4.2+. If the browser does not support adding
  // properties to `Uint8Array` instances, then that's the same as no `Uint8Array` support
  // because we need to be able to add all the node Buffer API methods. This is an issue
  // in Firefox 4-29. Now fixed: https://bugzilla.mozilla.org/show_bug.cgi?id=695438
  try {
    var buf = new ArrayBuffer(0)
    var arr = new Uint8Array(buf)
    arr.foo = function () { return 42 }
    return 42 === arr.foo() &&
        typeof arr.subarray === 'function' // Chrome 9-10 lack `subarray`
  } catch (e) {
    return false
  }
})()

/**
 * Class: Buffer
 * =============
 *
 * The Buffer constructor returns instances of `Uint8Array` that are augmented
 * with function properties for all the node `Buffer` API functions. We use
 * `Uint8Array` so that square bracket notation works as expected -- it returns
 * a single octet.
 *
 * By augmenting the instances, we can avoid modifying the `Uint8Array`
 * prototype.
 */
function Buffer (subject, encoding, noZero) {
  if (!(this instanceof Buffer))
    return new Buffer(subject, encoding, noZero)

  var type = typeof subject

  // Workaround: node's base64 implementation allows for non-padded strings
  // while base64-js does not.
  if (encoding === 'base64' && type === 'string') {
    subject = stringtrim(subject)
    while (subject.length % 4 !== 0) {
      subject = subject + '='
    }
  }

  // Find the length
  var length
  if (type === 'number')
    length = coerce(subject)
  else if (type === 'string')
    length = Buffer.byteLength(subject, encoding)
  else if (type === 'object')
    length = coerce(subject.length) // assume that object is array-like
  else
    throw new Error('First argument needs to be a number, array or string.')

  var buf
  if (Buffer._useTypedArrays) {
    // Preferred: Return an augmented `Uint8Array` instance for best performance
    buf = Buffer._augment(new Uint8Array(length))
  } else {
    // Fallback: Return THIS instance of Buffer (created by `new`)
    buf = this
    buf.length = length
    buf._isBuffer = true
  }

  var i
  if (Buffer._useTypedArrays && typeof subject.byteLength === 'number') {
    // Speed optimization -- use set if we're copying from a typed array
    buf._set(subject)
  } else if (isArrayish(subject)) {
    // Treat array-ish objects as a byte array
    for (i = 0; i < length; i++) {
      if (Buffer.isBuffer(subject))
        buf[i] = subject.readUInt8(i)
      else
        buf[i] = subject[i]
    }
  } else if (type === 'string') {
    buf.write(subject, 0, encoding)
  } else if (type === 'number' && !Buffer._useTypedArrays && !noZero) {
    for (i = 0; i < length; i++) {
      buf[i] = 0
    }
  }

  return buf
}

// STATIC METHODS
// ==============

Buffer.isEncoding = function (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'binary':
    case 'base64':
    case 'raw':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.isBuffer = function (b) {
  return !!(b !== null && b !== undefined && b._isBuffer)
}

Buffer.byteLength = function (str, encoding) {
  var ret
  str = str + ''
  switch (encoding || 'utf8') {
    case 'hex':
      ret = str.length / 2
      break
    case 'utf8':
    case 'utf-8':
      ret = utf8ToBytes(str).length
      break
    case 'ascii':
    case 'binary':
    case 'raw':
      ret = str.length
      break
    case 'base64':
      ret = base64ToBytes(str).length
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = str.length * 2
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.concat = function (list, totalLength) {
  assert(isArray(list), 'Usage: Buffer.concat(list, [totalLength])\n' +
      'list should be an Array.')

  if (list.length === 0) {
    return new Buffer(0)
  } else if (list.length === 1) {
    return list[0]
  }

  var i
  if (typeof totalLength !== 'number') {
    totalLength = 0
    for (i = 0; i < list.length; i++) {
      totalLength += list[i].length
    }
  }

  var buf = new Buffer(totalLength)
  var pos = 0
  for (i = 0; i < list.length; i++) {
    var item = list[i]
    item.copy(buf, pos)
    pos += item.length
  }
  return buf
}

// BUFFER INSTANCE METHODS
// =======================

function _hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  // must be an even number of digits
  var strLen = string.length
  assert(strLen % 2 === 0, 'Invalid hex string')

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; i++) {
    var byte = parseInt(string.substr(i * 2, 2), 16)
    assert(!isNaN(byte), 'Invalid hex string')
    buf[offset + i] = byte
  }
  Buffer._charsWritten = i * 2
  return i
}

function _utf8Write (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(utf8ToBytes(string), buf, offset, length)
  return charsWritten
}

function _asciiWrite (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(asciiToBytes(string), buf, offset, length)
  return charsWritten
}

function _binaryWrite (buf, string, offset, length) {
  return _asciiWrite(buf, string, offset, length)
}

function _base64Write (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(base64ToBytes(string), buf, offset, length)
  return charsWritten
}

function _utf16leWrite (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(utf16leToBytes(string), buf, offset, length)
  return charsWritten
}

Buffer.prototype.write = function (string, offset, length, encoding) {
  // Support both (string, offset, length, encoding)
  // and the legacy (string, encoding, offset, length)
  if (isFinite(offset)) {
    if (!isFinite(length)) {
      encoding = length
      length = undefined
    }
  } else {  // legacy
    var swap = encoding
    encoding = offset
    offset = length
    length = swap
  }

  offset = Number(offset) || 0
  var remaining = this.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }
  encoding = String(encoding || 'utf8').toLowerCase()

  var ret
  switch (encoding) {
    case 'hex':
      ret = _hexWrite(this, string, offset, length)
      break
    case 'utf8':
    case 'utf-8':
      ret = _utf8Write(this, string, offset, length)
      break
    case 'ascii':
      ret = _asciiWrite(this, string, offset, length)
      break
    case 'binary':
      ret = _binaryWrite(this, string, offset, length)
      break
    case 'base64':
      ret = _base64Write(this, string, offset, length)
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = _utf16leWrite(this, string, offset, length)
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.prototype.toString = function (encoding, start, end) {
  var self = this

  encoding = String(encoding || 'utf8').toLowerCase()
  start = Number(start) || 0
  end = (end !== undefined)
    ? Number(end)
    : end = self.length

  // Fastpath empty strings
  if (end === start)
    return ''

  var ret
  switch (encoding) {
    case 'hex':
      ret = _hexSlice(self, start, end)
      break
    case 'utf8':
    case 'utf-8':
      ret = _utf8Slice(self, start, end)
      break
    case 'ascii':
      ret = _asciiSlice(self, start, end)
      break
    case 'binary':
      ret = _binarySlice(self, start, end)
      break
    case 'base64':
      ret = _base64Slice(self, start, end)
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = _utf16leSlice(self, start, end)
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.prototype.toJSON = function () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function (target, target_start, start, end) {
  var source = this

  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (!target_start) target_start = 0

  // Copy 0 bytes; we're done
  if (end === start) return
  if (target.length === 0 || source.length === 0) return

  // Fatal error conditions
  assert(end >= start, 'sourceEnd < sourceStart')
  assert(target_start >= 0 && target_start < target.length,
      'targetStart out of bounds')
  assert(start >= 0 && start < source.length, 'sourceStart out of bounds')
  assert(end >= 0 && end <= source.length, 'sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length)
    end = this.length
  if (target.length - target_start < end - start)
    end = target.length - target_start + start

  var len = end - start

  if (len < 100 || !Buffer._useTypedArrays) {
    for (var i = 0; i < len; i++)
      target[i + target_start] = this[i + start]
  } else {
    target._set(this.subarray(start, start + len), target_start)
  }
}

function _base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function _utf8Slice (buf, start, end) {
  var res = ''
  var tmp = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    if (buf[i] <= 0x7F) {
      res += decodeUtf8Char(tmp) + String.fromCharCode(buf[i])
      tmp = ''
    } else {
      tmp += '%' + buf[i].toString(16)
    }
  }

  return res + decodeUtf8Char(tmp)
}

function _asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++)
    ret += String.fromCharCode(buf[i])
  return ret
}

function _binarySlice (buf, start, end) {
  return _asciiSlice(buf, start, end)
}

function _hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; i++) {
    out += toHex(buf[i])
  }
  return out
}

function _utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + bytes[i+1] * 256)
  }
  return res
}

Buffer.prototype.slice = function (start, end) {
  var len = this.length
  start = clamp(start, len, 0)
  end = clamp(end, len, len)

  if (Buffer._useTypedArrays) {
    return Buffer._augment(this.subarray(start, end))
  } else {
    var sliceLen = end - start
    var newBuf = new Buffer(sliceLen, undefined, true)
    for (var i = 0; i < sliceLen; i++) {
      newBuf[i] = this[i + start]
    }
    return newBuf
  }
}

// `get` will be removed in Node 0.13+
Buffer.prototype.get = function (offset) {
  console.log('.get() is deprecated. Access using array indexes instead.')
  return this.readUInt8(offset)
}

// `set` will be removed in Node 0.13+
Buffer.prototype.set = function (v, offset) {
  console.log('.set() is deprecated. Access using array indexes instead.')
  return this.writeUInt8(v, offset)
}

Buffer.prototype.readUInt8 = function (offset, noAssert) {
  if (!noAssert) {
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'Trying to read beyond buffer length')
  }

  if (offset >= this.length)
    return

  return this[offset]
}

function _readUInt16 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val
  if (littleEndian) {
    val = buf[offset]
    if (offset + 1 < len)
      val |= buf[offset + 1] << 8
  } else {
    val = buf[offset] << 8
    if (offset + 1 < len)
      val |= buf[offset + 1]
  }
  return val
}

Buffer.prototype.readUInt16LE = function (offset, noAssert) {
  return _readUInt16(this, offset, true, noAssert)
}

Buffer.prototype.readUInt16BE = function (offset, noAssert) {
  return _readUInt16(this, offset, false, noAssert)
}

function _readUInt32 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val
  if (littleEndian) {
    if (offset + 2 < len)
      val = buf[offset + 2] << 16
    if (offset + 1 < len)
      val |= buf[offset + 1] << 8
    val |= buf[offset]
    if (offset + 3 < len)
      val = val + (buf[offset + 3] << 24 >>> 0)
  } else {
    if (offset + 1 < len)
      val = buf[offset + 1] << 16
    if (offset + 2 < len)
      val |= buf[offset + 2] << 8
    if (offset + 3 < len)
      val |= buf[offset + 3]
    val = val + (buf[offset] << 24 >>> 0)
  }
  return val
}

Buffer.prototype.readUInt32LE = function (offset, noAssert) {
  return _readUInt32(this, offset, true, noAssert)
}

Buffer.prototype.readUInt32BE = function (offset, noAssert) {
  return _readUInt32(this, offset, false, noAssert)
}

Buffer.prototype.readInt8 = function (offset, noAssert) {
  if (!noAssert) {
    assert(offset !== undefined && offset !== null,
        'missing offset')
    assert(offset < this.length, 'Trying to read beyond buffer length')
  }

  if (offset >= this.length)
    return

  var neg = this[offset] & 0x80
  if (neg)
    return (0xff - this[offset] + 1) * -1
  else
    return this[offset]
}

function _readInt16 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val = _readUInt16(buf, offset, littleEndian, true)
  var neg = val & 0x8000
  if (neg)
    return (0xffff - val + 1) * -1
  else
    return val
}

Buffer.prototype.readInt16LE = function (offset, noAssert) {
  return _readInt16(this, offset, true, noAssert)
}

Buffer.prototype.readInt16BE = function (offset, noAssert) {
  return _readInt16(this, offset, false, noAssert)
}

function _readInt32 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val = _readUInt32(buf, offset, littleEndian, true)
  var neg = val & 0x80000000
  if (neg)
    return (0xffffffff - val + 1) * -1
  else
    return val
}

Buffer.prototype.readInt32LE = function (offset, noAssert) {
  return _readInt32(this, offset, true, noAssert)
}

Buffer.prototype.readInt32BE = function (offset, noAssert) {
  return _readInt32(this, offset, false, noAssert)
}

function _readFloat (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  return ieee754.read(buf, offset, littleEndian, 23, 4)
}

Buffer.prototype.readFloatLE = function (offset, noAssert) {
  return _readFloat(this, offset, true, noAssert)
}

Buffer.prototype.readFloatBE = function (offset, noAssert) {
  return _readFloat(this, offset, false, noAssert)
}

function _readDouble (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset + 7 < buf.length, 'Trying to read beyond buffer length')
  }

  return ieee754.read(buf, offset, littleEndian, 52, 8)
}

Buffer.prototype.readDoubleLE = function (offset, noAssert) {
  return _readDouble(this, offset, true, noAssert)
}

Buffer.prototype.readDoubleBE = function (offset, noAssert) {
  return _readDouble(this, offset, false, noAssert)
}

Buffer.prototype.writeUInt8 = function (value, offset, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'trying to write beyond buffer length')
    verifuint(value, 0xff)
  }

  if (offset >= this.length) return

  this[offset] = value
}

function _writeUInt16 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'trying to write beyond buffer length')
    verifuint(value, 0xffff)
  }

  var len = buf.length
  if (offset >= len)
    return

  for (var i = 0, j = Math.min(len - offset, 2); i < j; i++) {
    buf[offset + i] =
        (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
            (littleEndian ? i : 1 - i) * 8
  }
}

Buffer.prototype.writeUInt16LE = function (value, offset, noAssert) {
  _writeUInt16(this, value, offset, true, noAssert)
}

Buffer.prototype.writeUInt16BE = function (value, offset, noAssert) {
  _writeUInt16(this, value, offset, false, noAssert)
}

function _writeUInt32 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'trying to write beyond buffer length')
    verifuint(value, 0xffffffff)
  }

  var len = buf.length
  if (offset >= len)
    return

  for (var i = 0, j = Math.min(len - offset, 4); i < j; i++) {
    buf[offset + i] =
        (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff
  }
}

Buffer.prototype.writeUInt32LE = function (value, offset, noAssert) {
  _writeUInt32(this, value, offset, true, noAssert)
}

Buffer.prototype.writeUInt32BE = function (value, offset, noAssert) {
  _writeUInt32(this, value, offset, false, noAssert)
}

Buffer.prototype.writeInt8 = function (value, offset, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7f, -0x80)
  }

  if (offset >= this.length)
    return

  if (value >= 0)
    this.writeUInt8(value, offset, noAssert)
  else
    this.writeUInt8(0xff + value + 1, offset, noAssert)
}

function _writeInt16 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7fff, -0x8000)
  }

  var len = buf.length
  if (offset >= len)
    return

  if (value >= 0)
    _writeUInt16(buf, value, offset, littleEndian, noAssert)
  else
    _writeUInt16(buf, 0xffff + value + 1, offset, littleEndian, noAssert)
}

Buffer.prototype.writeInt16LE = function (value, offset, noAssert) {
  _writeInt16(this, value, offset, true, noAssert)
}

Buffer.prototype.writeInt16BE = function (value, offset, noAssert) {
  _writeInt16(this, value, offset, false, noAssert)
}

function _writeInt32 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7fffffff, -0x80000000)
  }

  var len = buf.length
  if (offset >= len)
    return

  if (value >= 0)
    _writeUInt32(buf, value, offset, littleEndian, noAssert)
  else
    _writeUInt32(buf, 0xffffffff + value + 1, offset, littleEndian, noAssert)
}

Buffer.prototype.writeInt32LE = function (value, offset, noAssert) {
  _writeInt32(this, value, offset, true, noAssert)
}

Buffer.prototype.writeInt32BE = function (value, offset, noAssert) {
  _writeInt32(this, value, offset, false, noAssert)
}

function _writeFloat (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to write beyond buffer length')
    verifIEEE754(value, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }

  var len = buf.length
  if (offset >= len)
    return

  ieee754.write(buf, value, offset, littleEndian, 23, 4)
}

Buffer.prototype.writeFloatLE = function (value, offset, noAssert) {
  _writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function (value, offset, noAssert) {
  _writeFloat(this, value, offset, false, noAssert)
}

function _writeDouble (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 7 < buf.length,
        'Trying to write beyond buffer length')
    verifIEEE754(value, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }

  var len = buf.length
  if (offset >= len)
    return

  ieee754.write(buf, value, offset, littleEndian, 52, 8)
}

Buffer.prototype.writeDoubleLE = function (value, offset, noAssert) {
  _writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function (value, offset, noAssert) {
  _writeDouble(this, value, offset, false, noAssert)
}

// fill(value, start=0, end=buffer.length)
Buffer.prototype.fill = function (value, start, end) {
  if (!value) value = 0
  if (!start) start = 0
  if (!end) end = this.length

  if (typeof value === 'string') {
    value = value.charCodeAt(0)
  }

  assert(typeof value === 'number' && !isNaN(value), 'value is not a number')
  assert(end >= start, 'end < start')

  // Fill 0 bytes; we're done
  if (end === start) return
  if (this.length === 0) return

  assert(start >= 0 && start < this.length, 'start out of bounds')
  assert(end >= 0 && end <= this.length, 'end out of bounds')

  for (var i = start; i < end; i++) {
    this[i] = value
  }
}

Buffer.prototype.inspect = function () {
  var out = []
  var len = this.length
  for (var i = 0; i < len; i++) {
    out[i] = toHex(this[i])
    if (i === exports.INSPECT_MAX_BYTES) {
      out[i + 1] = '...'
      break
    }
  }
  return '<Buffer ' + out.join(' ') + '>'
}

/**
 * Creates a new `ArrayBuffer` with the *copied* memory of the buffer instance.
 * Added in Node 0.12. Only available in browsers that support ArrayBuffer.
 */
Buffer.prototype.toArrayBuffer = function () {
  if (typeof Uint8Array !== 'undefined') {
    if (Buffer._useTypedArrays) {
      return (new Buffer(this)).buffer
    } else {
      var buf = new Uint8Array(this.length)
      for (var i = 0, len = buf.length; i < len; i += 1)
        buf[i] = this[i]
      return buf.buffer
    }
  } else {
    throw new Error('Buffer.toArrayBuffer not supported in this browser')
  }
}

// HELPER FUNCTIONS
// ================

function stringtrim (str) {
  if (str.trim) return str.trim()
  return str.replace(/^\s+|\s+$/g, '')
}

var BP = Buffer.prototype

/**
 * Augment a Uint8Array *instance* (not the Uint8Array class!) with Buffer methods
 */
Buffer._augment = function (arr) {
  arr._isBuffer = true

  // save reference to original Uint8Array get/set methods before overwriting
  arr._get = arr.get
  arr._set = arr.set

  // deprecated, will be removed in node 0.13+
  arr.get = BP.get
  arr.set = BP.set

  arr.write = BP.write
  arr.toString = BP.toString
  arr.toLocaleString = BP.toString
  arr.toJSON = BP.toJSON
  arr.copy = BP.copy
  arr.slice = BP.slice
  arr.readUInt8 = BP.readUInt8
  arr.readUInt16LE = BP.readUInt16LE
  arr.readUInt16BE = BP.readUInt16BE
  arr.readUInt32LE = BP.readUInt32LE
  arr.readUInt32BE = BP.readUInt32BE
  arr.readInt8 = BP.readInt8
  arr.readInt16LE = BP.readInt16LE
  arr.readInt16BE = BP.readInt16BE
  arr.readInt32LE = BP.readInt32LE
  arr.readInt32BE = BP.readInt32BE
  arr.readFloatLE = BP.readFloatLE
  arr.readFloatBE = BP.readFloatBE
  arr.readDoubleLE = BP.readDoubleLE
  arr.readDoubleBE = BP.readDoubleBE
  arr.writeUInt8 = BP.writeUInt8
  arr.writeUInt16LE = BP.writeUInt16LE
  arr.writeUInt16BE = BP.writeUInt16BE
  arr.writeUInt32LE = BP.writeUInt32LE
  arr.writeUInt32BE = BP.writeUInt32BE
  arr.writeInt8 = BP.writeInt8
  arr.writeInt16LE = BP.writeInt16LE
  arr.writeInt16BE = BP.writeInt16BE
  arr.writeInt32LE = BP.writeInt32LE
  arr.writeInt32BE = BP.writeInt32BE
  arr.writeFloatLE = BP.writeFloatLE
  arr.writeFloatBE = BP.writeFloatBE
  arr.writeDoubleLE = BP.writeDoubleLE
  arr.writeDoubleBE = BP.writeDoubleBE
  arr.fill = BP.fill
  arr.inspect = BP.inspect
  arr.toArrayBuffer = BP.toArrayBuffer

  return arr
}

// slice(start, end)
function clamp (index, len, defaultValue) {
  if (typeof index !== 'number') return defaultValue
  index = ~~index;  // Coerce to integer.
  if (index >= len) return len
  if (index >= 0) return index
  index += len
  if (index >= 0) return index
  return 0
}

function coerce (length) {
  // Coerce length to a number (possibly NaN), round up
  // in case it's fractional (e.g. 123.456) then do a
  // double negate to coerce a NaN to 0. Easy, right?
  length = ~~Math.ceil(+length)
  return length < 0 ? 0 : length
}

function isArray (subject) {
  return (Array.isArray || function (subject) {
    return Object.prototype.toString.call(subject) === '[object Array]'
  })(subject)
}

function isArrayish (subject) {
  return isArray(subject) || Buffer.isBuffer(subject) ||
      subject && typeof subject === 'object' &&
      typeof subject.length === 'number'
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    var b = str.charCodeAt(i)
    if (b <= 0x7F)
      byteArray.push(str.charCodeAt(i))
    else {
      var start = i
      if (b >= 0xD800 && b <= 0xDFFF) i++
      var h = encodeURIComponent(str.slice(start, i+1)).substr(1).split('%')
      for (var j = 0; j < h.length; j++)
        byteArray.push(parseInt(h[j], 16))
    }
  }
  return byteArray
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(str)
}

function blitBuffer (src, dst, offset, length) {
  var pos
  for (var i = 0; i < length; i++) {
    if ((i + offset >= dst.length) || (i >= src.length))
      break
    dst[i + offset] = src[i]
  }
  return i
}

function decodeUtf8Char (str) {
  try {
    return decodeURIComponent(str)
  } catch (err) {
    return String.fromCharCode(0xFFFD) // UTF 8 invalid char
  }
}

/*
 * We have to make sure that the value is a valid integer. This means that it
 * is non-negative. It has no fractional component and that it does not
 * exceed the maximum allowed value.
 */
function verifuint (value, max) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value >= 0, 'specified a negative value for writing an unsigned value')
  assert(value <= max, 'value is larger than maximum value for type')
  assert(Math.floor(value) === value, 'value has a fractional component')
}

function verifsint (value, max, min) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value <= max, 'value larger than maximum allowed value')
  assert(value >= min, 'value smaller than minimum allowed value')
  assert(Math.floor(value) === value, 'value has a fractional component')
}

function verifIEEE754 (value, max, min) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value <= max, 'value larger than maximum allowed value')
  assert(value >= min, 'value smaller than minimum allowed value')
}

function assert (test, message) {
  if (!test) throw new Error(message || 'Failed assertion')
}

}).call(this,_dereq_("IrXUsu"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},_dereq_("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/node_modules/gulp-browserify/node_modules/browserify/node_modules/buffer/index.js","/node_modules/gulp-browserify/node_modules/browserify/node_modules/buffer")
},{"IrXUsu":5,"base64-js":3,"buffer":2,"ieee754":4}],3:[function(_dereq_,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

;(function (exports) {
	'use strict';

  var Arr = (typeof Uint8Array !== 'undefined')
    ? Uint8Array
    : Array

	var PLUS   = '+'.charCodeAt(0)
	var SLASH  = '/'.charCodeAt(0)
	var NUMBER = '0'.charCodeAt(0)
	var LOWER  = 'a'.charCodeAt(0)
	var UPPER  = 'A'.charCodeAt(0)

	function decode (elt) {
		var code = elt.charCodeAt(0)
		if (code === PLUS)
			return 62 // '+'
		if (code === SLASH)
			return 63 // '/'
		if (code < NUMBER)
			return -1 //no match
		if (code < NUMBER + 10)
			return code - NUMBER + 26 + 26
		if (code < UPPER + 26)
			return code - UPPER
		if (code < LOWER + 26)
			return code - LOWER + 26
	}

	function b64ToByteArray (b64) {
		var i, j, l, tmp, placeHolders, arr

		if (b64.length % 4 > 0) {
			throw new Error('Invalid string. Length must be a multiple of 4')
		}

		// the number of equal signs (place holders)
		// if there are two placeholders, than the two characters before it
		// represent one byte
		// if there is only one, then the three characters before it represent 2 bytes
		// this is just a cheap hack to not do indexOf twice
		var len = b64.length
		placeHolders = '=' === b64.charAt(len - 2) ? 2 : '=' === b64.charAt(len - 1) ? 1 : 0

		// base64 is 4/3 + up to two characters of the original data
		arr = new Arr(b64.length * 3 / 4 - placeHolders)

		// if there are placeholders, only get up to the last complete 4 chars
		l = placeHolders > 0 ? b64.length - 4 : b64.length

		var L = 0

		function push (v) {
			arr[L++] = v
		}

		for (i = 0, j = 0; i < l; i += 4, j += 3) {
			tmp = (decode(b64.charAt(i)) << 18) | (decode(b64.charAt(i + 1)) << 12) | (decode(b64.charAt(i + 2)) << 6) | decode(b64.charAt(i + 3))
			push((tmp & 0xFF0000) >> 16)
			push((tmp & 0xFF00) >> 8)
			push(tmp & 0xFF)
		}

		if (placeHolders === 2) {
			tmp = (decode(b64.charAt(i)) << 2) | (decode(b64.charAt(i + 1)) >> 4)
			push(tmp & 0xFF)
		} else if (placeHolders === 1) {
			tmp = (decode(b64.charAt(i)) << 10) | (decode(b64.charAt(i + 1)) << 4) | (decode(b64.charAt(i + 2)) >> 2)
			push((tmp >> 8) & 0xFF)
			push(tmp & 0xFF)
		}

		return arr
	}

	function uint8ToBase64 (uint8) {
		var i,
			extraBytes = uint8.length % 3, // if we have 1 byte left, pad 2 bytes
			output = "",
			temp, length

		function encode (num) {
			return lookup.charAt(num)
		}

		function tripletToBase64 (num) {
			return encode(num >> 18 & 0x3F) + encode(num >> 12 & 0x3F) + encode(num >> 6 & 0x3F) + encode(num & 0x3F)
		}

		// go through the array every three bytes, we'll deal with trailing stuff later
		for (i = 0, length = uint8.length - extraBytes; i < length; i += 3) {
			temp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2])
			output += tripletToBase64(temp)
		}

		// pad the end with zeros, but make sure to not forget the extra bytes
		switch (extraBytes) {
			case 1:
				temp = uint8[uint8.length - 1]
				output += encode(temp >> 2)
				output += encode((temp << 4) & 0x3F)
				output += '=='
				break
			case 2:
				temp = (uint8[uint8.length - 2] << 8) + (uint8[uint8.length - 1])
				output += encode(temp >> 10)
				output += encode((temp >> 4) & 0x3F)
				output += encode((temp << 2) & 0x3F)
				output += '='
				break
		}

		return output
	}

	exports.toByteArray = b64ToByteArray
	exports.fromByteArray = uint8ToBase64
}(typeof exports === 'undefined' ? (this.base64js = {}) : exports))

}).call(this,_dereq_("IrXUsu"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},_dereq_("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/node_modules/gulp-browserify/node_modules/browserify/node_modules/buffer/node_modules/base64-js/lib/b64.js","/node_modules/gulp-browserify/node_modules/browserify/node_modules/buffer/node_modules/base64-js/lib")
},{"IrXUsu":5,"buffer":2}],4:[function(_dereq_,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
exports.read = function(buffer, offset, isLE, mLen, nBytes) {
  var e, m,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      nBits = -7,
      i = isLE ? (nBytes - 1) : 0,
      d = isLE ? -1 : 1,
      s = buffer[offset + i];

  i += d;

  e = s & ((1 << (-nBits)) - 1);
  s >>= (-nBits);
  nBits += eLen;
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8);

  m = e & ((1 << (-nBits)) - 1);
  e >>= (-nBits);
  nBits += mLen;
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8);

  if (e === 0) {
    e = 1 - eBias;
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity);
  } else {
    m = m + Math.pow(2, mLen);
    e = e - eBias;
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen);
};

exports.write = function(buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0),
      i = isLE ? 0 : (nBytes - 1),
      d = isLE ? 1 : -1,
      s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0;

  value = Math.abs(value);

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0;
    e = eMax;
  } else {
    e = Math.floor(Math.log(value) / Math.LN2);
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--;
      c *= 2;
    }
    if (e + eBias >= 1) {
      value += rt / c;
    } else {
      value += rt * Math.pow(2, 1 - eBias);
    }
    if (value * c >= 2) {
      e++;
      c /= 2;
    }

    if (e + eBias >= eMax) {
      m = 0;
      e = eMax;
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen);
      e = e + eBias;
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
      e = 0;
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8);

  e = (e << mLen) | m;
  eLen += mLen;
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8);

  buffer[offset + i - d] |= s * 128;
};

}).call(this,_dereq_("IrXUsu"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},_dereq_("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/node_modules/gulp-browserify/node_modules/browserify/node_modules/buffer/node_modules/ieee754/index.js","/node_modules/gulp-browserify/node_modules/browserify/node_modules/buffer/node_modules/ieee754")
},{"IrXUsu":5,"buffer":2}],5:[function(_dereq_,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            var source = ev.source;
            if ((source === window || source === null) && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
}

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

}).call(this,_dereq_("IrXUsu"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},_dereq_("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/node_modules/gulp-browserify/node_modules/browserify/node_modules/process/browser.js","/node_modules/gulp-browserify/node_modules/browserify/node_modules/process")
},{"IrXUsu":5,"buffer":2}]},{},[1])
(1)
});