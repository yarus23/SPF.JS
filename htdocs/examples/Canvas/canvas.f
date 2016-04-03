

js.f


NULL JVALUE ctx

: init
   $ #canvas JDUP " stack.pop().style.width = '480px'" JDROP
   JDUP " stack.pop().style.height = '320px'" JDROP
   " '2d'" JSWAP -> getContext TO ctx
;

init