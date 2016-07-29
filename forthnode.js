var spf = require('./htdocs/forth.js');
var fs = require('fs');
var path = require('path');

var words = [{
    name: "OPEN-FILE",
    fn: function(global, data_stack, return_stack, callback) {
        var fam = global.pop();
        var uri = global.get_string();
        var method = '';

        switch (fam) {
            case 1:
                method = "r";
                break;
            case 2:
                method = "w";
                break;
            case 3:
                method = "w+";
                break;
            default:
                method = "r";
        }

        fs.open(path.join(__dirname, uri), method, function(err, fd) {
            if (err) {
                global.push(0);
                global.push(-38);
            } else {
                var id = ++global.open_files_count;
                global.open_files[id] = { position:0, url: uri, fd: fd };
                global.push(id);
                global.push(0);
            }
            callback.apply();
        });
        return true; // yeld
    },
    in : 3,
    out: 2
}, {
    name: "FILE-SIZE",
    fn: function(global, data_stack, return_stack, callback) {
        var fd = global.open_files[global.pop()];
        if( fd ) fd = fd.fd;
        fs.fstat(fd, function(err, stats) {
            if (err) {
                global.push(0);
                global.push(0);
                global.push(-37);
            } else {
                var a = stats.size;
                if (a > Math.pow(2, 32)) {
                    global.push(a % Math.pow(2, 32));
                    global.push(a / Math.pow(2, 32));
                    global.push(0);
                } else {
                    global.push(a);
                    global.push(0);
                    global.push(0);
                }
            }
            callback.apply();
        });
        return true;
    },
    in : 1,
    out: 3
}, {
    name: "FILE-POSITION", // ( fileid -- ud ior ) \ 94 FILE
    fn: function(global, data_stack, return_stack, callback) {
            var fd = global.open_files[global.pop()];
            if( fd ) {
               global.push(fd.position);
               global.push(0);
               global.push(0);
            } else {
               global.push(0);
               global.push(0);
               global.push(-37);
            }
    },
    in : 1,
    out: 3
}, {
    name: "REPOSITION-FILE",
    fn: function(global, data_stack, return_stack, callback) {
        var fd = global.open_files[global.pop()];
        var h = global.pop();
        var l = global.pop();
        if( fd < 0 ) { global.push(0); return; }

        if( fd !== undefined ) {
           fd.position = l;
           global.push(0);
        } else {
           global.push(-2003);
        }
    },
    in : 3,
    out: 1
}, {
    name: "READ-FILE", //( c-addr u1 fileid -- u2 ior ) \ 94 FILE
    fn: function(global, data_stack, return_stack, callback) {
        var fd = global.pop();
        if( fd < 0 ) {
            process.stdin.setEncoding('utf8');
            global.accept_maxlen = global.pop();
            global.accept_addr = global.pop();

            var readable = function() {
                var chunk = process.stdin.read();

                if (chunk === null) return;

                for (var i = 0; i < chunk.length; i++) {
                    global.put8(global.accept_addr + i, chunk.charCodeAt(i));
                }
                process.stdin.removeListener('readable', readable);
                //process.stdin.pause();
                global.push(chunk.length);
                global.push(0);
                callback.apply();
            };
            process.stdin.on('readable', readable);

            return true;
        } else {
            fd = global.open_files[fd];
            if( fd === undefined ) { global.push(0); global.push(-37); return }

            var len = global.pop();
            var fbuf = global.pop();
            var buf = new Buffer(len);
            fs.read(fd.fd, buf, 0, len, fd.position, function(err, bytesRead, buffer) {
                global.push(bytesRead);
                global.push(err ? -37 : 0);

                for (var i = 0; i < bytesRead; i++)
                    global.put8(fbuf++, buffer[i]);

                fd.position += bytesRead;
                callback.apply();
            });
            return true;
       }
    },
    in : 3,
    out: 2
}, {
    name: "FLUSH-FILE",
    fn: function(global, data_stack, return_stack, callback) {
        var fd = global.open_files[global.pop()];
        if( fd ) fd = fd.fd;
        fs.sync(fd);
    },
    in : 1,
    out: 1
}, {
    name: "WRITE-FILE", // ( c-addr u fileid -- ior ) \ 94 FILE
    fn: function(global, data_stack, return_stack, callback) {
        var file = global.open_files[global.pop()];
        var fd = -1;
        if( file ) fd = file.fd;
        
        var len = global.pop();
        var fbuf = global.pop();
        var buf = new Buffer(len);

        for (var i = 0; i < len; i++)
           buf[i] = global.get8(fbuf++);

        fs.write(fd, buf, 0, len, file.position, function(err, written, buffer) {
                global.push(err ? -37 : 0);

                fd.position += written;
                callback.apply();
            });
        return true;
        
    },
    in : 3,
    out: 1
},{
    name: "HALT",
    fn: function(global, data_stack, return_stack, callback) {
        global.pop();
        process.stdin.pause();
        return true;
    },
    in : 1,
    out: 0
}, {
    name: "FILE-EXIST",
    fn: function(global, data_stack, return_stack, callback) {
        var file_name = global.get_string();
        fs.exists(file_name, function(exists) {
            global.push(exists ? -1 : 0);
            callback.apply();
        });
        return true;
    },
    in : 2,
    out: 1
}, {
    name: "FILE-EXISTS",
    fn: function(global, data_stack, return_stack, callback) {
        var file_name = global.get_string();

        fs.stat(file_name, function(err, stats) {
            if (err) {
                global.push(0);
            } else {
                global.push(stats.isFile() && !stats.isDirectory() ? -1 : 0);
            }
            callback.apply();
        });
        return true;
    },
    in : 2,
    out: 1
}, {
    name: "CLOSE-FILE",
    fn: function(global, data_stack, return_stack, callback) {
        var fd = global.pop();
        var f = global.open_files[fd];
        if( f ) {
        fs.close(f.fd, function(err) {
            if (err)
                global.push(-37);
            else {
                global.open_files[fd] = undefined; 
                global.push(0);
            }
            callback.apply();
        });
        return true; // yeld
      } else global.push(-37);
    },
    in : 1,
    out: 1
}, {
    name: "COMMANDLINE-OPTIONS",
    fn: function(global) {
        var arg = "";
        var i = 0;
        process.argv.forEach((val, index, array) => {
           if( i++ > 1 )
              arg += val + ' ';
        });
        global.alloc_string(arg);
    }, 
    in: 0,
    out: 2
},
{
    name: "TYPE",
    fn: function(global, data_stack, return_stack, callback) {


        if (global.type_buffer === undefined)
            global.type_buffer = "";

        var buffer = global.type_buffer;
        buffer += global.get_string();

        var i = 0;
        var prev_i = 0;
        do {
            prev_i = i;
            i = buffer.indexOf('\n', i);
            if (i < 0) break;
            console.log(buffer.substring(prev_i, i));
            i++; // skip \n
        } while (true);
        if (prev_i > 0)
            buffer = buffer.substring(prev_i, buffer.length);

        global.type_buffer = buffer;
    },
    in : 2,
    out: 0
} ];


module.exports.words = words;