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

STATE_PROMPT = 1;
STATE_READLINE = 2;
STATE_COMMAND = 3;

MAX_HISTORY_LINES = 500;
DEFAULT_PROMPT = "js:";

UP = '\uf000';
RIGHT = '\uf001';
DOWN = '\uf002';
LEFT = '\uf003';
HOME = '\uf004';
END = '\uf005';
CTRL_L = '\u000c';

function extend(subClass, baseClass) {
	function inheritance() {}	
	inheritance.prototype = baseClass.prototype;
	subClass.prototype = new inheritance();
	subClass.prototype.constructor = subClass;
	subClass.prototype.superClass = baseClass.prototype;
};

function JSFSCmd(container) {
	var self = this;
	this.superClass.constructor.call(this, container);
	this.banner = "JSFS v" + JSFS_VERSION +"\r\nType 'help' for help.";
	this.historyFile = new File("/history");
	this.history = new Array();
	this.historyPosition = self.history.length;	
	this.historyFile.read({ type: 'json',
		  success: function(args){
			  self.history = args['content'];
			  if (self.history == null || self.history == undefined)
				  self.history = new Array();
			  self.historyPosition = self.history.length;			  
	      }});
	this.printUnicode(this.banner);
	this.setPrompt(DEFAULT_PROMPT);
	this.handlers = {
			'help': 		['doHelp',		  	'Prints this help text'],
			'?': 			['doHelp',		  	''],
			'history':      ['doHistory',	  	'Displays command history'],
			'cls': 			['doCls',			''],
			'clear': 		['doCls',			'Clears the terminal screen'],
			'echo': 		['doEcho',			''],	 
			'cd': 			['doCd',			'Changes the current directory'],	 
			'pwd':	 		['doPwd',			'Prints the current directory'],	 
			'ls': 			['doLs',			'Lists files and directories'],
			'mkdir': 		['doMkdir',			'Creates directories'],
			'rmdir': 		['doRmdir',			'Removes directories'],
			'rm': 			['doRm',			'Removes files'],
			'cat': 			['doCat',			'Outputs file to the terminal'],
			'cp': 			['doCp',			'Copies file'],
			'run': 			['doRun',			'Loads and executes a file'],
			'edit': 		['doEdit',			'Opens a file in the editor'],
			'save':			['doSave',			'Writes editor content to a file']
	};
	this.gotoState(STATE_PROMPT);
};
extend(JSFSCmd, VT100);

JSFSCmd.prototype.keysPressed = function(ch) {
	if (ch.length == 3) {
		var c0 = ch[0].charCodeAt();
		var c1 = ch[1].charCodeAt();
		var c2 = ch[2].charCodeAt();
		// this.vt100("-" + c0 + " " + c1 + " " + c2);
		if ((c0 == 27) && (c1 == 91) && (c2 == 65))
			ch = UP;
		else if ((c0 == 27) && (c1 == 91) && (c2 == 67))
			ch = RIGHT;
		else if ((c0 == 27) && (c1 == 91) && (c2 == 66))
			ch = DOWN;
		else if ((c0 == 27) && (c1 == 91) && (c2 == 68))
			ch = LEFT;
		else if ((c0 == 27) && (c1 == 79) && (c2 == 72))
			ch = HOME;
		else if ((c0 == 27) && (c1 == 79) && (c2 == 70))
			ch = END;
	}

	this.keys += ch;
	this.gotoState(this.state);
};

JSFSCmd.prototype.gotoState = function(state, tmo) {
	this.state = state;
	if (!this.timer || tmo) {
		if (!tmo) {
			tmo = 1;
		}
		this.nextTimer = setTimeout(function(demo) {
			return function() {
				demo.demo();
			};
		}(this), tmo);
	}
};

JSFSCmd.prototype.demo = function() {
	var done = false;
	this.nextTimer = undefined;
	while (!done) {
		var state = this.state;
		this.state = STATE_PROMPT;
		switch (state) {
			case STATE_PROMPT:
				done = this.doPrompt();
				break;
			case STATE_READLINE:
				done = this.doReadLine();
				break;
			case STATE_COMMAND:
				done = this.doCommand();
				break;
			default:
				done = true;
				break;
		}
	}
	this.timer = this.nextTimer;
	this.nextTimer = undefined;
};

JSFSCmd.prototype.setPrompt = function(prompt) {
	this.prompt = prompt;
	this.promptLength = this.prompt.length;
};

