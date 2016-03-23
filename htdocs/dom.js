

function Dom(context) {
    if( !context.elements ) { context.elements = {}; context.dom_count = 0; }

    this.$ = function(f) {
       var name = f.get_string();
       var el = document.getElementById(name);
       f.elements[f.dom_count] = el;
       f.push(f.dom_count++);
    }

    this.forget = function(f) {
       var v = f.elements[f.pop()];
       delete f;
    }

    this.gag = "gag";

    this.test = function(f) {
       alert(this.gag);
    }
}
