"use strict";

function ForthError(err, message, ip) {
    this.err = err;
    this.message = message;
    this.stack = (new Error()).stack.replace(/^.*?\n/, "");
    this.ip = ip;
}

ForthError.prototype = (function() {
    var Fake = function() {};
    Fake.prototype = Error.prototype;
    return (new Fake);
}());

ForthError.prototype.name = "FORTH error";

function Forth(buffer, config) {
    var uimg, img, img16, img8;
    var data_stack;
    var udata_stack;
    var return_stack;
    var user_dp;
    var cellSize = 4;
    var doubleSize = 8;
    var dp = 0;
    var low_result;
    var high_result;
    var dp_start = 0;
    var heap_addr = 0;
    var alloc_last_search = 0;
    var magic_free = 0xC0FFEE;
    var magic_alloc = 0xBADF00D;
    var jstack = []; // stack for JS objects
    var jvars = []; // JVALUE array
    var js_input = []; // array of strings to share between FORTH and JS in server mode, used by REFILL

    this.global = {};
    if( !this.jsdict ) this.jsdict = {};

    // for SAVE
    this.global.img8 = img8;
    this.global.js_input = js_input;
    this.global.jstack = jstack;

    this.global.get_string = get_string;
    this.global.push = function(v) {
        data_stack[++dp] = v
    };
    this.global.pop = function(v) {
        return data_stack[dp--]
    };
    this.global.rpush = function(v) {
        return_stack[--rp] = v
    };
    this.global.rpop = function(v) {
        return return_stack[rp++]
    };
    this.global.add_rp = function(v) {
        return rp += v
    };
    this.global.add_sp = function(v) {
        return dp += v
    };
    this.global.put8 = function(a, v) {
        img8[a] = v
    };
    this.global.get8 = function(a) {
        return img8[a]
    };

    this.global.alloc_string = function(s) {
        var here = alloc(s.size + cellSize);
        for (var i = 0; i < s.length; i++) {
           img8[here + i + cellSize] =  s.charCodeAt(i);
        }

        data_stack[++dp] = here + cellSize;
        data_stack[++dp] = s.length;
    }

    this.to_eval_queue = function(s) {
        this.global.js_input.push(s);
    }

    this.jswords = [];

    function throw_err(err) {
        throw err;
    }

    function report_error(s) {
        throw new Error(s);
    }

    function check_stack(n) {
        if (n > (dp - dp_start)) {
            throw new ForthError(-4, "Stack depth error");
        }
    }

    function get_string() {
        check_stack(2);

        var length = data_stack[dp--];
        var addr = data_stack[dp--];
        var str = "";
        for (var i = 0; i < length; i++) {
          str += String.fromCharCode(img8[addr++]);
        }
        return str;
    }

    function aligned(n) {
        var d = n % cellSize;
        if (d)
            return n + cellSize - d;
        else return n;
    }
    // a * b = (long) d
    function imul32(a, b) {
        /* does not work       
        		if( a < 65535 && b < 65535 ) {
        			low_result = a * b;
        			high_result = 0;
        			return;
        		} */
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
        if (a < 0) {
            if (b < 0) {
                a = -a;
                b = -b;
            } else {
                a = -a;
                return true;
            }
        } else {
            if (b < 0) {
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

        var c32 = 0,
            c16 = 0,
            c00 = 0;
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
        // console.log(high, low, u);
        // todo: division by zero
        
		if( !high ) {
			high_result = (low >>> 0) / (u >>> 0);
			low_result = (low >>> 0) % (u >>> 0);
			return;
		}

        var remainder_h = 0;
        var remainder_l = 0;

        for (var i = 0; i < 64; i++) {
            var sbit = (1 << 31) & high;
            remainder_h = (remainder_h << 1) | ((remainder_l & 0x80000000) >>> 31);
            remainder_l <<= 1;
            if (sbit) remainder_l |= 1;

            high = (high << 1) | ((low & 0x80000000) >>> 31);

            low = low << 1;

            if (remainder_h || ((remainder_l >>> 0) >= (u >>> 0))) {
                var cf = (remainder_l >>> 0) < (u >>> 0) ? 1 : 0;
                remainder_l -= u;
                remainder_h -= cf;
                low |= 1;
            }
        }

        high_result = low;
        low_result = remainder_l;

        // console.log("res " + low + " remainder " + remainder_l);
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

    function check_chunk(chunk, size) {
        var base_addr = heap_base / cellSize;
        var start = img[base_addr + chunk + 1];
        var end = img[base_addr + chunk + 2 + size / cellSize  ];
        if( start != magic_alloc && start != magic_free ) report_error("Heap block start at: " + (base_addr + chunk + 2) * cellSize + ", of size " + size + " is corrupted");
        if( end != magic_alloc && end != magic_free ) report_error("Heap block end at: " + (base_addr + chunk + 2) * cellSize + ", of size " + size + " is corrupted");
    }

    function chunk_size(chunk) {
        var prev = chunk;
        var base_addr = heap_base / cellSize;
        var next = img[base_addr + chunk];
        var size;
        var overhead = 3; // 3 cells
        if( prev == next ) size = config.heap_size - overhead * cellSize;
        else
            if( next < prev ) size = config.heap_size - (prev + overhead) * cellSize;
            else size = (next - prev - overhead) * cellSize;

        check_chunk(chunk, size);
        return size;
    }

    function print_heap() {
        var base_addr = heap_base / cellSize;
        var prev;
        var next = 0;

        function block_type(magic) {
            switch(magic) {
               case magic_alloc: return "Allocated";
               case magic_free: return "Free";
               default: return "Unknown";  
            }
                   
        }
        do {
            prev = next;
            console.log(block_type(img[base_addr + prev + 1]), "memory chunk at ", (base_addr + prev + 2) * cellSize, ", size ", chunk_size(prev));
            next = img[base_addr + next];
        } while (next);
    }

    function init_heap() {
        // init heap
        var base_addr = heap_base / cellSize;
        img[base_addr] = 0;
        img[base_addr + 1] = magic_free;
        img[(heap_base + config.heap_size) / cellSize - 1] = magic_free;
//        print_heap();
    }

    // list of allocations
    // cell -- next chunk
    // cell -- magic
    // cell * N -- data
    // cell -- magic
    function alloc(size) {
// console.log("try to alloc: " + size);

        size = aligned(size) / cellSize;
        var base_addr = heap_base / cellSize;
        var overhead = 3; // 3 cells
        var next = alloc_last_search;
        var found = false;
        var prev;

        do {
            prev = next;
            next = img[base_addr + next];


            if (img[base_addr + prev + 1] === magic_free && chunk_size(prev) >= size) {
                found = true;
                break
            }
        } while (next != alloc_last_search);

        if (found) {
            // first chunk

            var next_chunk = size + overhead + prev;

            uimg[base_addr + prev] = next_chunk;
            uimg[base_addr + prev + 1] = magic_alloc;
            uimg[base_addr + prev + 2 + size] = magic_alloc;

            // second chunk
            uimg[base_addr + next_chunk] = next;
            uimg[base_addr + next_chunk + 1] = magic_free;

            alloc_last_search = next_chunk;
//           print_heap();
            return (base_addr + prev + 2) * cellSize;
        }

        return -1;
    }

    function free_mem(addr) {

        var base_addr = heap_base / cellSize;
        var curr = (addr - heap_base) / cellSize - 2;
        chunk_size(curr); // check

//        console.log("free: " + chunk_size(curr));
        var next = uimg[base_addr + curr];

        if (uimg[base_addr + curr + 1] != magic_alloc) return -1;
        if (uimg[base_addr + next - 1] != magic_alloc) return -1;

        uimg[base_addr + curr + 1] = magic_free;
        uimg[base_addr + next - 1] = magic_free;

        // join right neighbour
        if (uimg[base_addr + next + 1] == magic_free) {
            uimg[base_addr + curr] = img[base_addr + next];
        }

        // todo fill zeroes
//        print_heap();
        alloc_last_search = curr;

        return 0;
    }

    function resize_mem(addr, size) {

        function min(a, b) {
            return a < b ? a : b
        };

        var base_addr = heap_base / cellSize;
        var curr = (addr - heap_base) / cellSize - 2;

        var old_size = (uimg[base_addr + curr] - curr - 3) * cellSize;

        if (free_mem(addr) < 0) return -1;

        var new_addr = alloc(size);

        if (new_addr < 0) return -2;
        size = aligned(size);

        if (addr != new_addr) {
            for (var i = 0; i < min(old_size / cellSize, size / cellSize); i++)
                img[new_addr / cellSize + i] = img[addr / cellSize + i];
        }
        return new_addr;
    }

    function trunc(x) {
        return x < 0 ? Math.ceil(x) : Math.floor(x);
    }


    function slit() {
        data_stack[++dp] = ip + cellSize + 1;
        var l = img8[ip + cellSize];
        data_stack[++dp] = l;
        l += 2;
        ip += cellSize + aligned(l);
    }


    function docol() {
        return_stack[--rp] = ip + doubleSize;
        ip = uimg[(ip + cellSize) >> 2];
    }

    function lit() {
        data_stack[++dp] = img[(ip + cellSize) >> 2];
        ip += doubleSize;

    }

    function dup() {
        data_stack[dp + 1] = data_stack[dp];
        dp++;
        ip += cellSize;

    }

    function drop() {
        dp--;
        ip += cellSize;

    }

    function jmp() {
        ip = uimg[(ip + cellSize) >> 2];
    }

    function over() {
        data_stack[dp + 1] = data_stack[dp - 1];
        dp++;
        ip += cellSize;

    }

    function nip() {
        data_stack[dp - 1] = data_stack[dp];
        dp--;
        ip += cellSize;

    }

    function twodrop() {
        dp -= 2;
        ip += cellSize;

    }

    function twodup() {
        data_stack[dp + 1] = data_stack[dp - 1];
        data_stack[dp + 2] = data_stack[dp];
        dp += 2;
        ip += cellSize;

    }

    function createcode() {
        data_stack[++dp] = ip + doubleSize;
        ip = return_stack[rp++];

    }

    function does2() {
        data_stack[++dp] = ip + doubleSize;
        ip += uimg[(ip + cellSize) >> 2]; // only positive branch

    }

    function val() {
        data_stack[++dp] = img[(ip + cellSize) >> 2];
        ip = return_stack[rp++];

    }

    function branch() {
        ip += img[(ip + cellSize) >> 2];
    }

    function qbranch() {
        if (data_stack[dp--])
            ip += doubleSize;
        else
            ip += img[(ip + cellSize) >> 2];

    }

    function compare() {
        // addr1 u1 addr2 u2
        var u2 = data_stack[dp--];
        var addr2 = data_stack[dp--];
        var u1 = data_stack[dp--];
        var addr1 = data_stack[dp];

        var min = u1 > u2 ? u2 : u1;


        for (var i = 0; i < min; i++) {
            var a = img8[addr1 + i];
            var b = img8[addr2 + i];
            if (a != b) {
                data_stack[dp] = a > b ? 1 : -1;
                min = -1;
                break;
            }
        }

        if (min >= 0) {
            if (u1 == u2) data_stack[dp] = 0;
            else
                data_stack[dp] = u1 > u2 ? 1 : -1;
        }

        ip += cellSize;

    }

    function cmove() {
        // todo: optimize
        var u = data_stack[dp--];
        var addr2 = data_stack[dp--];
        var addr1 = data_stack[dp--];
        while (u--) img8[addr2++] = img8[addr1++];
        ip += cellSize;

    }

    function fill() {
        var c = data_stack[dp--];
        var u = data_stack[dp--];
        var addr = data_stack[dp--];
        while (u--) img8[addr++] = c;
        ip += cellSize;

    }

    function plus() {
        data_stack[dp - 1] = data_stack[dp - 1] + data_stack[dp];
        dp--;
        ip += cellSize;

    }

    function minus() {
        data_stack[dp - 1] = data_stack[dp - 1] - data_stack[dp];
        dp--;
        ip += cellSize;

    }

    function fetch() {
        if (data_stack[dp] & 3 != 0) throw new ForthError(-23, "Unaligned read");
        data_stack[dp] = img[data_stack[dp] >> 2];
        ip += cellSize;

    }

    function put() {
        if (data_stack[dp] & 3 != 0) throw new ForthError(-23, "Unaligned write");
        img[data_stack[dp] >> 2] = data_stack[dp - 1];
        dp -= 2;
        ip += cellSize;

    }

    function cfetch() {
        data_stack[dp] = img8[data_stack[dp]];
        ip += cellSize;

    }

    function cput() {
        img8[data_stack[dp]] = data_stack[dp - 1];
        dp -= 2;
        ip += cellSize;

    }

    function wfetch() {
        data_stack[dp] = img16[data_stack[dp] >> 1];
        ip += cellSize;

    }

    function wput() {
        img16[data_stack[dp] >> 1] = data_stack[dp - 1];
        dp -= 2;
        ip += cellSize;

    }

    function xor() {
        data_stack[dp - 1] ^= udata_stack[dp];
        dp--;
        ip += cellSize;

    }

    function or() {
        data_stack[dp - 1] |= udata_stack[dp];
        dp--;
        ip += cellSize;

    }

    function and() {
        data_stack[dp - 1] = udata_stack[dp - 1] & udata_stack[dp];
        dp--;
        ip += cellSize;

    }

    function rfrom() {
        udata_stack[++dp] = return_stack[rp++];
        ip += cellSize;

    }

    function to_r() {
        return_stack[--rp] = udata_stack[dp--];
        ip += cellSize;

    }

    function rfetch() {
        udata_stack[++dp] = return_stack[rp];
        ip += cellSize;

    }

    function rot() {
        var a = data_stack[dp];
        data_stack[dp] = data_stack[dp - 2];
        data_stack[dp - 2] = data_stack[dp - 1];
        data_stack[dp - 1] = a;
        ip += cellSize;

    }

    function rshift() {
        data_stack[dp - 1] = data_stack[dp - 1] >>> data_stack[dp];
        dp--;
        ip += cellSize;

    }

    function lshift() {
        data_stack[dp - 1] = udata_stack[dp - 1] << udata_stack[dp];
        dp--;
        ip += cellSize;

    }

    function execute() {
        return_stack[--rp] = ip + cellSize;
        ip = udata_stack[dp--];

    }

    function userval() {
        data_stack[++dp] = img[(img[(ip + cellSize) >> 2] + user_dp) >> 2];
        ip = return_stack[rp++];

    }

    function toval() {
        var a = data_stack[dp--];
        img[a >> 2] = data_stack[dp--];
        ip += cellSize;

    }

    function swap() {
        var a = data_stack[dp];
        data_stack[dp] = data_stack[dp - 1];
        data_stack[dp - 1] = a;
        ip += cellSize;

    }

    function equal() {
        data_stack[dp - 1] = (data_stack[dp - 1] === data_stack[dp]) ? -1 : 0;
        dp--
        ip += cellSize;

    }

    function less() {
        data_stack[dp - 1] = (data_stack[dp - 1] < data_stack[dp]) ? -1 : 0;
        dp--
        ip += cellSize;

    }

    function exit() {
        if (rp == rp_top) {
            console.log('finished');
            return -1
        };
        ip = return_stack[rp++];
        return 0;
    }

    function _rfrom() {
        ip = return_stack[rp++];
        data_stack[++dp] = return_stack[rp++];

    }

    function _to_r() {
        ip = return_stack[rp++];
        return_stack[--rp] = data_stack[dp--];

    }

    function _rfetch() {
        ip = return_stack[rp++];
        data_stack[++dp] = return_stack[rp];

    }

    function _exit() {
        if (--rp == rp_top) {
            console.log('finished');
            return -1
        };
        ip = return_stack[rp++];
        return 0;

    }

    function neg() {
        data_stack[dp] = -data_stack[dp];
        ip += cellSize;

    }

    function inv() {
        data_stack[dp] = data_stack[dp] ^ 0xFFFFFFFF;
        ip += cellSize;

    }

    function ummul() {
        imul32(data_stack[dp], data_stack[dp - 1]);
        data_stack[dp - 1] = low_result;
        data_stack[dp] = high_result;
        ip += cellSize;

    }

    function dplus() {
        var h0 = data_stack[dp];
        var l0 = data_stack[dp - 1];
        var h1 = data_stack[dp - 2];
        var l1 = data_stack[dp - 3];
        dp -= 2;

        iadd32(l0, l1);
        data_stack[dp - 1] = low_result;
        data_stack[dp] = h0 + h1 + high_result;
        ip += cellSize;

    }

    function two_to_r() {
        return_stack[--rp] = udata_stack[dp - 1];
        return_stack[--rp] = udata_stack[dp];
        dp -= 2;
        ip += cellSize;

    }

    function two_r_from() {
        udata_stack[dp + 2] = return_stack[rp++];
        udata_stack[dp + 1] = return_stack[rp++];
        dp += 2;
        ip += cellSize;

    }

    function _two_to_r() {
        ip = return_stack[rp++];
        return_stack[--rp] = udata_stack[dp - 1];
        return_stack[--rp] = udata_stack[dp];
        dp -= 2;

    }

    function _two_r_from() {
        ip = return_stack[rp++];
        udata_stack[dp + 2] = return_stack[rp++];
        udata_stack[dp + 1] = return_stack[rp++];
        dp += 2;

    }

    function ummod() {
        if (!data_stack[dp]) {
            throw_err(-10);
            return;
        }
        udivmod(data_stack[dp - 1], data_stack[dp - 2], data_stack[dp]);
        dp--;
        data_stack[dp - 1] = low_result;
        data_stack[dp] = high_result;
        ip += cellSize;

    }

    function two_swap() {
        var a = data_stack[dp];
        data_stack[dp] = data_stack[dp - 2];
        data_stack[dp - 2] = a;

        a = data_stack[dp - 1];
        data_stack[dp - 1] = data_stack[dp - 3];
        data_stack[dp - 3] = a;
        ip += cellSize;

    }

    function uless() {
        udata_stack[dp - 1] = (udata_stack[dp - 1] < udata_stack[dp]) ? -1 : 0;
        dp--
        ip += cellSize;

    }

    function cmoveg() {
        var u = data_stack[dp--];
        var addr2 = data_stack[dp--];
        var addr1 = data_stack[dp--];
        while (u--) img8[addr2 + u] = img8[addr1 + u];
        ip += cellSize;

    }

    function loop() {
        if (++return_stack[rp]) {
            ip += img[(ip + cellSize) >> 2];
        } else {
            rp += 3;
            ip += doubleSize; // leave a cycle							
        }

    }

    function qdo() {
        if (data_stack[dp] === data_stack[dp - 1]) {
            ip += img[(ip + cellSize) >> 2];
        } else {
            rp -= 3;
            return_stack[rp + 1] = data_stack[dp - 1]; // upper limit
            return_stack[rp] = data_stack[dp] - data_stack[dp - 1]; // to - from
            return_stack[rp + 2] = ip + img[(ip + cellSize) >> 2]; // shift for leave word
            ip += doubleSize;
        }
        dp -= 2;

    }

    function mul() {
        data_stack[dp - 1] *= data_stack[dp];
        dp--;
        ip += cellSize;

    }

    function div() {
        var a = ((data_stack[dp - 1]) / (data_stack[dp]));
        if (!isFinite(a)) throw new ForthError(-10, 'division by zero');
        data_stack[--dp] = trunc(a);
        ip += cellSize;

    }

    function user() {
        data_stack[++dp] = img[(ip + cellSize) >> 2] + user_dp;
        ip = return_stack[rp++];

    }

    function vect() {
        var v = img[(ip + cellSize) >> 2];
        if (!v)
            ip = return_stack[rp++];
        else
            ip = v;

    }

    function spfetch() {
        var sp = dp << 2;
        data_stack[++dp] = sp;
        ip += cellSize;

    }

    function spput() {
        dp = data_stack[dp] >> 2;
        ip += cellSize;

    }

    function rpfetch() {
        data_stack[++dp] = rp << 2; // to bytes
        ip += cellSize;

    }

    function rpput() {
        rp = data_stack[dp--] >> 2; // to cells
        ip += cellSize;

    }

    function tolog() {
        this.log(get_string());
        ip += cellSize;

    }

    function udiv() {
        udata_stack[dp - 1] = udata_stack[dp - 1] / udata_stack[dp];
        dp--;
        ip += cellSize;

    }

    function dot() {
        var s = 'stack: ';
        for (var i = dp_start + 1; i <= dp; i++)
            s += ' ' + data_stack[i];
        console.log(s);
        ip += cellSize;

    }

    function ploop() {
        var i = data_stack[dp--];
        if (i < 0 ? (return_stack[rp] += i) >= 0 : (return_stack[rp] += i) < 0) {
            ip += img[(ip + cellSize) >> 2];
        } else {
            rp += 2;
            ip += doubleSize; // leave a cycle
        }

    }

    function two_r_fetch() {
        // todo: ошибки массивов читать Error message
        data_stack[++dp] = return_stack[rp + 1];
        data_stack[++dp] = return_stack[rp];
        ip += cellSize;

    }

    function _two_r_fetch() {
        ip = return_stack[rp++];
        data_stack[++dp] = return_stack[rp + 1];
        data_stack[++dp] = return_stack[rp];
        ip += cellSize;

    }

    function leave() {
        ip = return_stack[rp + 2];
        rp += 3;
    }

    function touserval() {
        var shift = img[data_stack[dp--] >> 2];
        img[(shift + user_dp) >> 2] = data_stack[dp--];
        ip += cellSize;

    }


    function allocate() {
        var mem = alloc(data_stack[dp]);
        if (mem < 0) { // not available space               
            data_stack[dp] = 0;
            data_stack[++dp] = -300;
        } else {
            data_stack[dp] = mem;
            data_stack[++dp] = 0;
        }
        ip += cellSize;

    }

    function free() {
        var res = free_mem(data_stack[dp]);
        if (res < 0) {
            data_stack[dp] = -301;
        } else
            data_stack[dp] = 0;
        ip += cellSize;

    }

    function resize() {
        var res = resize_mem(data_stack[dp - 1], data_stack[dp]);
        if (res < 0) {
            data_stack[dp] = -302;
        } else {
            data_stack[dp - 1] = res;
            data_stack[dp] = 0;
        }
        ip += cellSize;

    }

    function search() {
        var addr1 = data_stack[dp - 3];
        var u1 = data_stack[dp - 2];
        var addr2 = data_stack[dp - 1];
        var u2 = data_stack[dp];

        var count = 0;
        var i = 0;

        if (u1 >= u2 && u2 > 0)
            for (i = 0; i <= (u1 - u2); i++) {
                count = 0;
                for (var j = 0; j < u2; j++) {
                    if (img8[addr1 + i + j] != img8[addr2 + j]) break;
                    count++;
                }
                if (count === u2) break;
            }

        if (count !== u2) {
            data_stack[--dp] = 0
        } else {
            data_stack[--dp] = -1;
            data_stack[dp - 2] = addr1 + i;
            data_stack[dp - 1] = u1 - i;
        }
        ip += cellSize;

    }

    function cliteral() {
        data_stack[++dp] = ip + cellSize;
        var l = img8[ip + cellSize];
        l += 2;
        ip += cellSize + aligned(l);

    }

    function twodiv() {
        data_stack[dp] = data_stack[dp] >> 1;
        ip += cellSize;

    }

    function j_word() {
        data_stack[++dp] = return_stack[rp + 3] + return_stack[rp + 4];
        ip += cellSize;

    }

    function timer() {
        var t = Date.now();
        udata_stack[++dp] = t | 0;
        udata_stack[++dp] = 0; // todo!
        ip += cellSize;

    }

    function do_word() {
        rp -= 3;
        return_stack[rp + 1] = data_stack[dp - 1]; // upper limit
        return_stack[rp] = data_stack[dp] - data_stack[dp - 1]; // to - from
        return_stack[rp + 2] = ip + img[(ip + cellSize) >> 2]; // address for leave
        dp -= 2;
        ip += cellSize * 2;

    }

    function _i() {
        ip = return_stack[rp++];
        data_stack[++dp] = return_stack[rp] + return_stack[rp + 1];
        ip += cellSize;

    }

    function i_word() {
        data_stack[++dp] = return_stack[rp] + return_stack[rp + 1];
        ip += cellSize;

    }

    function _rdrop() {
        return_stack[rp + 1] = return_stack[rp];
        rp++;
        ip += cellSize;

    }

    function rdrop() {
        rp++;
        ip += cellSize;

    }

    function roll() {
        var u = data_stack[dp--];
        var top = data_stack[dp - u];
        for (var i = dp - u; i < dp; i++)
            data_stack[i] = data_stack[i + 1];
        data_stack[dp] = top;
        ip += cellSize;
    }

    function nfa_to_str(nfa) {
        var addr = nfa;
        var length = img8[addr++];
        return String.fromCharCode.apply(null, img8.subarray(addr, addr + length));
    }

    function jscolon(me) {
        // cell -- js_code
        // cell -- nfa

        // get word name          
        var nfa = img[(ip + cellSize) >> 2];
        var str = nfa_to_str(nfa);

        var def = me.jswords[str];
        if (def && def.fn !== undefined) {
            var fn = def.fn;
            var old_dp = dp;
            var ret = fn.call(me, me.global, data_stack, return_stack, function() {
                if ((dp - old_dp) != (def.out - def.in)) throw new Error("Stack mismatch in javascript function: " + str);
                me.start();
            });
            ip = return_stack[rp++];
            return ret;
        } else throw new ForthError(-11, "Unknown javascript word: " + str);
    }

    function jscolon_checkdict(me) {
        var first = get_string();
        var f = me.jsdict[first];
        if( f ) data_stack[++dp] = -1;
        else data_stack[++dp] = 0;
        ip += cellSize;
    }

    function jscolon_dict(me) {

        var second = me.global.get_string();
        var first = me.global.get_string();

        var f = me.jsdict[first];
        if( f ) {
            var method = f[second];
            if( !method && f["notfound"]) method = f["notfound"];

            if( method ) { 
              var r = method.call(f, jstack, me.global, data_stack, return_stack, function() { me.start() }, second); 
              me.global.push(0);
              ip += cellSize;
              return r;
            }

        }
        ip += cellSize;
        me.global.push(-2003);
    }

    function get_cache_name(global) { // ( wid addr u -- nfa | 0 )
        var str = global.get_string();
        var wid = global.pop();
       
        if( !global.namecache || !global.namecache[wid]) {
            global.push(0);
        } else {
            var nfa = global.namecache[wid][str];
//            console.log("found " + str, nfa );
            if( nfa !== undefined ) { global.push(nfa); }
            else global.push(0);
        }
    }

    function cache_name(global) { // ( nfa wid -- )
        var wid = data_stack[dp];
        var nfa = data_stack[dp - 1];
//        console.log("wid " + wid, "nfa " + nfa_to_str(nfa), nfa);
        dp -= 2;
        if( !global.namecache ) global.namecache = {};
        if( !global.namecache[wid] ) global.namecache[wid] = {};
        var name = nfa_to_str(nfa);
        var existing = global.namecache[wid][name];
        if( !existing || existing < nfa ) global.namecache[wid][name] = nfa;
    }

    function js2f() {
       data_stack[++dp] = jstack.pop();
       ip += cellSize;
    }

    function f2js() {
       jstack.push(data_stack[dp--]);
       ip += cellSize;
    }

    function s2j() {
       jstack.push(get_string());
    }

    function isFunction(object) {
       return !!(object && object.constructor && object.call && object.apply);
    }

    function reverse(array) {
        var left = null;
        var right = null;
        for (left = 0, right = length - 1; left < right; left += 1, right -= 1)
        {
            var temporary = array[left];
            array[left] = array[right];
            array[right] = temporary;
        }
        return array;
    }

    function jfetch() {
        var str = get_string();
        var v = jstack.pop();
        var f = v[str];
        if( isFunction(f) ) {
          jstack.push(f.apply(v, reverse(jstack.slice(0))));
        }
        else
          jstack.push(v[str]);
        ip += cellSize;
    }

    function jseval() {
        var str = get_string();
        var f = function(stack, str) { return eval('('+str+')'); };
        jstack.push(f.call(this, jstack, str));
        ip += cellSize;
    }

    function jsdrop() { jstack.pop(); ip += cellSize; }
    function jspick() { jstack.push(jstack[jstack.length - data_stack[dp--] - 1]); ip += cellSize; }
    function jsroll() { 
       var l = data_stack[dp];
       jspick();
       jstack.splice(jstack.length - l - 2, 1);
    }
    
    function jdepth() { data_stack[++dp] = jstack.length; ip += cellSize; }

    function jsval_fetch() {
        jstack.push(jvars[ img[(ip + cellSize) >> 2] ]);
        ip = return_stack[rp++];
    }

    function tojs_val() {
        var a = data_stack[dp--];
        var v = img[a >> 2];
        if( v >= jvars.length ) jvars.push(0);
        jvars[ v ] = jstack.pop();
        ip += cellSize;
    }

    function js_read_line() {
        // READ-LINE ( c-addr u1 fileid -- u2 flag ior ) \ 94 FILE
        dp--; // drop id
        var len = data_stack[dp--];
        var addr = data_stack[dp--];

        var written;

        if( js_input.length ) {
            var s = js_input[0];
            console.log('Put in interpret queue: ' + s);
            if( s.length < len ) len = s.length;

            for (var i = 0; i < len; i++) {
              img8[addr+i] =  s.charCodeAt(i);
            }
            js_input.shift();
            data_stack[++dp] = len;
            written = true;
        } else
            data_stack[++dp] = len;

       data_stack[++dp] = -1;
       data_stack[++dp] = 0;
       ip += cellSize;

       if( !written ) return true; // yeld till next input
    }

    function inner_loop() {
        var word = 0;
        do {
            word = img[ip >> 2];
            switch (word) {
                case 0: // do colon        
                    docol();
                    break;
                case 1: // lit
                    lit();
                    break;
                case 2: // slit
                    slit();
                    break;
                case 3: // dup
                    dup();
                    break;
                case 4: // drop
                    drop();
                    break;
                case 5: // tail jmp
                    jmp();
                    break;
                case 6: // roll
                    roll();
                    break;
                case 7: // over
                    over();
                    break;
                case 8: // nip
                    nip();
                    break;
                case 9: // 2drop
                    twodrop();
                    break;
                case 10: // 2dup
                    twodup();
                    break;
                case 11: // (create-code)
                    createcode();
                    break;
                case 12: // (does2>)
                    does2();
                    break;
                case 13: // (val)
                    val();
                    break;
                case 14: // (branch)
                    branch();
                    break;
                case 15: // (?branch)
                    qbranch();
                    break;
                case 16: // compare
                    compare();
                    break;
                case 17: // cmove
                    {
                        cmove();
                        break;
                    }
                case 18: // fill
                    {
                        fill();
                        break;
                    }
                case 19: // +
                    plus();
                    break;
                case 20: // -
                    minus();
                    break;
                case 21: // @
                    fetch();
                    break;
                case 22: // !
                    put();
                    break;
                case 23: // C@
                    cfetch();
                    break;
                case 24: // C!
                    cput();
                    break;
                case 25: // W@
                    wfetch();
                    break;
                case 26: // W!
                    wput();
                    break;
                case 27: // xor
                    xor();
                    break;
                case 28: // or
                    or();
                    break;
                case 29: // and
                    and();
                    break;
                case 30: // r>
                    rfrom();
                    break;
                case 31: // >r
                    to_r();
                    break;
                case 32: // r@
                    rfetch();
                    break;
                case 33: // rot
                    {
                        rot();
                        break;
                    }
                case 34: // rshift
                    rshift();
                    break;
                case 35: // lshift
                    lshift();
                    break;
                case 36: // execute
                    execute();
                    break;
                case 37: // (USER-VALUE)
                    {
                        userval();
                        break;
                    }
                case 38: // to-val ( u addr of val )
                    {
                        toval();
                        break;
                    }
                case 39: // swap
                    {
                        swap();
                        break;
                    }
                case 40: // =
                    equal();
                    break;
                case 41: // >
                    data_stack[dp - 1] = (data_stack[dp - 1] > data_stack[dp]) ? -1 : 0;
                    dp--
                    ip += cellSize;
                    break;
                case 42: // <
                    less();
                    break;
                case 43: // exit
                    if (rp == rp_top) {
                        console.log('finished');
                        return
                    };
                    ip = return_stack[rp++];
                    break;
                case 44: // _R>
                    _rfrom();
                    break;
                case 45: // _>R
                    _to_r();
                    break;
                case 46: // _R@
                    _rfetch();
                    break;
                case 47: // _EXIT
                    if (_exit()) return;
                    break;
                case 48: // NEGATE
                    neg();
                    break;
                case 49: // INVERT
                    inv();
                    break;
                case 50: // UM*
                    ummul();
                    break;
                case 51: // D+
                    dplus();
                    break;
                case 52: // 2>R
                    two_to_r();
                    break;
                case 53: // 2R>
                    two_r_from();
                    break;
                case 54: // _2>R
                    _two_to_r();
                    break;
                case 55: // _2R>
                    _two_r_from();
                    break;
                case 56: // um/mod
                    ummod();
                    break;
                case 57: // 2swap
                    {
                        two_swap();
                        break;
                    }
                case 58: // U<
                    uless();
                    break;
                case 59: // cmove>
                    {
                        cmoveg();
                        break;
                    }
                case 60: // (loop)
                    {
                        loop();
                    }

                    break;
                case 61: // (?do)
                    qdo();
                    break;
                case 62: // *
                    mul();
                    break;
                case 63: // /
                    div();
                    break;
                case 64: // (user)
                    user();
                    break;
                case 65: // (vect)
                    vect();
                    break;
                case 66: // noop
                    ip += cellSize;
                    break;
                case 67: // sp@
                    {
                        spfetch();
                        break;
                    }
                case 68: // sp!
                    spput();
                    break;
                case 69: // rp@
                    rpfetch();
                    break;
                case 70: // rp!
                    rpput();
                    break;
                case 71: // to-log
                    tolog.call(this);
                    break;
                case 72: // U/
                    udiv();
                    break;
                case 73: // TIMER@
                    timer();
                    break;
                case 74: // (.)
                    dot();
                    break;
                case 75: // IMAGE-SIZE
                    data_stack[++dp] = config.data_space_size;
                    ip += cellSize;
                    break;
                case 76: // (+loop)
                    {
                        var i = data_stack[dp--];

                        if ((return_stack[rp] === 0 && (return_stack[rp] + i >= 0)) ||
                            (return_stack[rp] < 0 && (return_stack[rp] + i < 0)) ||
                            (return_stack[rp] > 0 && (return_stack[rp] + i >= 0))) {
                            return_stack[rp] += i;
                            ip += img[(ip + cellSize) >> 2];
                        } else {
                            rp += 3;
                            ip += doubleSize; // leave a cycle
                        }

                    }
                    break;
                case 77: // 2R@
                    two_r_fetch();
                    break;
                case 78: // _2R@
                    _two_r_fetch();
                    break;
                case 79: // leave
                    leave();
                    break;
                case 80: // (TO-USERVAL)
                    {
                        touserval();
                        break;
                    }
                case 81: // nop
                    break;
                case 82:
                    { // allocate
                        allocate();
                        break;
                    }
                case 83: // free
                    free();
                    break;
                case 84: // resize
                    resize();
                    break;
                case 85: // halt
                    return data_stack[dp];
                case 86: // search
                    search();
                    break;
                case 87: // cliteral-code
                    {
                        cliteral();
                        break;
                    }
                case 88: // 2/
                    twodiv();
                    break;
                case 89: // J
                    j_word();
                    break;
                case 90: // timer@          
                    timer();
                    break;
                case 91: // (JS-COLON)
                    if (jscolon(this)) return; // yeld
                    break;
                case 92: // do
                    do_word();
                    break;
                case 93: // _I 
                    _i();
                    break;
                case 94: // I
                    data_stack[++dp] = return_stack[rp] + return_stack[rp + 1];
                    ip += cellSize;
                    break;
                case 95: // _RDROP
                    _rdrop();
                    break;
                case 96: // RDROP
                    rdrop();
                    break;
                case 97: // print heap
                    print_heap();
                    ip += cellSize;
                    break;
                case 98: // cache name
                    cache_name(this.global);
                    ip += cellSize;
                    break;
                case 99: // cache name
                    get_cache_name(this.global);
                    ip += cellSize;
                    break;
                case 100: // clear cache name
                    this.global.namecache = undefined;
                    ip += cellSize;
                    break;
                case 101: // EXECUTE-JS-WORD-FROM-DICT
                    if( jscolon_dict(this)) return;                    
                    break;               
                case 102: 
                    jsdrop();
                    break;
                case 103:
                    jspick();
                    break;
                case 104:
                    jsroll();
                    break;
                case 105:
                    f2js();
                    break;
                case 106:
                    js2f();
                    break;
                case 107:
                    jdepth();
                    break;
                case 108:
                    jseval.apply(this);
                    break;
                case 109:
                    jfetch();
                    break;
                case 110:
                    jscolon_checkdict(this);
                    break;
                case 111:
                    jsval_fetch();
                    break;
                case 112:
                    tojs_val();
                    break;
                case 113:
                    if( js_read_line() ) return;
                    break;
                case 114:
                    data_stack[++dp] = config.server ? -1 : 0 ;
                    ip += cellSize;
                    break;
                default:
                    //report_error("unknown opcode " + word);
                    throw new ForthError(-400, "Uknown opcode");
            } // switch
        } while (true);
    }
    img = new Int32Array(buffer);

    var imageSize = buffer.byteLength;

    if (!config) config = {};

    if (!config.data_stack_size) config.data_stack_size = 2000;
    if (!config.return_stack_size) config.return_stack_size = 2000;
    if (!config.data_space_size) config.data_space_size = 100000;
    if (!config.heap_size) config.heap_size = 100000;

    var user_data_size = img[1] > 30000 ? img[1] : 30000;

    buffer = sliceImage(buffer, imageSize + config.data_space_size // data
        + config.data_stack_size // data stack
        + user_data_size + config.heap_size + config.return_stack_size
    );


    img = new Int32Array(buffer);
    uimg = new Uint32Array(buffer);
    img8 = new Uint8Array(buffer);
    img16 = new Uint16Array(buffer);

    data_stack = img;
    udata_stack = uimg;
    return_stack = img;

    user_dp = imageSize + config.data_space_size + config.data_stack_size;
    dp = dp_start = (imageSize + config.data_space_size) >> 2; // data stack in cells
    var heap_base = user_dp + user_data_size; // in bytes
    var rp = (heap_base + config.heap_size + config.return_stack_size) >> 2; // in cells
    var rp_top = rp;

    // get start addr
    var ip = img[0] | 0;

    init_heap();

    this.start = function() {
        var keep = true;
        do {
            try {
                inner_loop.call(this);
                keep = false;
            } catch (e) {
                var handler = img[(img[2] + user_dp) >> 2];

                if (e instanceof ForthError) {
                    this.log((handler ? 'Forth error: ' : 'Unhandled forth error ') + e.err + ': ' + e.message);
                    if( e.err == -400 ) { throw "Unrecoverable error. Unknown opcode. Exiting..."; };
                }
                else
                    this.log((handler ? 'JS error: ' : 'Unhandled forth error ') + (e.message ? e.message : e));
                //console.log(handler);
                if (handler) {
                    rp = handler >> 2;
                    img[(img[2] + user_dp) >> 2] = return_stack[rp++]; // previous handler
                    dp = return_stack[rp++] >> 2;
                    ip = return_stack[rp++];
                    data_stack[++dp] = isFinite(e.err) ? e.err : -3000;
                } else {
                    ip = img[3]; // go to fatal-handler
                }
            }
        } while (keep);
    }

}

// inject JS words to FORTH dictionary
Forth.prototype.addWords = function(words) {
    for (var i = 0; i < words.length; i++) {
        this.jswords[words[i].name] = words[i];
    }
}

Forth.prototype.log = function(c) {
   console.log(c);
}

Forth.prototype.addJSDict = function(dict) {
   var name  = /^function\s+([\w\$]+)\s*\(/.exec( dict.toString() )[ 1 ];
   this.jsdict[name] = new dict(this.global);
}

if( typeof module !== 'undefined'  && module.exports )
  module.exports.Forth = Forth;