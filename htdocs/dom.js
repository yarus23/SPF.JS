

function Dom(context) {
    if( !context.elements ) { context.elements = {}; context.dom_count = 0; }

    function handle2id(f,h) {
       f.elements[f.dom_count] = h;
       return f.dom_count++;
    }

    this.$ = function(f) {
       var name = f.get_string();
       var el = document.querySelector(name);
       if( el )
          f.push(handle2id(f,el));
       else f.push(-1);
    }

    this.forget = function(f) {
       var v = f.elements[f.pop()];
       delete f;
    }

    this.getContext = function(f) {
       var v = f.elements[f.pop()];
       var ctx = v.getContext("2d");
       f.push(handle2id(f,ctx));
    }

    this.width = function(f) {
       var el = f.elements[f.pop()];
       f.push(window.getComputedStyle(el).width);
    }

    this.height = function(f) {
       var el = f.elements[f.pop()];
       f.push(window.getComputedStyle(el).height);
    }

}
