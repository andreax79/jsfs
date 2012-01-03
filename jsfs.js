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

ENOENT = "No such file or directory";
EEXIST = "File exists";
ENOTDIR = "Not a directory";
EISDIR = "Is a directory";
ENOTEMPTY = "Directory not empty";
ENOROOT = "Cannot delete root directory";
ECOPYDIR = "Cannot copy directories";
EINVALIDTYPE = "Invalid file type: valid types are 'json' and 'raw'";

JSFS_VERSION = 0.1;

File = function (path) {
	/**
	 * Create a new File object
	 */
	var path = this.simplifyPath(path);	 
    this.getPath = function() { return path; }; // Returns the pathname string of this file
};

File.prototype.currentDir = '/';

File.prototype.chdir = function(args) {
	/**
	 * Change the current working directory
	 * 
	 * Example:
	 * 
	 * new File("/dir1").chdir()
	 */
	var parameters = $.extend({success: null, error: null}, args);
	var success = parameters['success'];
	var error = parameters['error'];
	if (this.getPath() != '/') { // The root directory always exists
		var entry = this._getEntry();
		if (entry == null || entry == undefined) {
			if (error != null)
				error({file: this, error: ENOENT});
			return; // No such file or directory		
		}
		if (entry['type'] != 'dir') {
			if (error != null)
				error({file: this, error: ENOTDIR});
			return; // Not a directory
		}
	}
	File.prototype.currentDir = this.getPath();
	if (success != null)
		success({file: this });
};

File.prototype.getParent = function() {
	/**
	 * Returns the pathname string of this object's parent directory
	 */
	var t = this.getPath().split('/');
	t.pop();
	t = t.join('/');
	if (t == "")
		t = '/';
	return t;
};

File.prototype.getName = function() {
	/**
	 * Returns the name of the file or directory
	 */
	var t = this.getPath().split('/').pop();
	if (t == "")
		t = '/';
	return t;
};

File.prototype.getType = function() {
	/**
	 * Returns the type of this object
	 */
	var content = localStorage.getItem(this.getPath());
	if (content == undefined)
		return undefined;
	var entry = this._getEntry();
	if (entry == null)
		entry = this._createEntry(type || (this.getPath() == '/' ? 'dir' : 'json'));
	return entry['type'];
};

File.prototype.getCreationTime = function() {
	/**
	 * Returns the file creation time
	 */
	var content = localStorage.getItem(this.getPath());
	if (content == undefined)
		return undefined;
	var entry = this._getEntry();
	if (entry == null)
		return undefined;
	return new Date(entry['creationTime']);
};

File.prototype.read = function(args) {
	/**
	 * Returns the file content
	 */
	var parameters = $.extend({type: null, success: null, error: null}, args);
	var type = parameters['type'];
	var success = parameters['success'];
	var error = parameters['error'];
	
	var content = localStorage.getItem(this.getPath());
	if (content == undefined) {
		if (error != null)
			error({file: this, error: ENOENT});
		return; // No such file or directory
	}
	var entry = this._getEntry();
	if (entry == null)
		entry = this._createEntry(type || (this.getPath() == '/' ? 'dir' : 'json'));
	if (entry['type'] == 'dir') {
 		if (error != null)
			error({file: this, error: EISDIR});
		return; // Is a directory
	}
	if (type == undefined)
		type = entry['type'];
	if (type == 'json')
		content = JSON.parse(content);
	if (success != null)
		success({ content: content, type: type });
};

File.prototype.write = function(args) {
	/**
	 * Write the content on a file, create a new file if it does not exist
	 */
	var parameters = $.extend({content: null, type: null, success: null, error: null}, args);
	var content = parameters['content'];
	var type = parameters['type'];
	var success = parameters['success'];
	var error = parameters['error'];

	if (type != undefined && type != "json" && type != "raw") {
		if (error != null)
			error({file: this, error: EINVALIDTYPE});
		return; // Invalid file type		
	}
	var entry = this._getEntry();
	if (entry == null)
		entry = this._createEntry(type || (this.getPath() == '/' ? 'dir' : 'json'));
	if (entry['type'] == 'dir') {
		if (error != null)
			error({file: this, error: EISDIR});
		return; // Is a directory
	}	
	if (type == undefined)
		type = entry['type'];
	if (type == "json")
		content = JSON.stringify(content);
	localStorage.setItem(this.getPath(), content);
	if (success != null)
		success({ content: content, type: type });
};

File.prototype.exist = function() {
	/**
	 * Returns true if the file of the directory exists
	 */
	var text = localStorage.getItem(this.getPath());
	if (text != null && text != undefined)
		return true;
	else
		return false;
};

File.prototype.length = function() {
	/**
	 * Returns the length of the file represented by this object
	 */
	var text = localStorage.getItem(this.getPath());
	if (text != null && text != undefined)
		return text.length;
	else
		return 0;
};

