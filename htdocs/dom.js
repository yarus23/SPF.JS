

function Dom(context) {

    this.$ = function(stack, global) {
       var name = stack.pop();
       var el = document.querySelector(name);
       stack.push(el);
    }
}
