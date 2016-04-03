js.f

: print_node_version
    S" Node.JS version is: " TYPE CR
    " process" -> version
    " console.log(stack.pop())" JDROP
;

print_node_version