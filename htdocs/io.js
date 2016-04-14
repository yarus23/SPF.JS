

function IO(context) {
   
    this.send = function(stack, global) {
       this.socket.send(stack.pop());
    }

    this.connect = function(stack, global) {
       var url = stack.pop();
       var socket = this.socket = io(url);
       socket.on('connect', function() {
           socket.send('hi');

           socket.on('message', function(msg) {
               console.log(msg);
           });
       });
    }
}
