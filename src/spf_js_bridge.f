
: JDUP  0 JPICK ;
: JOVER 1 JPICK ;
: JSWAP 1 JROLL ;
: JROT 2 JROLL ;

: JNIP JSWAP JDROP ;

: .JS
   JDEPTH
   BEGIN
     DUP 0 > SWAP 1- SWAP
   WHILE
     DUP JPICK S" console.log(stack[stack.length-1])" JEVAL JDROP JDROP
   REPEAT DROP
;

VARIABLE JVAR_COUNT

: JVALUE
   HEADER
   [ ' JSVAL-FETCH LIT, ] ,
   HERE
   JVAR_COUNT @ ,
   JVAR_COUNT 1+!
   TOJS-VAL \ init
   [ C' TOJS-VAL LIT, ] ,   
;

: NULL 
    S" null"  JEVAL
;

: []
    S" []" JEVAL
;

: {}
   S" {}" JEVAL
;

: TickStr ( str -- 'str' )
    <# [CHAR] ' HOLD HOLDS [CHAR] ' HOLD 0 0 #>
;

: StrToJ ( addr u -- J: str )
  TickStr JEVAL
;

: PARSE{ ( -- addr u )
   [CHAR] { SYSTEM-PAD C!
   1 >R
   BEGIN
      [CHAR] } DUP PARSE
      2DUP SYSTEM-PAD R@ + SWAP DUP R> + >R CMOVE
      + C@ = 0=
   WHILE
      REFILL 0= IF SYSTEM-PAD R> 2DUP + [CHAR] } SWAP C! 1+ EXIT THEN
   REPEAT SYSTEM-PAD R> 2DUP + [CHAR] } SWAP C! 1+
;

: {
  PARSE{
  STATE @ IF POSTPONE SLITERAL [ C' JEVAL LIT, ] COMPILE,
          ELSE JEVAL
          THEN
; IMMEDIATE
