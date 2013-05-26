// todo: variables as lit's
// todo: const as primitves
// todo: проверка стека в медленных операциях


function ForthError(err, message) {
	this.err = err;
	this.message = message;
}

ForthError.prototype = new Error();
ForthError.prototype.constructor = ForthError;

var TC = function(src, callback) {
    
    var parse_count = 0;
    var include_stack = [];
    // search order: tc_wordlist_imm or tc_wordlist -> dst_wordlist -> primitives
    var dst_wordlist = {};
    var dst_compile = {}; // R@ EXIT and so on
    var buffer = new ArrayBuffer(100000);
    var img = new Int32Array(buffer);
    var img8 = new Uint8Array(buffer);
    var img16 = new Uint16Array(buffer);
    
    var dp = 0; // in bytes!!!
    var uri = 'string';
    var immediate_state = true;
    var data_stack = [];
    var cellSize = 4;
    var doubleCell = 8;
    var last_nfa;
    var forth_voc = dp;
    var control_stack = [];
    var stop_parse;
    var line_count = 0;
    var include_count = 0;
    var tc_vars = {}; // inlining of const and vars
    var radix = 10;
    var user_dp = 0;
    
    
    /* structure of image
     * 4 - start cfa
     * 4 - user data length
     * 4 - exc handler address, shift in user data
     */
     
    function write(u) {
        align_cell();
        img[dp / cellSize] = u;
        dp += cellSize;
    }
    write(0); // init cfa
    write(0); // user data len
    write(0); // exc handler
    
    // create forth-wordlist
    write(0); // voc-list
    var forth_wl_last = dp;

    write(0); // last-name address
    write(0); // reserved for spf compatibility
    write(0); // reserved for spf compatibility
    write(0); // reserved for spf compatibility

	// create compile-wordlist
	// todo: check behavior with spf
    write(forth_wl_last - cellSize); // voc-list
    var compile_wl_last = dp;
    write(0); // last-name address
    write(0); // reserved for spf compatibility
    write(0); // reserved for spf compatibility
    write(0); // reserved for spf compatibility	
	
	function get_user_dp() {
		return img[1] = user_dp += cellSize;
	}
	
	function align_addr(addr) {
        if( !(addr % cellSize) ) return addr;
        return addr + cellSize - addr % cellSize;
	}
	
    function align_cell() {
		dp = align_addr(dp);
    }
    function align_word() {
        dp += dp & 1;
    }
    

    function write_byte(b) {
        img8[dp++] = b;
    }
    function write_word(b) {
        align_word();
        img8[dp / cellSize / 2] = b;
        dp += 2;
    }
    
    function compile_literal(n) {
        write(primitiveIdx('(LIT)'));
        write(n);
    }
    function write_str(s) {
        for(var i = 0 ; i < s.length; i++)
            write_byte(s.charCodeAt(i));
        write_byte(0);
    }  
    function compile_sliteral(s) {
        write(primitiveIdx('(SLIT)'));
        write(s.length);
        write_str(s);
        align_cell();
    }
    
    function compile_primitive(s) {
        var n = primitiveIdx(s);
        if( n === undefined ) report_error('cannot find ' + s);
        write(n);
    }
    
    function parse(sym) {
        
        function check_eof() {
            if( parse_count >= src.length ) { 
                if( include_stack.length ) {
                    var context = include_stack.pop();
                    src = context.src;
                    parse_count = context.parse_count;
                    uri = context.uri;
                    line_count = context.line_count;
                 } else
                    return true;
            }            
        }
        // till sym or eol or eof
        if( !sym ) sym = ' ';
        var result =[];
        while(true) {
            var c = src.charCodeAt(parse_count);
            if( c == 8 ) c = 32;
            if( c == 0x0A ) { line_count++; /*console.log(line_count)*/ }
            if(  c >= 32 && c != sym.charCodeAt(0) ) {
                result.push(src.charAt(parse_count));
            } else
                if( result.length ) {
                    // skip parse sym
                    if( src.charCodeAt(parse_count) == sym.charCodeAt(0) || 
                        src.charCodeAt(parse_count) == 0x0A ) {
                        parse_count++;
                        check_eof();
                    }
                    //console.log('parsed \'' + result.join('') + '\'');
                    return result.join('');
                }
            parse_count++;
            if( check_eof() ) return result.join('');
        }
    };
    
    function report_error(s) {
        throw new Error(s + ' at line: ' + (line_count - 1)+ '  at uri: ' + uri);
    }
    
    function check_stack(u) {
        if( data_stack.length < u ) report_error('data stack is empty');
    }
    
// -5 -- cfa
// -1 -- flags
//  0 -- NFA
//  1 -- name
//  i -- align to cellSize
//  n -- LFA
    
    
    function get_string(addr) {
       var length = img8[addr];
	   addr++;
       var buf = [];
       buf.length = length;
       for(var i = 0; i < length; i++ )
         buf[i] = String.fromCharCode(img8[addr++]);
       return buf.join('');
    }
        
    function get_nfa(word, wl) {
		if( !wl ) wl = forth_wl_last;
		var nfa = img[wl >> 2];
		//debugger;
		while( nfa ) {
			var name = get_string(nfa);
			if( name == word ) {
				return nfa;
			}
			
			nfa = nfa + 2 + name.length;
			var lfa = align_addr(nfa);
			nfa = img[lfa >> 2];
		}
	}
	
    function create_name(word, last) {
		if( !last ) last = forth_wl_last; // forth wl by default
		
        var here = dp;
        write(0); // cfa
        write_byte(0); // flags
        var nfa = dp;
        write_byte(word.length);
        write_str(word); // nfa
        write(img[last / cellSize]); // lfa
        img[last / cellSize] = last_nfa = nfa;
        
        var odp = dp;
        dp = here;
        write(odp); // fixup cfa
        if( last == forth_wl_last )
			dst_wordlist[word] = odp;
        dp = odp;
    }
    
    var tc_wordlist_imm = {
		"HEX": function() { radix = 16 },
		"DECIMAL": function() { radix = 10 },
		"TC-USER-ALLOT": function() { user_dp += data_stack.pop(); },
		"CHARS" : function() { },
		"SEE": function() {
			check_stack(1);
			var word = data_stack.pop();
			do { 
				var k = img[word >> 2];
				var name = k < primitives.length ? primitives[k] : null;
				if( !name )
					for(var v in dst_wordlist) {
						if( dst_wordlist[v] == k )
							name = v;
					}
				if( !name ) name = 'undefined';
				console.log('address: ' + (word) + ' value: ' + k, ' possible name: ' + name);
				word += cellSize;
			} while(k != primitiveIdx('EXIT'));
		},
        "TYPE": function() {
            check_stack(2);
            data_stack.pop();
            console.log(data_stack.pop());
        },
        ":": function() {
            create_name(parse());
            immediate_state = false;
        },
        "USER" :function() {
            create_name(parse());
            compile_primitive('(USER)');
            write(get_user_dp()); // shift in user data
			//compile_primitive('EXIT');
        },
        "CONSTANT": function() {
			var name = parse();
			var u = data_stack.pop();
			tc_vars[name] = u;
			create_name(name);
			compile_primitive('(LIT)');
			write(u);
			compile_primitive('EXIT');
		},
        "VARIABLE": function() {
			var name = parse();
            create_name(name);
            compile_primitive('(DOES1>)');
            write(0); // for does> ???? здесь то зачем?
            tc_vars[name] = dp;
            write(0);
        },
        "VALUE": function() {
            create_name(parse());
            compile_primitive('(VAL)');
            check_stack(1);
            write(data_stack.pop());
        },
        "VECT": function() {
			create_name(parse());
			compile_primitive('(VECT)');
			write(data_stack.pop());
		},
		"TC-VECT!": function() {
			check_stack(2);
			var vect_cfa = data_stack.pop();
			var exec_cfa = data_stack.pop();
			img[(vect_cfa + cellSize) >> 2] = exec_cfa;
			
		},
		"SAVE-EXC-HANDLER": function() { // ( user-var -- )
			check_stack(1);
			img[2] = img[(data_stack.pop() + cellSize) >> 2];
		},
        "CREATE": function() {
			var name = parse();
            create_name(name);
            compile_primitive('(DOES1>)');
            tc_vars[name] = dp;
            write(0); // for does>
        },
        "USER-CREATE": function() {
			var name = parse();
			create_name(name);
            compile_primitive('(USER)');
            write(user_dp); // shift in user data
		},
        ",": function() {
            check_stack(1);
            write_byte(data_stack.pop());
        },
        "C,": function() {
            check_stack(1);
            write_byte(data_stack.pop());
        },
        "W,": function() {
            check_stack(1);
            write_word(data_stack.pop());
        },
        "INCLUDE": function() {
            check_stack(2);
            data_stack.pop();
            var uri_ = data_stack.pop();
            xmlhttp = new XMLHttpRequest();
            xmlhttp.open("GET", uri_ + '?r=' + Math.random(), true);
            stop_parse = true;
            include_count++;
            xmlhttp.onreadystatechange = function() {
                if( xmlhttp.readyState==4 ) {
                    stop_parse = false;
                    include_count--;
                    if( xmlhttp.status==200 ) {
                        var s = xmlhttp.responseText;
                        include_stack.push({ src: src, parse_count: parse_count, uri: uri, line_count: line_count });
                        parse_count = 0;
                        line_count = 0;
                        src = s;
                        uri = uri_;
                        interpret();
                    } else {
                        report_error(xmlhttp.status);
                    }
                }
            }
            xmlhttp.send(null);
        },
        "\'": function() {
            var word = parse();
            var f = dst_wordlist[word];
            if( !f ) report_error('not found ' + word);
            data_stack.push(f);
        },
        ".":function() {
            check_stack(1);
            console.log(data_stack.pop());
        },
        "!":function() {
            check_stack(2);
            img[data_stack.pop() / cellSize] = data_stack.pop();
        },
        "ALLOT": function() {
            check_stack(1);
            var f = dp + data_stack.pop();
            for(;dp < f; dp++)
                img8[dp] = 0;
        },        
        "S\"": function() {
            var s = parse('\"');
            if( s.length ) {
                //!!! only for target compiler we put javascript string on the data stack
                data_stack.push(s);
                data_stack.push(s.length); // mimicria :)
            }
        },
        "\\\\": function() {
            parse('\n');
        },
        "\\": function() {
            parse('\n');
        },
        "(": function() {
            parse(')');
        },
        "IMMEDIATE": function() {
			img8[last_nfa - 1] = img8[last_nfa - 1] & 1; // set immediate flag 
		}
    }
    
    var tc_wordlist = {
        ";": function() {
            immediate_state = true;
            compile_primitive('EXIT');
        },
        "IF": function() {
            compile_primitive('(?BRANCH)');
            control_stack.push({ addr: dp, type: '?branch'});
            write(0);
        },
        "THEN": function() {
            var start = control_stack.pop();
            if( start.type != '?branch' ) report_error('then without if');
            img[start.addr / cellSize] = dp - start.addr + cellSize; // positive         
        },
        "ELSE": function() {
            var start = control_stack.pop();
            if( start.type != '?branch' ) report_error('else without if');
            compile_primitive('(BRANCH)');      
            img[start.addr / cellSize] = dp - start.addr + cellSize * 2; // positive
            control_stack.push({ addr: dp, type: '?branch'});
            write(0);            
        },
        "?DO": function() {
            compile_primitive('(?DO)');
            write(0);
            control_stack.push({ addr: dp, type: '?do'});
        },
        "DO": function() {
			compile_primitive('2>R');
            control_stack.push({ addr: dp, type: 'do'});      
        },
        "LOOP": function() {
            var start = control_stack.pop();
            if( start.type != 'do' && start.type != '?do' ) report_error('loop without do');
            
			compile_primitive('(LIT)');
			write(1);

            var n = start.addr - dp;
            compile_primitive('(LOOP)');
            write(n); // negative
            
            if( start.type == '?do' )
				img[start.addr / cellSize - 1] = dp - start.addr + doubleCell;
        },
        "+LOOP": function() {
            var start = control_stack.pop();
            if( start.type != 'do' && start.type != '?do' ) report_error('loop without do');
            
            var n = start.addr - dp;
            compile_primitive('(LOOP)');
            write(n); // negative
            
            if( start.type == '?do' )
				img[start.addr / cellSize - 1] = dp - start.addr + doubleCell;
        },
        "BEGIN": function() {
            control_stack.push({ addr: dp, type: 'dest'});
        },
        "[']":function() {
            word = parse();
            if( dst_wordlist[word] ) {
                compile_primitive('(LIT)');
                write(dst_wordlist[word]);
            } else
                report_error('not found ' + word);
                
        },
        "[CHAR]": function() {
            var c = parse();
            compile_primitive('(LIT)');
            write(c.charCodeAt(0));
        },
        "UNTIL": function() {
            var start = control_stack.pop();
            if( start.type != 'dest' ) report_error('until without begin');
            compile_primitive('(?BRANCH)');
            write(start.addr - dp + cellSize);
        },
        "AGAIN": function() {
            var start = control_stack.pop();
            if( start.type != 'dest' ) report_error('again without begin');
            var n = start.addr - dp;
            compile_primitive('(BRANCH)');
            write(n);
        },
        "WHILE": function() {
            var dest = control_stack.pop();
            if( dest.type != 'dest' ) report_error('while without begin');
            compile_primitive('(?BRANCH)');
            control_stack.push({addr:dp, type:'orig'}); // orig
            write(0);
            control_stack.push(dest);
        },
        "REPEAT": function() {
            var dest = control_stack.pop();
            var orig = control_stack.pop();
            if( dest.type != 'dest' ) report_error('repeat without begin');
            if( orig.type != 'orig' ) report_error('repeat without while');
            
            n = dest.addr - dp;
            compile_primitive('(BRANCH)');
            write(n);
            
            img[orig.addr >> 2] = dp - orig.addr + cellSize;
        },
        "CHECK-DEPTH": function() {
            compile_sliteral(' at line: ' + (line_count + 1) + ' at uri: ' + uri);
            compile_primitive('(CHECK-DEPTH)');
        },
        "CHECK-DATA": function() {
            compile_sliteral(' at line: ' + (line_count + 1) + ' at uri: ' + uri);
            compile_primitive('(CHECK-DATA)');
        },        
        "S\"": function() {
            var s = parse('\"');
            if( s.length )
                compile_sliteral(s);
        },
        "(": function() {
            parse(')');
        },
        "\\\\": function() {
            parse('\n');
        },
        "\\": function() {
            parse('\n');
        },
    }
    
    var primitives = [
        "(DOCOL)",
        "(LIT)",
        "(SLIT)",
        "DUP", 
        "DROP",
        "EMIT",
        "TYPE",
        "OVER", 
        "NIP",
        "2DROP",
        "2DUP",
        "(DOES1>)",
        "(DOES2>)",
        "(VAL)",
        "(BRANCH)",
        "(?BRANCH)",
        "COMPARE",
        "CMOVE",
        "FILL",
        "+",
        "-",
        "@",
        "!",
        "C@",
        "C!",
        "W@",
        "W!",
        "XOR",
        "OR",
        "AND",
        "R>",
        ">R",
        "R@",
        "ROT",
        "RSHIFT",
        "LSHIFT",
        "EXECUTE",
        "(CHECK-DEPTH)",
        "(CHECK-DATA)",
        "SWAP",
        "=",
        ">",
        "<",
        "EXIT",
        "_R>", // colon versions
        "_>R",
        "_R@",
        "_EXIT",
        "NEGATE",
        "INVERT",
        "UM*",
        "D+",
        "2>R",
        "2R>",
        "_2>R",
        "_2R>",
        "UM/MOD",
        "2SWAP",
        "U<",
        "CMOVE>",
        "(LOOP)",
        "(?DO)",
        "*",
        "/",
        "(USER)",
        "(VECT)",
        "NOOP",
        "SP@",
        "SP!",
        "RP@",
        "RP!",
        "TO-LOG",
        "U/",
        "TIMER@",
        "..",
        "FATAL-HANDLER"];
        
    
    function primitiveIdx(name) { for(var i in primitives) { if( primitives[i] == name) return i}; return undefined };
    
    function compile_constant_primitives() {
		
		create_name('I');
		compile_primitive('_R@');
		
		create_name('I', compile_wl_last);
		dst_compile['I'] = dp;
		compile_primitive('R@');
		
		for(var i in primitives) {
			var word = primitives[i];
			if( word.charAt(0) == '_' ) {
				// create ordinary word
				create_name(word.slice(1));
				compile_primitive(word);
				compile_primitive('EXIT'); // for see
				
				// create word in compile wl
				create_name(word.slice(1), compile_wl_last);
				var wdp = dp;
				compile_primitive(word.slice(1));
				
				// add exception
				dst_compile[word.slice(1)] = wdp;
			}
		}
		
		for(var i in primitives) {
			
			var word = primitives[i];
			if( word.charAt(0) == '_' || dst_compile[word] ) {
				continue;
			}
			else
				create_name(word);
			if( word.charAt(0) == '(' ) {
				// compile as constant
				compile_literal(i);
				compile_primitive('EXIT');	
			} else {
				// compile as word
				compile_primitive(word);
				compile_primitive('EXIT');
				img8[last_nfa - 1] = img8[last_nfa - 1] | 4; // set primitive flag 			
			}
		}
	}
	
    function next_word() { return parse() };
    function compile_word(cfa) { compile_primitive('(DOCOL)'); write(cfa) };
    
    function is_literal(word) { if(!isNaN(parseInt(word, radix))) return parseInt(word, radix) };
        
    function compile(word) {
        var f;
        if( immediate_state ) f = tc_wordlist_imm[word];
        else
            f = tc_wordlist[word];
        
        
        if( f ) { f.call(); return; }
        else {
			if( dst_compile[word] ) {
				f = primitiveIdx(word);
				write(f);
				return;
			}
			else
				f = dst_wordlist[word];
        }
        
        if( (f || primitiveIdx(word)) && immediate_state ) {
            report_error('Found target word in immediate state: ' + word);
        }
        var ffa = get_nfa(word);
        if( ffa )
            ffa = img8[ffa - 1];
        if( ffa & 4 ) { // primitive
			write(img[f >> 2]);
		} else
        if( f ) compile_word(f)
        else
			if( tc_vars[word] ) {
				if( immediate_state )
					data_stack.push(tc_vars[word]);
				else
					compile_literal(tc_vars[word]);
			} else
            {
                var l = is_literal(word);
                if( typeof(l) == 'number' )
                    if( immediate_state )
                        data_stack.push(l);
                    else
                        compile_literal(l);
                else {
                    report_error(word + ' not found'); 
                }                       
            }
    };
    
    
    function save() {
		return;
		align_cell();

		webkitStorageInfo.requestQuota( 
			webkitStorageInfo.PERSISTENT,

			dp, // amount of bytes you need

			function(availableBytes) {
					if( availableBytes == dp )
						console.log("Quota is available. Image size: " + availableBytes);
					else throw "cannot save image";
				}
			);
		
		window.requestFileSystem  = window.requestFileSystem || window.webkitRequestFileSystem;
		window.requestFileSystem(window.PERSISTENT, 200000, function(fs) {
				fs.root.getFile('forth.img', {create: true  }, 
					function(fileEntry) {
						debugger;
						fileEntry.createWriter(function(fileWriter) {
							debugger;
							var bb = new Blob([img], { type:'application/octet-stream' });
							bb = bb.slice(0, dp);
							fileWriter.write(bb, 'application/octet-stream');
						}, function( e ) { console.log('fileEntry.createWriter error ' + e.code)} );

					}, function( e ) { console.log('fs.root.getFile error ' + e.code)} );

			}, function( e ) { console.log('window.requestFileSystem error ' + e.code)} );

	}
	
    function interpret() {
        do {
            s = next_word();
            
            if( !s.length ) {
                if( !include_count ) {
				   save();
                   if( typeof callback == 'function') callback.call(window, buffer);
			    }
                return;
            }
            compile(s);
        } while (s && !stop_parse)
    }
    
    compile_constant_primitives();
    interpret();
    return buffer;
}

