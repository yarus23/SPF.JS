// todo: variables as lit's
// todo: проверка стека в медленных операциях
// todo: проверить что если сделать без docol на сравнении
// todo: печать описания ошибки тестов
// todo: -1 2/ и -1 2 / дают разные результаты
// todo: проверять границы стеков в global.push и т.п.
// todo: печать стека форт слов по throw
// todo: -1 allocate в spf4 работает в не должен
// todo: инлайнить короткие слова
// todo: зачем в global data_staack и return_stack
// todo кеш поиск проверять что нашли возможно там smudge
// todo: execute в global
// todo: зачем ф-ям return и data_stack без sp/rp
// todo: переделать dp на sp
// todo: подсовывать файловый дескриптор accept
// todo: поддержка forth 200x
// todo: ошибку если ушли за allot 
// todo: unused родной
"use strict";

var isNode = false;

var fs;
var path;
var isNode;

if (typeof module !== 'undefined' && module.exports) {
    fs = require('fs')
    path = require('path');
    isNode = true;
}


var TC = function(src, callback) {

    var data_space_size = 200000;
    var parse_count = 0;
    var include_stack = [];
    // search order: tc_wordlist_imm or tc_wordlist -> forth wordlist
    var dst_compile = {}; // R@ EXIT and so on
    var buffer = new ArrayBuffer(data_space_size);
    var img = new Int32Array(buffer);
    var img8 = new Uint8Array(buffer);
    var img16 = new Uint16Array(buffer);

    var dp = 0; // in bytes!!!
    var primitives_end = 0;
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
    var test_wl = {}; // map of test words
    var last_colon = 0;

    /* structure of image
     * 4 - start cfa
     * 4 - user data length
     * 4 - exc handler address, shift in user data
     */

    function write(u) {
        align_cell();
        img[dp / cellSize] = u;
        dp += cellSize;

        if (dp >= data_space_size) report_error("Not sufficient data space!");
    }
    write(0); // init cfa
    write(0); // user data len
    write(0); // exc handler chain
    write(0); // fatal exc handler cfa

    var voc_list = 0;

    function create_wordlist() {
        var tmp = dp;
        write(voc_list);
        voc_list = tmp;
        var wid = dp;
        write(0); // last-name address
        write(0); // reserved for spf compatibility
        write(0); // reserved for spf compatibility
        write(0); // reserved for spf compatibility	
        return wid;
    }
    var forth_wordlist = create_wordlist();
    var forth_wl_last = voc_list + cellSize;

    create_wordlist();
    var compile_wl_last = voc_list + cellSize;



    function align_addr(addr) {
        //console.log(addr);
        if (!(addr % cellSize)) return addr;
        return addr + cellSize - addr % cellSize;
    }

    function align_cell() {
        dp = align_addr(dp);
    }

    function align_word() {
        dp += dp & 1;
    }

    function alloc_user_cell() {
        user_dp = align_addr(user_dp);
        return (img[1] = user_dp += cellSize) - cellSize;
    }


    function write_byte(b) {
        img8[dp++] = b;
        if (dp >= data_space_size) report_error("Not sufficient data space!");
    }

    function write_word(b) {
        align_word();
        img8[dp / cellSize / 2] = b;
        dp += 2;
        if (dp >= data_space_size) report_error("Not sufficient data space!");
    }

    function compile_literal(n) {
        write(primitiveIdx('(LIT)'));
        write(n);
    }

    function write_str(s) {
        for (var i = 0; i < s.length; i++)
            write_byte(s.charCodeAt(i));
    }

    function compile_sliteral(s) {
        write(primitiveIdx('(SLIT)'));
        write_byte(s.length);
        write_str(s);
        write_byte(0);
        align_cell();
    }

    function compile_primitive(s) {
        var n = primitiveIdx(s);
        if (n < 0) report_error('cannot find ' + s);
        write(n);
    }

    function check_eof() {
        if (parse_count >= src.length) {
            if (include_stack.length) {
                var context = include_stack.pop();
                src = context.src;
                parse_count = context.parse_count;
                uri = context.uri;
                line_count = context.line_count;
            } else
                return true;
        }
    }

    function parse_word() {

        function skipDelimiters() {
            do {
                var c = src.charCodeAt(parse_count);
                if (c === 0x0A) line_count++;
                if (c > 32) break;
                parse_count++;
            } while (!check_eof())
        }

        skipDelimiters();

        if (check_eof()) return ""; // end of files

        var result = [];
        do {
            //console.log("parsed word " + src.charAt(parse_count) + ':' + src.charCodeAt(parse_count));
            result.push(src.charAt(parse_count));
            parse_count++;
        } while (!check_eof() && src.charCodeAt(parse_count) > 32);


        if (!check_eof() && src.charCodeAt(parse_count) != 0x0A) {
            //console.log("skipped word " + src.charAt(parse_count) + ':' + src.charCodeAt(parse_count));
            parse_count++;
        }

        return result.join('');
    }


    function parse(sym) {

        var result = [];

        do {
            var c = src.charCodeAt(parse_count);
            if (c === 0x0A) line_count++;
            //console.log("parsed " + src.charAt(parse_count) + ':' + c);
            parse_count++;
            if (c === sym.charCodeAt(0) || c === 0x0A) break;

            result.push(src.charAt(parse_count - 1));

        } while (!check_eof());

        return result.join('');

    };

    function report_error(s) {
        throw new Error(s + ' at line: ' + (line_count - 1) + '  at uri: ' + uri);
    }

    function check_stack(u) {
        if (data_stack.length < u) report_error('data stack is empty');
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
        for (var i = 0; i < length; i++)
            buf[i] = String.fromCharCode(img8[addr++]);

        return buf.join('');
    }

    function get_cfa(nfa) {
        return img[(nfa - cellSize - 1) >> 2];
    }

    function get_nfa(word, wl) {
        if (!wl) wl = forth_wl_last;
        var nfa = img[wl >> 2];
        //debugger;
        while (nfa) {
            var name = get_string(nfa);
            if (name == word) {
                return nfa;
            }

            nfa = nfa + 1 + name.length;
            var lfa = align_addr(nfa);
            nfa = img[lfa >> 2];
        }
    }

    var dst_cache = {};

    function find(name) {
        var c = dst_cache[name];
        if (c) return c;

        var nfa = get_nfa(name);
        if (!nfa) return;
        dst_cache[name] = get_cfa(nfa);
        return get_cfa(nfa);
    }

    function smudge() {
        img8[last_nfa + 1] ^= 12;
        dst_cache[get_string(last_nfa)] = undefined;
    }

    function create_name(word, last) {
        if (!last) last = forth_wl_last; // forth wl by default

        align_cell();
        var here = dp;
        write(0); // cfa
        write_byte(0); // flags
        var nfa = dp;
        write_byte(word.length);
        write_str(word); // nfa
        align_cell();
        write(img[last / cellSize]); // lfa
        img[last / cellSize] = last_nfa = nfa;

        img[here / cellSize] = dp; // fixup cfa

        dst_cache[word] = undefined; // remove possible old similar entries

        //console.log("created " + word + ", nfa: " + nfa);
    }


    var tc_wordlist_imm = {
        "]": function() {
            immediate_state = false;
        },
        "COMPILE,": function() {
            write(data_stack.pop())
        },
        "LIT,": function() {
            compile_primitive('(LIT)');
            write(data_stack.pop());
        },
        "CHAR": function() {
            data_stack.push(parse(' ').charCodeAt(0));
        },
        "CR": function() {},
        "HERE": function() {
            data_stack.push(dp)
        }, // todo: давать в целевом!!!
        "HEX": function() {
            radix = 16
        },
        "INVERT": function() {
            data_stack.push(data_stack.pop() ^ 0xFFFFFFFF)
        },
        "CELLS": function() {
            data_stack.push(data_stack.pop() * cellSize)
        },
        "CELL+": function() {
            data_stack.push(data_stack.pop() + cellSize)
        },
        "ALIGN": function() {
            align_cell();
        },
        //"ALIGNED": function() { data_stack.push(align_addr(data_stack.pop())) },
        "RSHIFT": function() {
            var shift = data_stack.pop();
            data_stack.push(data_stack.pop() >>> shift);
        },
        "PRIMITIVES-END": function() {
            data_stack.push(primitives_end);
        },
        "DECIMAL": function() {
            radix = 10
        },
        "TC-USER-ALLOT": function() {
            img[1] = user_dp += data_stack.pop();
        },
        "CHARS": function() {},
        "JS:": function() {
            var name = parse_word();
            create_name(name);
            compile_primitive("(JS-COLON)");
            write(last_nfa);
        },
        "REPORT": function() {
            console.log("bytes compiled: " + dp);
        },
        "SEE": function() {
            /*
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
			} while(k != primitiveIdx('EXIT'));*/
        },
        "TYPE": function() {
            check_stack(2);
            data_stack.pop();
            console.log(data_stack.pop());
        },
        ":": function() {
            create_name(parse_word());
            smudge();
            immediate_state = false;
        },
        "USER": function() {
            var name = parse_word();
            create_name(name);
            compile_primitive('(USER)');
            var shift = alloc_user_cell();
            write(shift); // shift in user data
            //console.log("created user variable " + name + " shift: " +shift); 
            //compile_primitive('EXIT');
        },
        "CONSTANT": function() {
            var name = parse_word();
            var u = data_stack.pop();
            tc_vars[name] = u;
            create_name(name);
            compile_primitive('(LIT)');
            write(u);
            compile_primitive('EXIT');
        },
        "VARIABLE": function() {
            var name = parse_word();
            create_name(name);
            compile_primitive('(CREATE-CODE)');
            write(0); // for does> 
            tc_vars[name] = dp;
            write(0);
        },
        "VALUE": function() {
            create_name(parse_word());
            var tovcfa = find("TOVAL-CODE");
            if (!tovcfa) report_error("cannot find TOVAL-CODE");
            compile_primitive('(VAL)');
            check_stack(1);
            write(data_stack.pop());
            write(tovcfa);
        },
        "USER-VALUE": function() {
            create_name(parse_word());
            var touvcfa = find('TOUSERVAL-CODE');
            if (!touvcfa) report_error("cannot find TOUSERVAL-CODE");
            compile_primitive('(USER-VALUE)');
            write(alloc_user_cell()); // shift in user data
            write(touvcfa);
        },
        "VECT": function() {
            create_name(parse_word());
            compile_primitive('(VECT)');
            write(0);
            var tovcfa = find("TOVAL-CODE");
            write(tovcfa);
        },
        "TC-VECT!": function() {
            check_stack(2);
            var vect_cfa = data_stack.pop();
            var exec_cfa = data_stack.pop();
            img[(vect_cfa + cellSize) >> 2] = exec_cfa;

        },
        "TC-VOC-LIST": function() {
            data_stack.push(voc_list);
        },
        "--": function() {
            var name = parse_word();
            create_name(name);
            compile_primitive('(LIT)');
            var shift = data_stack.pop();
            var base = data_stack.pop();
            write(base);
            data_stack.push(base + shift);
            compile_primitive('+');
            compile_primitive('EXIT');
        },
        "SAVE-EXC-HANDLER": function() { // ( user-var -- )
            check_stack(1);
            img[2] = img[(data_stack.pop() + cellSize) >> 2];
        },
        "CREATE": function() {
            var name = parse_word();
            create_name(name);
            compile_primitive('(CREATE-CODE)');
            write(0); // for does>
            //tc_vars[name] = dp;            
        },
        "TC-WORDLIST": function() {
            data_stack.push(forth_wordlist);
        },
        "WORDLIST": function() {
            data_stack.push(create_wordlist());
        },
        "USER-CREATE": function() {
            var name = parse_word();
            create_name(name);
            compile_primitive('(USER)');
            write(alloc_user_cell()); // shift in user data
            //console.log("created user create var " + name + " shift: " + user_dp); 
        },
        ",": function() {
            check_stack(1);
            write(data_stack.pop());
        },
        "C,": function() {
            check_stack(1);
            write_byte(data_stack.pop());
        },
        "W,": function() {
            check_stack(1);
            write_word(data_stack.pop());
        },
        "INCLUDED": function() {
            check_stack(2);
            data_stack.pop();
            var uri_ = data_stack.pop();
            stop_parse = true;
            include_count++;

            if (!isNode) { // run under node js             
                xmlhttp = new XMLHttpRequest();
                xmlhttp.open("GET", uri_ + '?r=' + Math.random(), true);
                xmlhttp.onreadystatechange = function() {
                    if (xmlhttp.readyState == 4) {
                        stop_parse = false;
                        include_count--;
                        if (xmlhttp.status == 200) {
                            var s = xmlhttp.responseText;
                            include_stack.push({
                                src: src,
                                parse_count: parse_count,
                                uri: uri,
                                line_count: line_count
                            });
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
            } else {
                fs.readFile(path.join(__dirname, uri_), 'utf8', function(err, data) {
                    if (err)
                        report_error(err);
                    else {
                        stop_parse = false;
                        include_count--;
                        var s = data;
                        include_stack.push({
                            src: src,
                            parse_count: parse_count,
                            uri: uri,
                            line_count: line_count
                        });
                        parse_count = 0;
                        line_count = 0;
                        src = s;
                        uri = uri_;
                        interpret();
                    }
                });
            }
        },
        "C\'": function() {
            var word = parse_word();
            var f = find(word);
            if (!f) {
                report_error('not found ' + word);
                return;
            }
            data_stack.push(f);
        },
        "\'": function() {
            var word = parse_word();
            var f = primitiveIdx(word);
            //console.log('requested name ' + word, f);
            if (f < 0) {
                f = find(word);
                if (!f) {
                    report_error('not found ' + word);
                    return;
                }
            }
            data_stack.push(f);
        },
        "FETCH": function() {
            var word = parse_word();
            var f = primitiveIdx(word);
            if (f < 0) {
                f = find(word);
                if (!f) {
                    report_error('not found ' + word);
                    return;
                }
            }
            data_stack.push(img[f / cellSize + 1]);

        },
        ".": function() {
            check_stack(1);
            console.log(data_stack.pop());
        },
        "!": function() {
            check_stack(2);
            img[data_stack.pop() / cellSize] = data_stack.pop();
        },
        "ALLOT": function() {
            check_stack(1);
            var f = dp + data_stack.pop();
            for (; dp < f; dp++)
                img8[dp] = 0;
        },
        "S\"": function() {
            var s = parse('\"');
            if (s.length) {
                //!!! only for target compiler we put javascript string on the data stack
                data_stack.push(s);
                data_stack.push(s.length); // mimicria :)
            }
        },
        "S,": function() {
            data_stack.pop();
            var str = data_stack.pop();
            for (var i = 0; i < str.length; i++)
                img8[dp++] = str.charCodeAt(i);
            img8[dp++] = 0;
        },
        "\\\\": function() {
            parse('\n');
        },
        "\\": function() {
            parse('\n');
        },
        "(": function() {
            var s = parse(')');
        },
        "IMMEDIATE": function() {
            img8[last_nfa - 1] |= 1; // set immediate flag 
        },
        "T{": function() {
            var name = 'test' + dp;
            create_name(name);
            test_wl[name] = dp;
            immediate_state = false;
        },
        "EOF": function() {
            if (include_stack.length) {
                var context = include_stack.pop();
                src = context.src;
                parse_count = context.parse_count;
                uri = context.uri;
                line_count = context.line_count;
            }
        },
        "COMPILE-TESTS": function() {
            create_name('TESTER');
            for (var i in test_wl) {
                compile_word(test_wl[i]);
            }
            compile_primitive('EXIT');
        },
        "TESTING": function() {
            var n = parse('\n');
            console.log('TESTING ' + n);
        },
        "FALSE": function() {
            data_stack.push(0);
        }
    }

    var tc_wordlist = {
        "[COMPILE]": function() {
            var word = parse_word();
            var f = find(word);
            if (!f) report_error('not found ' + word);
            compile_word(f);
        },
        "POSTPONE": function() {
            var word = parse_word();
            var f = find(word);
            if (!f) report_error('not found ' + word);
            compile_word(f);
        },
        "[": function() {
            immediate_state = true;
        },
        ";;": function() {
            immediate_state = true;
            compile_primitive('EXIT');
            smudge();
        },
        ";": function() {
            immediate_state = true;
            smudge();
            // tail optimization
            if (last_colon == (dp - cellSize * 2)) {
                img[(dp - cellSize * 2) >> 2] = primitiveIdx('(JMP)');
            }
            // in case on THEN 
            compile_primitive('EXIT');
        },
        "IF": function() {
            compile_primitive('(?BRANCH)');
            control_stack.push({
                addr: dp,
                type: 'orig'
            });
            write(0);
        },
        "THEN": function() {
            var start = control_stack.pop();
            if (start.type != 'orig') report_error('then without if');
            img[start.addr / cellSize] = dp - start.addr + cellSize; // positive         
        },
        "ELSE": function() {
            var start = control_stack.pop();
            if (start.type != 'orig') report_error('else without if');
            compile_primitive('(BRANCH)');
            img[start.addr / cellSize] = dp - start.addr + cellSize * 2; // positive
            control_stack.push({
                addr: dp,
                type: 'orig'
            });
            write(0);
        },
        "?DO": function() {
            compile_primitive('(?DO)');
            write(0);
            control_stack.push({
                addr: dp,
                type: '?do'
            });
        },
        "DO": function() {
            compile_primitive('(DO)');
            write(0); // for leave
            control_stack.push({
                addr: dp,
                type: 'do'
            });
        },
        "LOOP": function() {
            var start = control_stack.pop();
            if (start.type != 'do' && start.type != '?do') report_error('loop without do');


            var n = start.addr - dp;
            compile_primitive('(LOOP)');
            write(n); // negative

            img[start.addr / cellSize - 1] = dp - start.addr + doubleCell;
        },
        "+LOOP": function() {
            var start = control_stack.pop();
            if (start.type != 'do' && start.type != '?do') report_error('loop without do');


            var n = start.addr - dp;
            compile_primitive('(+LOOP)');
            write(n); // negative

            img[start.addr / cellSize - 1] = dp - start.addr + doubleCell;
        },
        "BEGIN": function() {
            control_stack.push({
                addr: dp,
                type: 'dest'
            });
        },
        "[']": function() {
            var word = parse_word();
            var cfa = find(word);
            if (cfa) {
                compile_primitive('(LIT)');
                write(cfa);
            } else
                report_error('not found ' + word);

        },
        "[CHAR]": function() {
            var c = parse(' ');
            compile_primitive('(LIT)');
            write(c.charCodeAt(0));
        },
        "UNTIL": function() {
            var start = control_stack.pop();
            if (start.type != 'dest') report_error('until without begin');
            compile_primitive('(?BRANCH)');
            write(start.addr - dp + cellSize);
        },
        "AGAIN": function() {
            var start = control_stack.pop();
            if (start.type != 'dest') report_error('again without begin');
            var n = start.addr - dp;
            compile_primitive('(BRANCH)');
            write(n);
        },
        "WHILE": function() {
            var dest = control_stack.pop();
            if (dest.type != 'dest') report_error('while without begin');
            compile_primitive('(?BRANCH)');
            control_stack.push({
                addr: dp,
                type: 'orig'
            }); // orig
            write(0);
            control_stack.push(dest);
        },
        "REPEAT": function() {
            var dest = control_stack.pop();
            var orig = control_stack.pop();
            if (dest.type != 'dest') report_error('repeat without begin');
            if (orig.type != 'orig') report_error('repeat without while');

            var n = dest.addr - dp;
            compile_primitive('(BRANCH)');
            write(n);

            img[orig.addr >> 2] = dp - orig.addr + cellSize;
        },
        "S\"": function() {
            var s = parse('\"');
            compile_sliteral(s);
        },
        ".\"": function() {
            var s = parse('\"');
            compile_sliteral(s);
            var f = find("TYPE");
            if (!f) report_error('not found TYPE');
            compile_word(f);
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
        "}T": function() {
            compile_sliteral(' at line: ' + (line_count + 1) + ' at uri: ' + uri);
            compile_primitive('(JMP)');
            var t = get_nfa('}T');
            if (!t) report_error("Define }T in FORTH");
            write(get_cfa(t));
            immediate_state = true;
            compile_primitive('EXIT');
        },
        "TO": function() {
            var name = parse_word();
            var nfa = get_nfa(name);
            if (!nfa) report_error("cannot find name");
            var cfa = get_cfa(nfa);
            compile_primitive("(LIT)");
            write(cfa + cellSize);
            compile_word(img[(cfa + cellSize * 2) >> 2]); // write cfa of TO word
            //var v = img[(cfa + cellSize * 2) >> 2];
            //if( primitiveIdx('(TO-VAL)') != v && primitiveIdx('(TO-USERVAL)') != v)  {
            //report_error("TO does not match, it is " + v);
            //}
        }
    }

    var primitives = [
        "(DOCOL)", // 1
        "(LIT)", // 2
        "(SLIT)", // 3
        "DUP", // 4
        "DROP", // 5
        "(JMP)", // for tail optimization 6
        "ROLL", // 7
        "OVER", // 8
        "NIP", // 9
        "2DROP", // 10
        "2DUP", //11
        "(CREATE-CODE)", //12
        "(DOES2>)", //13
        "(VAL)", //14
        "(BRANCH)", //15
        "(?BRANCH)", //16
        "COMPARE", //17
        "CMOVE", //18
        "FILL", //19
        "+", //20
        "-", //21
        "@", //22
        "!", //23
        "C@", //24
        "C!", //25
        "W@", //26
        "W!", //27
        "XOR", //28
        "OR", //29
        "AND", //30
        "R>", //31
        ">R", //32
        "R@", //33
        "ROT", //34
        "RSHIFT", //35
        "LSHIFT", //36
        "EXECUTE", //37
        "(USER-VALUE)", //38
        "TOVAL-CODE", //39
        "SWAP", //40
        "=", //41
        ">", //42
        "<", //43
        "EXIT", //44
        "_R>", // colon versions 45
        "_>R", //46
        "_R@", //47
        "_EXIT", //48
        "NEGATE", //49
        "INVERT", //50
        "UM*", //51
        "D+", //52
        "2>R", //53
        "2R>", //54
        "_2>R", //55
        "_2R>", //56
        "UM/MOD", //57
        "2SWAP", //58
        "U<", //59
        "CMOVE>", //60
        "(LOOP)", //61
        "(?DO)", //62
        "*", //63
        "/", //64
        "(USER)", //65
        "(VECT)", //66
        "NOOP", //67
        "SP@", //68
        "SP!", //69
        "RP@", //70
        "RP!", //71
        "TO-LOG", //72
        "U/", //73
        "TIMER@", //74
        "..", //75
        "IMAGE-SIZE", //76
        "(+LOOP)", //77
        "2R@", //78
        "_2R@", //79
        "LEAVE", //80
        "TOUSERVAL-CODE", //81
        "NOP", // 82
        "ALLOCATE", //83
        "FREE", //84
        "RESIZE", //85
        "HALT", //86
        "SEARCH", //87
        "(CLITERAL-CODE)", //88
        "2/", //89
        "J", //90
        "TIMER@", //91
        "(JS-COLON)", //92
        "(DO)", //93
        "_I", //94
        "I", //95
        "_RDROP", //96
        "RDROP", //97
        "PRINT-HEAP", // 98
        "CACHE-NAME", // 99
        "GET-CACHE-NAME", // 100
        "CLEAR-CACHE-NAME",
        "EXECUTE-JS-WORD-FROM-DICT",
        "JDROP",
        "JPICK",
        "JROLL",
        "D>J",
        "J>D",
        "JDEPTH",
        "JEVAL",
        "JFETCH",
        "CHECK-JS-DICT",
        "JSVAL-FETCH",
        "TOJS-VAL",
        "JS-READ-LINE",
        "SERVER?" // TRUE if in server mode - no console, command line and input from js_input
    ];


    function primitiveIdx(name) {
        for (var i = 0; i < primitives.length; i++) {
            if (primitives[i] == name) return i
        };
        return -1
    };

    function compile_constant_primitives() {

        for (var i in primitives) {
            var word = primitives[i];
            if (word.charAt(0) == '_') {
                // create ordinary word
                create_name(word.slice(1));
                compile_primitive(word);
                compile_primitive('EXIT'); // for see
                compile_primitive(word.slice(1)); // for COMPILE,

                // create word in compile wl
                // create_name(word.slice(1), compile_wl_last);
                // compile_primitive(word.slice(1));

                // add exception
                dst_compile[word.slice(1)] = primitiveIdx(word.slice(1));
            }
        }

        for (var i in primitives) {

            var word = primitives[i];
            if (word.charAt(0) == '_' || dst_compile[word]) {
                continue;
            } else
                create_name(word);
            if (word.charAt(0) == '(') {
                // compile as constant
                compile_literal(i);
                compile_primitive('EXIT');
            } else {
                // compile as word
                compile_primitive(word);
                compile_primitive('EXIT');
                compile_primitive(word);
                img8[last_nfa - 1] = img8[last_nfa - 1] | 4; // set primitive flag 			
            }
        }

        primitives_end = dp;
    }

    function next_word() {
        return parse_word()
    };

    function compile_word(cfa) {
        last_colon = dp;
        compile_primitive('(DOCOL)');
        write(cfa)
    };

    function is_int(val) {
        var RE = /^-{0,1}(\d|[A-F]|[a-f])*$/;
        return RE.test(val);
    }

    function is_literal(word) {
        if (is_int(word)) return parseInt(word, radix)
    };

    function compile(word) {
        var f;

        if (tc_vars[word]) {
            if (immediate_state) {
                data_stack.push(tc_vars[word]);
                return;
            }
        }

        if (immediate_state) f = tc_wordlist_imm[word];
        else
            f = tc_wordlist[word];


        if (f) {
            f.call();
            return;
        } else {
            if (dst_compile[word]) {
                f = dst_compile[word];
                write(f);
                return;
            } else
                f = find(word);
        }

        if ((f || (primitiveIdx(word) >= 0)) && immediate_state) {
            report_error('Found target word in immediate state: ' + word);
        }
        var ffa = get_nfa(word);
        if (ffa)
            ffa = img8[ffa - 1];
        if (ffa & 4) { // primitive
            write(img[f >> 2]);
        } else
        if (f) compile_word(f)
        else {
            var l = is_literal(word);
            if (typeof(l) == 'number')
                if (immediate_state)
                    data_stack.push(l);
                else
                    compile_literal(l);
            else {
                report_error(word + ' not found');
            }
        }
    };


    function save() {
        align_cell();
        if( isNode ) {
            var buf = new Buffer(dp);

            (new Buffer(img8, "binary")).copy(buf, 0, 0, dp);
            fs.writeFile(path.join(__dirname, 'forth.img'), buf, function(err) {
               if( err )
                 report_error('Cannot save image');
               else console.log('FORTH image saved!');
            });
            return;
        }

        webkitStorageInfo.requestQuota(
            webkitStorageInfo.PERSISTENT,

            dp, // amount of bytes you need

            function(availableBytes) {
                if (availableBytes == dp)
                    console.log("Quota is available. Image size: " + availableBytes);
                else throw "cannot save image";
            }
        );

        window.requestFileSystem = window.requestFileSystem || window.webkitRequestFileSystem;
        window.requestFileSystem(window.PERSISTENT, 200000, function(fs) {
            fs.root.getFile('forth.img', {
                    create: true
                },
                function(fileEntry) {
                    debugger;
                    fileEntry.createWriter(function(fileWriter) {
                        debugger;
                        var bb = new Blob([img], {
                            type: 'application/octet-stream'
                        });
                        bb = bb.slice(0, dp);
                        fileWriter.write(bb, 'application/octet-stream');
                    }, function(e) {
                        console.log('fileEntry.createWriter error ' + e.code)
                    });

                },
                function(e) {
                    console.log('fs.root.getFile error ' + e.code)
                });

        }, function(e) {
            console.log('window.requestFileSystem error ' + e.code)
        });

    }

    function interpret() {
        do {
            var s = next_word();

            if (!s.length) {
                if (!include_count) {
                    save();
                    if (typeof callback == 'function') callback.call(this, buffer);
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



TC('S" ./spf_init.f" INCLUDED');
//, function(img) {
//    var fs = new Forth(img, {
//        data_space_size: 1000000
//    });
//    fs.addWords(words);
//    fs.start();
//});