JSFSCmd.prototype.doPrompt = function() {
	this.historyPosition = this.history.length;
	this.linePosition = 0;
	this.keys = '';
	this.line = '';
	this.vt100((this.cursorX != 0 ? '\r\n' : '') + this.prompt);
	this.gotoState(STATE_READLINE);
	return false;
};

JSFSCmd.prototype.writeln = function(s) {
	this.printUnicode((this.cursorX != 0 ? '\r\n' : '') + s + '\r\n');
};

JSFSCmd.prototype.printUnicode = function(s) {
	var out = '';
	for ( var i = 0; i < s.length; i++) {
		var c = s.charAt(i);
		if (c < '\x0080') {
			out += c;
		} else {
			var c = s.charCodeAt(i);
			if (c < 0x800) {
				out += String.fromCharCode(0xC0 + (c >> 6))
						+ String.fromCharCode(0x80 + (c & 0x3F));
			} else if (c < 0x10000) {
				out += String.fromCharCode(0xE0 + (c >> 12))
						+ String.fromCharCode(0x80 + ((c >> 6) & 0x3F))
						+ String.fromCharCode(0x80 + (c & 0x3F));
			} else if (c < 0x110000) {
				out += String.fromCharCode(0xF0 + (c >> 18))
						+ String.fromCharCode(0x80 + ((c >> 12) & 0x3F))
						+ String.fromCharCode(0x80 + ((c >> 6) & 0x3F))
						+ String.fromCharCode(0x80 + (c & 0x3F));
			}
		}
	}
	this.vt100(out);
};

JSFSCmd.prototype.doReadLine = function() {
	this.gotoState(STATE_READLINE);
	var keys = this.keys;
	this.keys = '';
	for (var i = 0; i < keys.length; i++) {
		var ch = keys.charAt(i);
		// this.vt100("-" + ch.charCodeAt());

		if (ch == '\u0008' || ch == '\u007F') { // del
			if (this.linePosition > 0) {
				this.line = this.line.substr(0, this.linePosition - 1)
						+ this.line.substr(this.linePosition, this.line.length
								- this.linePosition);
				this.linePosition--;
				this.redrawLine();
				this.fixCursorPosition();
			}			
		} else if (ch == LEFT) { // left
			if (this.linePosition > 0)
				this.linePosition--;
			this.fixCursorPosition();
			
		} else if (ch == RIGHT) { // right
			this.linePosition++;
			if (this.linePosition > this.line.length)
				this.linePosition = this.line.length;
			this.fixCursorPosition();
			
		} else if (ch == HOME) { // line start
			this.linePosition = 0;
			this.fixCursorPosition();
			
		} else if (ch == END) { // line end
			this.linePosition = this.line.length;
			this.fixCursorPosition();
			
		} else if (ch == UP) { // history up
			if (this.history.length > 0) {
				this.historyPosition = (this.historyPosition
						+ this.history.length - 1)
						% this.history.length;
				this.line = this.history[this.historyPosition];
				this.redrawLine();
				this.linePosition = this.line.length;
			}
			
		} else if (ch == DOWN) { // history down
			if (this.history.length > 0) {
				this.historyPosition = (this.historyPosition + 1)
						% this.history.length;
				this.line = this.history[this.historyPosition];
				this.redrawLine();
				this.linePosition = this.line.length;
			}
			
		} else if (ch == CTRL_L) { // clear screen
			this.doCls();
			
		} else if (ch >= ' ') {
			if (this.linePosition >= this.line.length) { // append
				this.line += ch;
				this.linePosition++;
				this.printUnicode(ch);
			} else { // insert
				this.line = this.line.substr(0, this.linePosition)
						+ ch
						+ this.line.substr(this.linePosition, this.line.length - this.linePosition);
				this.linePosition++;
				this.redrawLine();
				this.fixCursorPosition();
			}
			
		} else if (ch == '\r' || ch == '\n') { // enter
			if (this.line.length > 0) {
				this.history.push(this.line);
				this.history = this.history.slice(-MAX_HISTORY_LINES);
				this.historyFile.write({content: this.history });
			}
			this.vt100('\r\n');
			this.gotoState(STATE_COMMAND);
			return false;
			
		} else if (ch == '\u001B') {
			// This was probably a function key. Just eat all of the following
			// keys.
			break;
		}
	}
	return true;
};

