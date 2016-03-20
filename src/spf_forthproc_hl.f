( Portions copyright [C] 1992-1999 A.Cherezov ac@forth.org )

0 CONSTANT FALSE ( -- false ) \ 94 CORE EXT
-1 CONSTANT TRUE ( -- true ) \ 94 CORE EXT
4 CONSTANT CELL
32 CONSTANT BL

: 0< 0 < ;
: 0= 0 = ;
: 1+ 1 + ;
: 1- 1 - ;
: 2+ 2 + ;
: 2* 1 LSHIFT ;
: CELL+ CELL + ;
: CELL- CELL - ;
: CELLS CELL * ;
: 2@ ( addr -- n1 n2 ) DUP CELL+ @ SWAP @ ;
: 2! DUP ROT SWAP ! CELL+ ! ;
: +! ( n addr ) DUP @ ROT + SWAP ! ;
: 0! 0 SWAP ! ;
: 1+! DUP @ 1 + SWAP ! ;
: <> = 0= ;
: D0< 
  NIP 31 RSHIFT 0= 0=
;
: D2* 
  2* OVER 31 RSHIFT OR SWAP 2* SWAP
;
: D2/
  DUP 1 AND >R
  2/ SWAP 1 RSHIFT R> 31 LSHIFT OR
  SWAP
;

: D<  
    ROT 2DUP = IF 2DROP < ELSE > NIP NIP THEN
;

: D=
    ROT = >R = R> AND
;

: DU< ( l1 h1 l2 h2 -- f )
    ROT SWAP
    2DUP = IF 2DROP U< 
           ELSE U< NIP NIP
           THEN
;

: ?DUP DUP IF DUP THEN ;

: TUCK SWAP OVER ;
: -ROT ROT ROT ;
: D0= OR 0= ;

: MAX 2DUP > IF DROP ELSE NIP THEN ;
: MIN 2DUP < IF DROP ELSE NIP THEN ;
: UMIN 2DUP U< IF DROP ELSE NIP THEN ;

: 0<> 0= 0= ;

: 2OVER 2>R 2DUP 2R> 2SWAP ;

: ?NEGATE   ( n f -- n' )
   0< IF NEGATE THEN 
;

: ABS   ( n -- +n )
          DUP ?NEGATE ;

: U>D 0 ;
: S>D DUP 0< ;
: D>S DROP ;
: 2- 2 - ;

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

: U> 2DUP = ROT ROT U< OR 0= ;

: ?DNEGATE  ( d f -- d' )
          0< IF DNEGATE THEN ;

: DABS   ( d -- +d )
          DUP ?DNEGATE ;
          
: M*/ ( d1 n1 +n2 -- d2 )
    >R 2DUP XOR R> SWAP >R \ save sign
    >R >R DABS R> ABS R>
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
          R> UM/MOD  SWAP 
          R> ?NEGATE 
          SWAP R> ?NEGATE ;

\ from CamelForth www.camelforth.com         
:  FM/MOD (  d1 n1 -- n2 n3   floored signed div'n )
   DUP >R            \  divisor
   2DUP XOR >R        \ sign of quotient
   >R                  \ divisor
   DABS R@ ABS UM/MOD
   SWAP R> ?NEGATE SWAP  \ apply sign to remainder
   R> 0< IF             \ if quotient negative,
       NEGATE
       OVER IF           \  if remainder nonzero,
         R@ ROT -  SWAP 1- \    adjust rem,quot
       THEN
   THEN  R> DROP ;
         
: /MOD      ( n1 n2 -- n3 n4 ) \ n3=remainder n4=quotient
          >R S>D R> SM/REM ;
    
: MOD       ( n1 n2 -- n3 ) \ n1 modulo n2
          /MOD DROP ;
    
: UMOD    ( n1 n2 -- n3 ) 0 SWAP UM/MOD DROP ;

: */MOD     ( n1 n2 n3 -- remainder and quotient from n1*n2/n3 )
          >R M* R>   SM/REM ;
    
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
      16777619 *  I C@ XOR
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

USER ALIGN-BYTES
: ALIGN-TO ( addr u -- addr1 )
    2DUP MOD DUP IF - + ELSE 2DROP THEN
;
DECIMAL
: ALIGNED ( addr -- a-addr ) \ 94
  ALIGN-BYTES @ ALIGN-TO
;

:  WITHIN  ( test low high -- flag )   OVER - >R - R>  U<  ;

: N>R
   DUP 1+
   BEGIN
     1- DUP
   WHILE
     ROT R> SWAP >R >R
   REPEAT DROP R> SWAP >R >R
;

: NR> 
   R> R> SWAP >R
   DUP 1+
   BEGIN
     1- DUP \ n count
   WHILE
     R> R> SWAP >R
     ROT ROT
   REPEAT DROP
;

: ASCIIZ> ( zaddr -- addr u )
   0
   BEGIN
     2DUP + C@ 0= IF EXIT THEN
     1+
   AGAIN
;

: -TRAILING ( c-addr u1 -- c-addr u2 )
   BEGIN
     DUP
   WHILE
     2DUP + 1- C@  BL =
   WHILE
      1-
   REPEAT THEN
;

: /STRING  ( c-addr1 u1 n -- c-addr2 u2 )
   >R  
  SWAP R@ +
  SWAP R> -
;

: BLANK ( c-addr u -- )
   OVER + SWAP ?DO BL I C! LOOP
;

: UNLOOP  \ 94
\ Интерпретация: семантика неопределена.
\ Выполнение: ( -- ) ( R: loop-sys -- )
\ Убрать параметры цикла текущего уровня. UNLOOP требуется для каждого
\ уровня вложения циклов перед выходом из определения по EXIT.
\ Неоднозначная ситуация возникает, если параметры цикла недоступны.
  
  R> RP@ 3 CELLS + RP! >R
;

: PICK ( xu ... x1 x0 u -- xu ... x1 x0 xu )
   CELLS SP@ SWAP - CELL- @
;

: DMAX 
   4 0 DO 3 PICK LOOP
   D< IF 2>R 2DROP 2R> 
      ELSE 2DROP
      THEN
;
: DMIN
   4 0 DO 3 PICK LOOP
   D< 0= IF 2>R 2DROP 2R> 
         ELSE 2DROP
         THEN
;

: 2ROT 5 ROLL 5 ROLL ;

