

function Canvas(context) {
    this.getContext = function(stack,  global) {
       stack.push(stack.pop().getContext('2d'));
    }
}