JSFSCmd.prototype.redrawLine = function() {
	this.cursorX = this.promptLength;
	this.printUnicode('\u001B[K' + this.line);
};

JSFSCmd.prototype.fixCursorPosition = function() {
	this.printUnicode('\u001B[' + (this.cursorY + 1) + ';'
			+ (this.linePosition + this.promptLength + 1) + 'H');
};

JSFSCmd.prototype.doCommand = function() {
	this.gotoState(STATE_PROMPT);
	this.doExec(this.line);
	return true;
};

JSFSCmd.prototype.doExec = function(_line) {
	_line = _line.trim();
	var _cmd = _line;
	var _args = "";
	var _t = _line.indexOf(" ");
	if (_t != -1) {
		_cmd = _line.slice(0, _t);
		_args = _line.slice(_t + 1);
		if (_args != undefined)
			_args = _args.trim();
	}
	delete _t;
	var _handler = this.handlers[_cmd];
	if (_handler != undefined) {
		try {
			if (_handler[0] != undefined)
				_handler = _handler[0];
			this[_handler](_args);
		} catch (err) { // error in command execution
			var result = "\u001B[24;31m" + err + "\u001B[0m";
			this.vt100((this.cursorX != 0 ? '\r\n' : '') + result);
		}
	} else {
		// Evaluate a javascript statement
		this.evalJavascript(_line);
	}
	return true;
};

JSFSCmd.prototype.evalJavascript = function(_line) {
	if (_line == "")
		return;
	try {
		var _this = this;
		var writeln = function(x) { _this.writeln(x); };
		var result = eval(_line);
		if (result == undefined)
			return;
		result = "" + result;
		result = result.replace(/\n/g, '\r\n');
		this.writeln(result);
	} catch (err) {
		var result = "\u001B[24;31m" + err + "\u001B[0m";
		this.writeln(result);
	}
};

JSFSCmd.prototype.doHistory = function(args) {
	for (var i in this.history) {
		this.writeln(this.pad("" + i, 3) + ". " + this.history[i]);
	}
};

JSFSCmd.prototype.doCls = function(args) {
	this.reset();
	//$('#vt100 #console div').html('');
	//$('#vt100 #console').css('height', $('#vt100').css('height'));
};

JSFSCmd.prototype.doEcho = function(_line) {
	if (_line == "")
		return;
	try {
		var result = eval(_line);
		if (typeof result != "object") {
			result = "" + result;
			result = result.replace(/\n/g, '\r\n');
			this.vt100((this.cursorX != 0 ? '\r\n' : '') + result);
		} else {
			for (property in result) {
				var _value;
				if (typeof result[property] == "function")
					_value = "[" + typeof result[property] + "]";
				else
					_value = "" + result[property];
				_value = _value.replace(/\n/g, '\r\n');
				this.writeln(property + ': ' + _value);
			}
		}
	} catch (err) {
		var result = "\u001B[24;31m" + err + "\u001B[0m";
		this.vt100((this.cursorX != 0 ? '\r\n' : '') + result);
	}
};

JSFSCmd.prototype.doLs = function(args) {	
	if (args == "")
		args = File.prototype.currentDir;
	args = args.split(' ');
	if (args.length > 1)
		throw "too many arguments";
	var filename = args[0];
	var files = new File(filename).listFiles();
	if (files == undefined)
		throw "Not a directory";
	for (var name in files) {
		var file = files[name];
		var date = file.getCreationTime();
		date = this.pad(date.getFullYear(), 4, 'left', '0') + '-' + this.pad(date.getMonth()+1, 2, 'left', '0') + '-' + this.pad(date.getDate(), 2, 'left', '0') + ' ' +
			   this.pad(date.getHours(), 2, 'left', '0') + ':' + this.pad(date.getMinutes(), 2, 'left', '0');
		this.writeln(this.pad(name, 20) + " " +
					 this.pad(file.length(), 10, "left") + " " +
					 this.pad("<" + file.getType() + ">", 6) + " " +
					 date);
	}
};

JSFSCmd.prototype.errorCallback = function(args) {
	this.writeln(args['file'].getName() + ": " + args['error']);
};

JSFSCmd.prototype.successCallback = function(args) {
};

JSFSCmd.prototype.doPwd = function(args) {
	this.writeln("Current directory: " + File.prototype.currentDir);
};

