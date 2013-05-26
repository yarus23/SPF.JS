0 CONSTANT FALSE ( -- false ) \ 94 CORE EXT
-1 CONSTANT TRUE ( -- true ) \ 94 CORE EXT
4 CONSTANT CELL
20 CONSTANT BL

: 0< 0 < ;
: 1+ 1 + ;
: 1- 1 - ;
: ?DUP DUP IF DUP THEN ;
: RDROP 2R> NIP >R ;
: UNLOOP R> 2R> DROP DROP >R ;
: TUCK SWAP OVER ;
: -ROT ROT ROT ;
: D0= OR 0= ;
: SPACE 20 EMIT ;
: MAX 2DUP > IF DROP ELSE NIP THEN ;

: ?NEGATE   ( n f -- n' )
   0< IF NEGATE THEN 
;

: ABS   ( n -- +n )
          DUP ?NEGATE ;

: U>D DUP ;
: S>D DUP 0< ;

: M+ ( d1|ud1 n -- d2|ud2 )  S>D D+ ;

: DNEGATE    ( d -- d' ) \ invert sign of double number
          INVERT >R INVERT R> 1 M+ ;

: D- DNEGATE D+ ;

: T*    ( ud un -- ut ) DUP ROT UM* 2>R UM* 0 2R> D+ ;
 
: T/    ( ut un -- ud )
    >R   R@ UM/MOD SWAP
    ROT 0 R@ UM/MOD SWAP
    ROT   R> UM/MOD SWAP DROP
    0 2SWAP SWAP D+
;
 
: U*/    ( ud un un -- ud )    >R T* R> T/ ;

: ?DNEGATE  ( d f -- d' )
          0< IF DNEGATE THEN ;

: DABS   ( d -- +d )
          DUP ?DNEGATE ;
          
: M*/ ( d1 n1 +n2 -- d2 )
    >R 2DUP XOR R> SWAP >R \ save sign
    >R DABS R> ABS
    U*/ 
    R> ?DNEGATE
;


: M* ( n1 n2 -- d )    \ signed multiply, single to double
          2DUP XOR >R   \ gives the sign of the result
          >R   ABS   R> ABS UM*   R> ?DNEGATE ;

         
: SM/REM   ( d n1 -- n2 n3 ) \ signed UM/MOD, rounding towards zero
          2DUP XOR >R     \ gives the sign of the quotient
          OVER >R          \ gives the sign of the remainder
          ABS >R DABS 
          R> UM/MOD SWAP 
          R> ?NEGATE 
          SWAP R> ?NEGATE ;
          
: FM/MOD   ( d n1 -- n2 n3 ) \ signed UM/MOD, rounding towards -infinity
          DUP >R             \ save divisor
          SM/REM DUP 0< IF    \ quotient is negative?
          SWAP R> + SWAP 1+ ELSE  
          R> DROP THEN ;
          
: /MOD      ( n1 n2 -- n3 n4 ) \ n3=remainder n4=quotient
          >R S>D R> FM/MOD ;
    
: MOD       ( n1 n2 -- n3 ) \ n1 modulo n2
          /MOD DROP ;
    
: UMOD    ( n1 n2 -- n3 ) 0 SWAP UM/MOD DROP ;

: */MOD     ( n1 n2 n3 -- remainder and quotient from n1*n2/n3 )
          >R M* R>   FM/MOD ;
    
: */        ( n1 n2 n3 -- n1*n2/n3 ) 
          */MOD NIP ; 

: CHAR+ ( c-addr1 -- c-addr2 ) \ 94
  1+
;
: CHAR- ( c-addr1 -- c-addr2 ) \ 94
  1-
;
: CHARS ( n1 -- n2 ) \ 94
; IMMEDIATE

: >CHARS ( n1 -- n2 ) \ "to-chars"
; IMMEDIATE

: >CELLS ( n1 -- n2 ) \ "to-cells" [http://forth.sourceforge.net/word/to-cells/index.html]
\ Convert n1, the number of bytes, to n2, the corresponding number
\ of cells. If n1 does not correspond to a whole number of cells, the
\ rounding direction is system-defined.
  2 RSHIFT
;

: MOVE ( addr1 addr2 u -- ) \ 94
  >R 2DUP SWAP R@ + U< 
  IF 2DUP U<
     IF R> CMOVE> ELSE R> CMOVE THEN
  ELSE R> CMOVE THEN
;
: ERASE ( addr u -- ) \ 94 CORE EXT
  0 FILL
;

: CZMOVE ( a # z --) 2DUP + >R SWAP CMOVE R> 0 SWAP C! ;

: DABS ( d -- ud ) \ 94 DOUBLE
  DUP 0< IF DNEGATE THEN
;

: HASH ( addr u u1 -- u2 )
   2166136261 2SWAP
   OVER + SWAP 
   ?DO
      16777619 * I C@ XOR
   LOOP
   SWAP ?DUP IF UMOD THEN   
;

HEX

CREATE LT 0A0D , \ line terminator
CREATE LTL 2 ,   \ line terminator length

: DOS-LINES ( -- )
  0A0D LT ! 2 LTL !
;
: UNIX-LINES ( -- )
  0A0A LT ! 1 LTL !
;

DECIMAL

: EOLN ( -- a u ) LT LTL @ ;

: CR EOLN TYPE ;

: COUNT ( c-addr -- addr u )
    DUP C@ SWAP 1+ SWAP
; 
