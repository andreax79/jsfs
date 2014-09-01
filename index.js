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

var Buffer = require('buffer').Buffer;

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