JSFSCmd.prototype.doCd = function(args) {	
	if (args == "")
		args = "/";
	args = args.split(' ');
	if (args.length > 1)
		throw "too many arguments";
	var filename = args[0];
	var self = this;
	new File(filename).chdir({ error: function(args){ self.errorCallback(args); },
							   success: function(args){
								   self.doPwd();
								   self.successCallback();
							   }});	
};

JSFSCmd.prototype.doMkdir = function(args) {	
	if (args == "")
		throw "usage: mkdir directory";
	args = args.split(' ');
	if (args.length > 1)
		throw "too many arguments";
	var filename = args[0];
	var self = this;
	new File(filename).mkdir({ error: function(args){ self.errorCallback(args); },
							   success: function(args){ self.successCallback(args); }});
};

JSFSCmd.prototype.doRmdir = function(args) {	
	if (args == "")
		throw "usage: rmdir directory";
	args = args.split(' ');
	if (args.length > 1)
		throw "too many arguments";
	var filename = args[0];
	var self = this;
	new File(filename).rmdir({ error: function(args){ self.errorCallback(args); },
							   success: function(args){ self.successCallback(args); }});
};

JSFSCmd.prototype.doRm = function(args) {	
	if (args == "")
		throw "usage: rm file";
	args = args.split(' ');
	if (args.length > 1)
		throw "too many arguments";
	var filename = args[0];
	var self = this;
	new File(filename).unlink({ error: function(args){ self.errorCallback(args); },
								success: function(args){ self.successCallback(args); }});
};

JSFSCmd.prototype.doCat = function(args) {	
	if (args == "")
		throw "usage: cat file";
	args = args.split(' ');
	if (args.length > 1)
		throw "too many arguments";
	var filename = args[0];
	var self = this;
	new File(filename).read({ type: 'raw',
							  error: function(args){ self.errorCallback(args); },
							  success: function(args){
								  var content = args['content'];
								  content = content.replace(/\n/g, '\r\n');
								  self.writeln(content);
								  self.successCallback();
						      }});
};

JSFSCmd.prototype.doCp = function(args) {	
	args = args.split(' ');
	if (args.length != 2)
		throw "usage: cp source_file target_file";
	var from = args[0];
	var to = args[1];
	var self = this;
	new File(from).copy({ to: to,
						  error: function(args){ self.errorCallback(args); },
						  success: function(args){ self.successCallback(args); }});
};

JSFSCmd.prototype.doRun = function(args) {	
	if (args == "")
		throw "usage: run file";
	args = args.split(' ');
	if (args.length > 1)
		throw "too many arguments";
	var filename = args[0];
	var self = this;
	new File(filename).read({ type: 'raw',
		  error: function(args){ self.errorCallback(args); },
		  success: function(args){
			  var content = args['content'];
			  self.doExec(content);
			  self.successCallback();
	      }});
};

JSFSCmd.prototype.doEdit = function(args) {	
	if (args == "")
		throw "usage: edit file";
	args = args.split(' ');
	if (args.length > 1)
		throw "too many arguments";
	var filename = args[0];
	var self = this;
	new File(filename).read({ type: 'raw',
		  error: function(args){ self.errorCallback(args); },
		  success: function(args){
			  var content = args['content'];
			  window.parent.editor.setValue(content);
			  self.writeln(filename + " loaded");
			  self.successCallback();
	      }});
};

JSFSCmd.prototype.doSave = function(args) {	
	if (args == "")
		throw "usage: save file";
	args = args.split(' ');
	if (args.length > 1)
		throw "too many arguments";
	var filename = args[0];
	var content = window.parent.editor.getValue();
	var self = this;
	new File(filename).write({content: content,
						      type: 'raw',
						      success: function(args) {
						  			self.writeln(filename + " saved");						    	  
						      }});
};

JSFSCmd.prototype.doHelp = function(args) {
	this.writeln('Available Commands');
	for (cmd in this.handlers) {
		var help = this.handlers[cmd][1];
		if (help != undefined && help != "")
			this.writeln(this.pad(cmd, 15) + ' ' + help); 
	}	
	this.writeln(navigator.userAgent);
};

JSFSCmd.prototype.pad = function(text, length, dir, chr) {
	length = length + 1;
	text = "" + text;
	if (length < text.length) 
		return text;
	else if (dir == "left")
		return Array(length - text.length).join(chr || ' ') + text;
	else
		return text + Array(length - text.length).join(chr || ' ');
};

