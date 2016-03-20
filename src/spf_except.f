( Portions copyright [C] 1992-1999 A.Cherezov ac@forth.org )

USER HANDLER
' HANDLER SAVE-EXC-HANDLER

VECT FATAL-HANDLER

: THROW ( k*x n -- k*x | i*x n ) \ 94 EXCEPTION
  DUP 0= IF DROP EXIT THEN
  
  HANDLER @  DUP IF  RP!
  R> HANDLER !
  R> SWAP >R
  SP! DROP R>
  EXIT         THEN
  DROP FATAL-HANDLER
;


: CATCH ( i*x xt -- j*x 0 | i*x n ) \ 94 EXCEPTION
  SP@ >R  HANDLER @ >R
  RP@ HANDLER !
  EXECUTE
  R> HANDLER !
  RDROP
  0
;
: ABORT  \ 94 EXCEPTION EXT
  ( i*x -- ) ( R: j*x -- )
  -1 THROW
;