File.prototype.unlink = function(args) {
	/**
	 * Deletes the file represented by this object
	 */
	var parameters = $.extend({success: null, error: null}, args);
	var success = parameters['success'];
	var error = parameters['error'];
	if (this.getPath() == '/') {
		if (error != null)
			error({file: this, error: ENOROOT});
		return; // Cannot delete root directory
	}
	var entry = this._getEntry();
	if (entry == null || entry == undefined) {
		if (error != null)
			error({file: this, error: ENOENT});
		return; // No such file or directory
	}		
	if (entry['type'] == 'dir') {
		if (error != null)
			error({file: this, error: EISDIR});
		return; // Is a directory
	}
	localStorage.removeItem(this.getPath());
	this._deleteEntry();
	if (success != null)
		success({file: this });
};

//File.prototype.delete = File.prototype.unlink;
File.prototype.remove = File.prototype.unlink;

File.prototype.mkdir = function(args) {
	/**
 	 * Creates the directory named by this object
 	 */
	var parameters = $.extend({success: null, error: null}, args);
	var success = parameters['success'];
	var error = parameters['error'];
	if (this.exist()) {
		if (error != null)
			error({file: this, error: EEXIST});
		return;
	}
	this._createEntry('dir');
	var dir = {};
	localStorage.setItem(this.getPath(), JSON.stringify(dir));
	if (success != null)
		success({file: this });
};

File.prototype.rmdir = function(args) {
	/**
 	 * Deletes the directory named by this object
 	 */
	var parameters = $.extend({success: null, error: null}, args);
	var success = parameters['success'];
	var error = parameters['error'];	
	if (this.getPath() == '/') {
		if (error != null)
			error({file: this, error: ENOROOT});
		return; // Cannot delete root directory
	}
	var entry = this._getEntry();
	var dir = localStorage.getItem(this.getPath());
	if (dir == null || dir == undefined) {
		if (error != null)
			error({file: this, error: ENOENT});
		return; // No such file or directory"
	}
	if (entry['type'] != 'dir') {
		if (error != null)
			error({file: this, error: ENOTDIR});
		return; // Not a directory
	}
	dir = JSON.parse(dir);
	for (var name in dir) {
		if (error != null)
			error({file: this, error: ENOTEMPTY});
		return; // Directory not empty
	}	
	localStorage.removeItem(this.getPath());
	this._deleteEntry();
	if (success != null)
		success({file: this });
};

File.prototype.listFiles = function() {
	var entry = this._getEntry();
	if (entry != null && entry != undefined && entry['type'] != 'dir')
		return undefined; // Not a directory
	var dir = JSON.parse(localStorage.getItem(this.getPath()));
	if (dir == null || dir == undefined)
		return undefined;
	var result = {};
	for (var name in dir) {
		var file = new File(this.getPath() + '/' + name);
		if (file.exist() && name != '/')
			result[name] = file;
	}
	return result;
};

File.prototype.copy = function(args) {
	var parameters = $.extend({to: null, success: null, error: null}, args);
	var to = parameters['to'];
	var success = parameters['success'];
	var error = parameters['error'];
	var entry = this._getEntry();
	
	if (entry == null || entry == undefined) {
		if (error != null)
			error({file: this, error: ENOENT});
		return; // No such file or directory"
	}
	if (entry['type'] == 'dir') {
		if (error != null)
			error({file: this, error: ECOPYDIR});
		return; //  Cannot copy directories
	}

	var self = this;
	new File(filename).read({ type: 'raw',
							  error: function(args){ self.errorCallback(args); },
							  success: function(args){
									var content = args['content'];
									var targetFile = new File(to);
									var targetEntry = targetFile._getEntry();
									if (targetEntry != null && targetEntry != undefined && targetEntry['type'] == 'dir') {
										targetFile = new File(to + '/' + this.getName());
									}
									targetFile.write({content: content,
													  type: entry['type'],
													  success: function(args) { 
														  if (success != null)
																success({file: self, targetFile: targetFile});
													  	  }
													  });
							  }});

};

File.prototype.simplifyPath = function(path) {
	if (path.substring(0, 1) != '/')
		path = this.currentDir + '/' + path;
	var newPath = new Array();
	var splittedPath = path.split('/');
	for (var i in splittedPath) {
		var t = splittedPath[i];		
		if (t == "..") {
			newPath.pop();
		} else if (t != "" && t != ".") {
			newPath.push(t);
		}
	}	
	return '/' + newPath.join('/');
};


File.prototype._getEntry = function() {
	var parent = this.getParent();
	var dir = JSON.parse(localStorage.getItem(parent));
	if (dir == null || dir == undefined)
		return null;
	var t = dir[this.getName()];
	if (t == undefined)
		t = null;
	return t;
};

File.prototype._createEntry = function(type) {
	var parent = this.getParent();
	var dir = JSON.parse(localStorage.getItem(parent));
	if (dir == null || dir == undefined) {
		dir = {};
		if (parent != '/') {
			new File(parent).mkdir();
		}
	}
	dir[this.getName()] = { 'creationTime': new Date().getTime(),
			                'type': type };
	localStorage.setItem(parent, JSON.stringify(dir));
	return dir[this.getName()];
};

File.prototype._deleteEntry = function() {
	var parent = this.getParent();
	var dir = JSON.parse(localStorage.getItem(parent));
	if (dir == null || dir == undefined)
		return;
	delete dir[this.getName()];
	localStorage.setItem(parent, JSON.stringify(dir));
};
