( Portions  Copyright [C] 1992-1999 A.Cherezov ac@forth.org )

USER     HLD

USER     BASE ( -- a-addr ) \ 94

4096 4096 CONSTANT NUMERIC-OUTPUT-LENGTH

USER-CREATE SYSTEM-PAD
CHARS
TC-USER-ALLOT

USER-CREATE PAD ( -- c-addr ) \ 94 CORE EXT
1024 CHARS TC-USER-ALLOT

: HEX ( -- ) \ 94 CORE EXT
  16 BASE !
;

: DECIMAL ( -- ) \ 94
  10 BASE !
;

: HOLD ( char -- ) \ 94
  HLD @ CHAR- 
  DUP SYSTEM-PAD U< IF -17 THROW THEN
  DUP HLD ! C!
;

: <# ( -- ) \ 94
  PAD CHAR- HLD !
  0 PAD CHAR- C!
;

: # ( ud1 -- ud2 ) \ 94
  0 BASE @ UM/MOD >R BASE @ UM/MOD R>
  ROT DUP 10 < 0= IF 7 + THEN 48 + 
  HOLD
;

: #S ( ud1 -- ud2 ) \ 94
  BEGIN
    # 2DUP D0=
  UNTIL
;

: #> ( xd -- c-addr u ) \ 94
  2DROP HLD @ PAD OVER - >CHARS 1-
;

: SIGN ( n -- ) \ 94
  0< IF [CHAR] - HOLD THEN
;

: (D.) ( d -- addr len )
  DUP >R DABS  <# #S R> SIGN #>
;

: D. ( d -- ) \ 94 DOUBLE
  (D.) TYPE SPACE
;

: . ( n -- ) \ 94
  S>D D.
;

: U. ( u -- ) \ 94
  U>D D.
;

: D.R ( d n -- )
  >R (D.) R> OVER -
  DUP 0 > IF SPACES TYPE
          ELSE DROP TYPE
          THEN
;

: HOLDS ( addr u -- ) \ from eserv src
  TUCK CHARS + SWAP 0 ?DO DUP I CHARS - CHAR- C@ HOLD ( /CHAR +LOOP FIXME) LOOP  DROP
;


: .0
  >R 0 <# #S #> R> OVER - 0 MAX DUP 
    IF 0 DO [CHAR] 0 EMIT LOOP
    ELSE DROP THEN TYPE 
;

: .TO-LOG ( n -- )
  S>D DUP >R DABS <# BL HOLD #S R> SIGN #> TO-LOG
;

: >PRT
  DUP BL U< IF DROP [CHAR] . THEN
;

: PTYPE
  0 DO DUP C@ >PRT EMIT 1+ LOOP DROP
;

: DUMP1 ( addr u -- ) \ 94 TOOLS
  DUP 0= IF 2DROP EXIT THEN
  BASE @ >R HEX
  15 + 16 U/ 0 DO
    CR DUP 4 .0 SPACE
    SPACE DUP 16 0
      DO I 4 MOD 0= IF SPACE THEN
        DUP C@ 2 .0 SPACE 1+
      LOOP SWAP 16  PTYPE
  LOOP DROP R> BASE ! CR
;

' DUMP1 ' DUMP TC-VECT!

: (.") ( T -> )
  COUNT TYPE
;
\ ' (.") TO (.")-CODE

: DIGIT ( C, N1 -> N2, TF / FF ) 
  SWAP
  DUP 58 <
      OVER 47 > AND
      IF \ within 0..9
         48 -
      ELSE
         DUP 64 >
         IF
           DUP 96 > IF 87 ELSE 55 THEN -
         ELSE 2DROP 0 EXIT THEN
      THEN
   TUCK > DUP 0= IF NIP THEN
;

: >NUMBER ( ud1 c-addr1 u1 -- ud2 c-addr2 u2 ) \ 94
  BEGIN
    DUP
  WHILE
    >R
    DUP >R
    C@ BASE @ DIGIT 0=     \ ud n flag
    IF R> R> EXIT THEN     \ ud n  ( ud = udh udl )
    SWAP BASE @ UM* DROP   \ udl n udh*base
    ROT BASE @ UM* D+      \ (n udh*base)+(udl*baseD)
    R> CHAR+ R> 1-
  REPEAT
;

: SCREEN-LENGTH ( addr n -- n1 )
  0 -ROT CHARS OVER + SWAP ?DO
    I C@ 9 = IF 3 RSHIFT 1+ 3 LSHIFT
    ELSE 1+ THEN
  \ /CHAR +LOOP \ FIXME
  LOOP
;
