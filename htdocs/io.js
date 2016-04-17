

function IO(context) {
   
    this.send = function(stack, global) {
       this.socket.emit('spf', { code: stack.pop()} );
    }

    this.connect = function(stack, global) {
       var url = stack.pop();
       var socket = this.socket = io(url);
       socket.on('connect', function() {
           console.log('connected');
           socket.emit('spf', { code: '2 . CR'});

           socket.on('message', function(msg) { console.log(msg) });
           socket.on('spf', function(msg) {
               console.log(msg);
               global.js_input.push(msg.code);
           });
       });
    }
}