function Forth(buffer) {
    var uimg, img, img16, img8;
    var data_stack;
    var return_stack = []; // todo max size
    var cellSize = 4;
    var doubleSize = 8;
    var dp = 0;
    var low_result;
    var high_result;
    var dp_start = 0;
    
    function throw_err(err) {
		throw err;
	}
    function report_error(s) {
        throw new Error(s);
    }
    
    function check_stack(n) {
        if( n > (dp - dp_start)) {
            report_error('stack depth error');
		}
    }
    function get_string() {
       check_stack(2);
       var length = data_stack[dp--];
       var addr = data_stack[dp--];
       var buf = [];

       buf.length = length;
       for(var i = 0; i < length; i++ )
         buf[i] = String.fromCharCode(img8[addr++]);
       return buf.join('');
    }
    
    function aligned(n) {
        var d = n % cellSize;
        if( d )
            return n + cellSize - d;
        else return n;
    }
    // a * b = (long) d
    function imul32(a, b) {
		if( a < 65535 && b < 65535 ) {
			low_result = a * b;
			high_result = 0;
			return;
		}
		var a00 = a & 0xFFFF;
		var a16 = a >>> 16;
		var b00 = b & 0xFFFF;
		var b16 = b >>> 16;
		var c00 = a00 * b00;
		var c16 = c00 >>> 16;
		var c32 = 0;
		var c48 = 0;
		c00 &= 0xFFFF;
		
		c16 += a16 * b00;
		c32 += c16 >>> 16;
		c16 &= 0xFFFF;
		
		c16 += a00 * b16;
		c32 += c16 >>> 16;
		c16 &= 0xFFFF;
		
		c32 += a16 * b16;
		c48 += c32 >>> 16;
		c32 &= 0xFFFF;
		low_result = (c16 << 16) | c00;
		high_result = (c48 << 16) | c32;
	}
	
	function correct_sign(a, b) {
		if( a < 0 ) {
			if( b < 0 ) {
				a = -a;
				b = -b;
			} else {
				a = -a;				
				return true;
			}
		} else {
			if( b < 0 ) {
				b = -b;
				return true;
			}
		}
		
	}
		
	// +a + +b = (long) d
    function iadd32(a, b) {
		// todo: optimize small case
		
		var a00 = a & 0xFFFF;
		var a16 = a >>> 16;
		var b00 = b & 0xFFFF;
		var b16 = b >>> 16;
		
		var c32 = 0, c16 = 0, c00 = 0;
		c00 = a00 + b00;
		c16 += c00 >>> 16;
		c00 &= 0xFFFF;
		
		c16 += a16 + b16;
		c32 += c16 >>> 16;
		c16 &= 0xFFFF;
		
		high_result = c32;
		low_result = (c16 << 16) | c00;
	}
	
	function udivmod(high, low, u) {
		if( !high ) {
			high_result = low / u;
			low_result = low % u;
			return;
		}
		
		var remainder = 0;		

		for (i = 0; i < 64; i++)
		{
			var sbit = (1 << 31) & high;
			remainder <<= 1;
			if (sbit) remainder |= 1;
        
			high = (high << 1) | ((low & 0x80000000) >>> 31);
        
			low = low << 1;

			if (remainder >= u)
			{
				remainder -= u;
				low |= 1;
			}
		}

		high_result = low;
		low_result = remainder;
	}
	
	// todo: copy by cell may be faster
    function sliceImage(buffer, newSize) {
        var that = new Uint8Array(buffer);
        var result = new ArrayBuffer(buffer.byteLength > newSize ? buffer.byteLength : newSize);
        var resultArray = new Uint8Array(result);
        for (var i = 0; i < resultArray.length; i++)
           resultArray[i] = that[i];
        return result;
    }
    	
    function inner_loop(){
		var word = 0;
        do{
            word = img[ip >> 2];
            switch( word ) {
				case 0: // do colon
					return_stack.push(ip + doubleSize);
					ip = uimg[(ip + cellSize) >> 2];
					break;
                case 1:  // lit
                    data_stack[++dp] = img[(ip + cellSize) >> 2];
                    ip += doubleSize;
                    break;
                case 2:  // slit
                {
                    data_stack[++dp] = ip + doubleSize;
                    var l = img[(ip + cellSize) >> 2];
                    data_stack[++dp] = l;
                    l++;
                    ip += doubleSize + aligned(l);
                    break;
                }
                case 3:  // dup
                    data_stack[dp + 1] = data_stack[dp];
                    dp++;
                    ip += cellSize;
                    break;  
                case 4:  // drop
                    dp--;
                    ip += cellSize;
                    break;
                case 5: // emit
                    this.emit(data_stack[dp--]);
                    ip += cellSize;
                    break;
                case 6: // type
                    this.type(get_string());
                    ip += cellSize;
                    break;
                case 7: // over
                    data_stack[dp + 1] = data_stack[dp - 1];
                    dp++;
                    ip += cellSize;
                    break;
                case 8: // nip
                    data_stack[dp - 1] = data_stack[dp];
                    dp--;
                    ip += cellSize;
                    break;
                case 9: // 2drop
                    dp -= 2;
                    ip += cellSize;
                    break;
                case 10: // 2dup
                    data_stack[dp + 1] = data_stack[dp - 1];
                    data_stack[dp + 2] = data_stack[dp];
                    dp += 2;
                    ip += cellSize;
                    break;
                case 11: // (does1>)
                    data_stack[++dp] = ip + doubleSize;
                    ip = return_stack.pop();
                    break;
                case 12: // (does2>)
                    data_stack[++dp] = ip + doubleSize;
                    ip += uimg[(ip + cellSize) >> 2]; // only positive branch
                    break;
                case 13: // (val)
                    data_stack[++dp] = img[(ip + doubleSize) >> 2];
                    ip = return_stack.pop();
                    break;
                case 14: // (branch)
                    ip += img[(ip + cellSize) >> 2];
                    break;
                case 15: // (?branch)
                    if( data_stack[dp--] )
                        ip += doubleSize;
                    else
                        ip += img[(ip + cellSize) >> 2];
                    break;
                case 16: // compare
                {
                    // todo: optimize with char by char version
                    var str1 = get_string();
                    var str2 = get_string();
                    data_stack[++dp] = ( ( str1 == str2 ) ? 0 : ( ( str1 > str2 ) ? 1 : -1 ) );
                    ip += cellSize;
                    break;
                }
                case 17: // cmove
                {
                    var u = data_stack[dp--];
                    var addr2 = data_stack[dp--];
                    var addr1 = data_stack[dp--];
                    while(u--) img8[addr2++] = img8[addr1++];
                    ip += cellSize;
                    break;
                }
                case 18: // fill
                {
                    var c = data_stack[dp--];
                    var u = data_stack[dp--];
                    var addr = data_stack[dp--];
                    while(u--) img8[addr++] = c;
                    ip += cellSize;
                    break;
                }
                case 19: // +
                    data_stack[dp-1] = data_stack[dp-1] + data_stack[dp];
                    dp--;
                    ip += cellSize;
                    break;
                case 20: // -
                    data_stack[dp-1] = data_stack[dp-1] - data_stack[dp];
                    dp--;
                    ip += cellSize;
                    break;
                case 21: // @
                    data_stack[dp] = img[data_stack[dp] >> 2];
                    ip += cellSize;
                    break;
                case 22: // !
                    img[data_stack[dp] >> 2] = data_stack[dp-1];
                    dp -= 2;
                    ip += cellSize;
                    break;
                case 23: // C@
                    data_stack[dp] = img8[data_stack[dp]];
                    ip += cellSize;
                    break;
                case 24: // C!
                    img8[data_stack[dp]] = data_stack[dp-1];
                    dp -= 2;
                    ip += cellSize;
                    break;
                case 25: // W@
                    data_stack[dp] = img16[data_stack[dp] >> 1];
                    ip += cellSize;
                    break;
                case 26: // W!
                    img16[data_stack[dp] >> 1] = data_stack[dp-1];
                    dp -= 2;
                    ip += cellSize;
                    break;
                case 27: // xor
                    data_stack[dp-1] = udata_stack[dp-1] ^ udata_stack[dp];
                    dp--;
                    ip += cellSize;
                    break;
                case 28: // or
                    data_stack[dp-1] = udata_stack[dp-1] | udata_stack[dp];
                    dp--;
                    ip += cellSize;
                    break;
                case 29: // and
                    data_stack[dp-1] = udata_stack[dp-1] & udata_stack[dp];
                    dp--;
                    ip += cellSize;
                    break;
                case 30: // r>
                    udata_stack[++dp] = return_stack.pop();
                    ip += cellSize;
                    break;
                case 31: // >r
                    return_stack.push(udata_stack[dp--]);
                    ip += cellSize;
                    break;
                case 32: // r@
                    udata_stack[++dp] = return_stack[return_stack.length - 1];
                    ip += cellSize;
                    break;
                case 33: // rot
                    {
                        var a = data_stack[dp];
                        data_stack[dp] = data_stack[dp-2];
                        data_stack[dp-2] = data_stack[dp-1];
                        data_stack[dp-1] = a;
                        ip += cellSize;
                        break;
                    }
                case 34: // rshift
                        data_stack[dp-1] = udata_stack[dp-1] >> udata_stack[dp];
                        dp--;
                        ip += cellSize;
                        break;
                case 35: // lshift
                        data_stack[dp-1] = udata_stack[dp-1] << udata_stack[dp];
                        dp--;
                        ip += cellSize;
                        break;
                case 36: // execute
                        return_stack.push(ip + cellSize);
                        ip = udata_stack[dp--];
                        break;
                case 37: // check-depth
                {
                        check_stack(3);

                        var s = get_string();
                        var n = data_stack[dp--];
                        var dp2 = dp - dp_start;
                        if( n != dp2) report_error('depth wrong, it is: ' + dp2 + s);
                        dp = dp_start;
                        ip += cellSize;
                        break;
                }
                case 38: // check-data
                {
                    check_stack(5);
                    var s = get_string();
                    var i = data_stack[dp--]; // count
                    check_stack(i * 2);
                    for(var k = 0; k < i; k++)
                        if( data_stack[dp - k] != data_stack[ dp - k - i] )
                            report_error('data is wrong, it is ' + (k + 1) + ' th element of stack and it is ' + data_stack[ dp - k - i] + s);
                    dp = dp_start;
                }
                case 39: // swap
                    {
                        var a = data_stack[dp];
                        data_stack[dp] = data_stack[dp -1];
                        data_stack[dp-1] = a;
                        ip += cellSize;
                        break;
                    }
                case 40: // =
                    data_stack[dp-1] = (data_stack[dp-1] === data_stack[dp]) ? -1 : 0;
                    dp--
                    ip += cellSize;
                    break;
                case 41: // >
                    data_stack[dp-1] = (data_stack[dp-1] > data_stack[dp]) ? -1 : 0;
                    dp--
                    ip += cellSize;
                    break;
                case 42: // <
                    data_stack[dp-1] = (data_stack[dp-1] < data_stack[dp]) ? -1 : 0;
                    dp--
                    ip += cellSize;
                    break;
                case 43:  // exit
                    if( !return_stack.length ) { console.log('finished'); return };
                    ip = return_stack.pop();
                    break;
                case 44: // _R>
					ip = return_stack.pop();
					data_stack[++dp] = return_stack.pop();
					break;
				case 45: // _>R
					ip = return_stack.pop();
					return_stack.push(data_stack[dp--]);
					break;
				case 46: // _R@
					ip += return_stack.pop();
					data_stack[++dp] = return_stack[return_stack.length - 1];
					break;
				case 47: // _EXIT
					return_stack.pop();
					if( !return_stack.length ) { console.log('finished'); return };
					ip = return_stack.pop();
					break;
				case 48: // NEGATE
					data_stack[dp] = -data_stack[dp];
					ip += cellSize;
					break;
				case 49: // INVERT
					data_stack[dp] = data_stack[dp] ^ 0xFFFFFFFF;
					ip += cellSize;
					break;
				case 50: // UM*
					imul32(data_stack[dp], data_stack[dp - 1]);
					data_stack[dp - 1] = low_result;
					data_stack[dp] = high_result;
					ip += cellSize;
					break;
				case 51: // D+
					var h0 = data_stack[dp];
					var l0 = data_stack[dp - 1];
					var h1 = data_stack[dp - 2];
					var l1 = data_stack[dp - 3];
					dp -= 2;
					
					iadd32(l0, l1);
					data_stack[dp - 1] = low_result;					
					data_stack[dp] = h0 + h1 + high_result;
					ip += cellSize;
					break;
				case 52: // 2>R
					return_stack.push(udata_stack[dp-1]);
					return_stack.push(udata_stack[dp]);
					dp -= 2;
					ip += cellSize;
					break;
				case 53: // 2R>
					udata_stack[dp + 2] = return_stack.pop();
					udata_stack[dp + 1] = return_stack.pop();
					dp += 2;
					ip += cellSize;
					break;
				case 54: // _2>R
					ip = return_stack.pop();
					return_stack.push(udata_stack[dp-1]);
					return_stack.push(udata_stack[dp]);
					dp -= 2;
					break;
				case 55: // _2R>
					ip = return_stack.pop();
					udata_stack[dp + 2] = return_stack.pop();
					udata_stack[dp + 1] = return_stack.pop();
					dp += 2;
					break;
				case 56: // um/mod
					if( !data_stack[dp] ) { throw_err(-10); break; }
					udivmod(data_stack[dp - 1], data_stack[dp - 2], data_stack[dp]);
					dp--;
					data_stack[dp - 1] = low_result;
					data_stack[dp] = high_result;
					ip += cellSize;
					break;
				case 57: // 2swap
					{
						var a = data_stack[dp];
                        data_stack[dp] = data_stack[dp -2];
                        data_stack[dp-2] = a;
						
						a = data_stack[dp - 1];
                        data_stack[dp - 1] = data_stack[dp -3];
                        data_stack[dp-3] = a;
                        ip += cellSize;
                        break;
					}
				case 58: // U<
				    udata_stack[dp-1] = (udata_stack[dp-1] < udata_stack[dp]) ? -1 : 0;
                    dp--
                    ip += cellSize;
                case 59: // cmove>
                {
                    var u = data_stack[dp--];
                    var addr2 = data_stack[dp--];
                    var addr1 = data_stack[dp--];
                    while(u--) img8[addr2 + u] = img8[addr1 + u];
                    ip += cellSize;
                    break;
                }
                case 60: // (loop)
					{
						var i = return_stack.length - 1;
						return_stack[i] += data_stack[dp--];
						if( return_stack[i] >= return_stack[i-1] ) {
							return_stack.pop();
							return_stack.pop();
							ip += doubleSize; // leave a cycle
						} else {
							ip += img[(ip + cellSize) >> 2];
						}
					}
					
					break;				
				case 61: // (?do)
					if( data_stack[dp] >= data_stack[dp-1] ) {
						ip += img[(ip + cellSize) >> 2];
					} else {
						// initialize
						return_stack.push(udata_stack[dp-1]);
						return_stack.push(udata_stack[dp]);
						ip += doubleSize;
					}
					dp -= 2;
					break;
				case 62: // *
					data_stack[dp-1] = data_stack[dp-1] * data_stack[dp];
					dp--;
					break;
				case 63: // /
					var a = data_stack[dp-1] / data_stack[dp];
					if( !isFinite(a) ) throw new ForthError(-10, 'division by zero');
					break;
				case 64: // (user)
					data_stack[++dp] = img[(ip + cellSize) >> 2] + user_dp;
					ip = return_stack.pop();
					break;
                case 65: // (vect)
					ip = img[(ip + cellSize) >> 2];
					break;
				case 66: // noop
					ip += cellSize;
					break;
				case 67: // sp@
				{
					var sp = dp;
					data_stack[++dp] = sp;
					ip += cellSize;
					break;	
				}
				case 68: // sp!
					dp = data_stack[dp];
					ip += cellSize;
					break;
				case 69: // rp@
					data_stack[++dp] = return_stack.length;
					ip += cellSize;
					break;
				case 70: // rp!
					return_stack.length = data_stack[dp--];
					ip += cellSize;
					break;
				case 71: // to-log
					this.log(get_string());
					ip += cellSize;
					break;
				case 72: // U/
					udata_stack[dp-1] = udata_stack[d-1] / udata_stack[dp];
					dp--;
					break;
				case 73: // TIMER@
					data_stack[++dp] = Date.now();
					data_stack[++dp] = 0;
					ip += cellSize;
					break;
				case 74: // (.)
					var s = 'stack: ';
					for(var i = dp_start + 1; i <= dp; i++)
						s += ' ' + data_stack[i];
					console.log(s);
					ip += cellSize;
					break;
				case 75:
					this.fatalhandler();
					ip += cellSize;
					break;
				
					
            }
        }while(true);
    }
    img = new Int32Array(buffer);
    var imageSize = buffer.byteLength;

    var data_stack_size = 2000;
    var data_space_size = 50000;
    var user_data_size = img[1] > 30000 ? img[1] : 30000;
    
    buffer = sliceImage(buffer, imageSize
		+ data_space_size // data
		+ data_stack_size // data stack
		+ user_data_size
	);

   	
    img = new Int32Array(buffer);
    uimg = new Uint32Array(buffer);
    img8 = new Uint8Array(buffer);
    img16 = new Uint16Array(buffer);
    
    data_stack = img;
    udata_stack = uimg;
    user_dp = imageSize + data_space_size + data_stack_size;
	dp = dp_start = (imageSize + data_space_size) >> 2;
   	    
    // get start addr
    var ip = img[0];
    
    this.emit = function(c) {
        console.log(String.fromCharCode(c));
    }
    this.type = function(c) {
        console.log(c);
    }
    this.log = function(c) {
		console.log(c);
	}
	
	this.fatalhandler = function() {
		
		throw new ForthError(data_stack[dp], "Unhandheld exception");
	}
	
    this.start = function() {
		var keep = true;
		do {
		try {
			inner_loop.call(this);
			keep = false;
		} catch(e) {
			var handler = img[(img[2] + user_dp) >> 2];
			
			if( e instanceof ForthError )
				this.log((handler ? 'Forth error: ' : 'Unhandled forth error ') + e.err + ': ' + e.message);
			else
				this.log((handler ? 'Forth error: ' : 'Unhandled forth error ') + (e.message ? e.message : e));
				

			if( handler ) {			 
				return_stack.length = handler;
				img[(img[2] + user_dp) >> 2] = return_stack.pop(); // previous handler
				dp = return_stack.pop();
				ip = return_stack.pop();
				data_stack[++dp] = isFinite(e.err) ? e.err : -3000;
				inner_loop.call(this);
			} else
				keep = false;
		}
		} while(keep);
    }
}
	
TC('S" test.f" INCLUDE', function(img) {
    var fs = new Forth(img);
    fs.start();
});
