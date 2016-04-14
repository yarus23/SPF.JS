
var fs;

function StartForth(img_name) {

    var xhr = new XMLHttpRequest();
    xhr.open('GET', img_name, true);
    xhr.responseType = 'arraybuffer';

    xhr.onload = function(e) {
      if (this.status == 200) {
        // get binary data as a response
        var blob = this.response;
        fs = new Forth(blob, {
              data_space_size: 1000000
        });
        console.log('FORTH image loaded');
        fs.addWords(words);
        fs.addJSDict(Dom);
        fs.addJSDict(IO);
        fs.global.open_files = {};
        fs.global.open_files_count = 0;
        fs.start();       
      }
    };

    xhr.send();   
}
// todo: head instead of get

var words = [{
        name: "CLOSE-FILE", // ( fileid -- ior ) \ 94 FILE
        fn: function(global, data_stack, return_stack, callback) {
             var fid = global.pop();
             var f = global.open_files[fid];
             if( f ) {
                global.open_files[fid] = undefined; 
                global.open_files_count -= 1;
                global.push(0);
             } else {
                global.push(-37);
             }
         }, in: 1, out: 1
        },{
        name: "OPEN-FILE", // ( c-addr u fam -- fileid ior ) \ 94 FILE
        fn: function(global, data_stack, return_stack, callback) {
            global.pop();
            var file = global.get_string() + "?" + Date.now();
            var xhr = new XMLHttpRequest();
            xhr.open('GET', file, true);
            xhr.responseType = 'arraybuffer';

            xhr.onload = function(e) {
             if (this.status == 200) {
               // get binary data as a response
               var id = ++global.open_files_count;
               global.open_files[id] = { data: new Uint8Array(this.response), position:0, url: file };
               global.push(id);
               global.push(0);
            } else { 
              global.push(0);
              global.push(-2003);
            }
            callback.apply();
          };

          xhr.send();   
          return true;   
        }, in: 3, out: 2
        },{
        name: "FILE-EXISTS", // ( addr u -- f ) 
        fn: function(global, data_stack, return_stack, callback) {
            var file = global.get_string();

            function checkFile(fileUrl) {
               var xmlHttpReq = false;
               var self = this;
               // Mozilla/Safari
               if (window.XMLHttpRequest) {
                  self.xmlHttpReq = new XMLHttpRequest();
               }
               // IE
               else if (window.ActiveXObject) {
                  self.xmlHttpReq = new ActiveXObject("Microsoft.XMLHTTP");
               }

               self.xmlHttpReq.open('GET', fileUrl, true);
               self.xmlHttpReq.onreadystatechange = function() {

               if (self.xmlHttpReq.readyState == 4) {
               if (self.xmlHttpReq.status == 200) {
                  global.push(-1);                  
               } else if (true/*self.xmlHttpReq.status == 404*/) {
                  global.push(0);
               }
               callback.apply();
              }
             }
             self.xmlHttpReq.send();
           }
           checkFile(file);
           return true; 
        },
        in: 2,
        out: 1
      },{
        name: "REPOSITION-FILE", // ( ud fileid -- ior ) \ 94 FILE
        fn: function(global, data_stack, return_stack, callback) {
            var file_id = global.pop();
            if( file_id < 0 ) { // H-STDIN
                global.pop()
                global.pop()
                global.push(0);
            } else {
               var f = global.open_files[file_id];
               global.pop();
               var d = global.pop();  
               if( !f )  { global.push(-2003) }
               else {
                 f.position = d;
//                 console.log("reposition to: " + d);
                 global.push(0);
               }
            }
        },
        in : 3,
        out: 1
     },{
        name: "FILE-POSITION", // ( fileid -- ud ior ) \ 94 FILE
        fn: function(global, data_stack, return_stack, callback) {
            var file_id = global.pop();
            if( file_id < 0 ) { // H-STDIN
                global.push(0);
                global.push(0);
                global.push(0);
            } else {
                var f = global.open_files[file_id];
                if( !f ) { global.push(0); global.push(0); global.push(-2003) }
                else {
                  global.push(f.position);
//                 console.log("request position: " + f.position);
                  global.push(0);
                  global.push(0);
                }

            } 
        },
        in : 1,
        out: 3
    },
    {
    name: "READ-FILE", //( c-addr u1 fileid -- u2 ior ) \ 94 FILE
    fn: function(global, data_stack, return_stack, callback) {
        var file_id = global.pop();
        if( file_id == -10 ) {  // H-STDIN
            global.read_console_fn = function(str) {
                global.accept_maxlen = global.pop();
                global.accept_addr = global.pop();

                for (var i = 0; i < str.length; i++) {
                    global.put8(global.accept_addr + i, str.charCodeAt(i));
                }

                global.push(str.length);
                global.push(0);
                global.read_console_fn = null;

                callback.apply(); // return to FORTH inner loop
            }

            return true; // yield
        } else {
            var f = global.open_files[file_id];
            if( !f ) {
                global.pop(); global.pop(); global.push(-2003);
            } else {
                var maxlen = global.pop();
                var addr_to = global.pop();
                var addr_from = f.data;
                var least = f.data.length - f.position;
                var count = 0;
                if( least > 0 ) count = least < maxlen ? least : maxlen;
                var i = 0;
//                console.log("read file from position: " + f.position);
                while( count-- > 0 ) 
                  { global.put8(addr_to + i, addr_from[i + f.position]); i++; }
                f.position += i;
                global.push(i);
                global.push(0);
            }
        }
    },
    in : 3,
    out: 2
},{
    name: "HALT",
    fn: function(global, data_stack, return_stack, callback) {
        global.pop();
        return true;
    },
    in : 1,
    out: 0
},
{
    name: "COMMANDLINE-OPTIONS",
    fn: function(global) {
        var arg = "";
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
        var do_pump = false;
        var prev_i = 0;
        do {
            prev_i = i;
            i = buffer.indexOf('\n', i);
            if (i < 0) break;
            var term = $.terminal.active();
            term.echo(buffer.substring(prev_i, i));
            i++; // skip \n
           
            // pump browser events
            do_pump = true;
            
        } while (true);
        if (prev_i > 0)
            buffer = buffer.substring(prev_i, buffer.length);

        global.type_buffer = buffer;
        if( do_pump ) { setTimeout(callback, 0); return true; }         
    },
    in : 2,
    out: 0
}];
