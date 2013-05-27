\\ bla

: t1 1 DUP DROP DROP 0 CHECK-DEPTH ;
: t2 1 DUP 1 1 2 CHECK-DATA ;

: t3 1 DROP 0 CHECK-DEPTH ;

: t4 1 2 NIP 2 1 CHECK-DATA ;
: t5 1 2 NIP 1 CHECK-DEPTH ;
: t6 1 1 NIP DROP 0 CHECK-DEPTH ;

: t7 S" abc" 2DROP 0 CHECK-DEPTH ;
: t8 ['] t1 DROP 0 CHECK-DEPTH ;

: a1 1 2 3 ;
: t9 ['] a1 EXECUTE  2DROP DROP 0 CHECK-DEPTH ;

: t10 0 IF 1 ELSE 2 THEN  1 CHECK-DEPTH ;
: t13 1 IF 1 ELSE 2 THEN 1 1 CHECK-DATA ;
: t11 0 IF 1 ELSE 2 THEN 2 1 CHECK-DATA ;

: t12 1 1 + 2 1 CHECK-DATA ;

: t14 1 2 SWAP 2 1 2 CHECK-DATA ;
: t15 0 3 BEGIN SWAP 2 + SWAP 1 - DUP 0 = UNTIL 6 0 2 CHECK-DATA ;
: t16_ 3 BEGIN 1 + DUP 7 = IF EXIT THEN AGAIN ;
: t16 t16_ 7 1 CHECK-DATA ;

: t17 0 BEGIN DUP 6 < WHILE 1 + REPEAT 6 1 CHECK-DATA S" t17 OK" TYPE ;

CREATE boom 2 ,
:  t18 boom @ 2 1 CHECK-DATA S" t18 OK" TYPE ;

: S>D DUP 0 < ;

: M+ ( d1|ud1 n -- d2|ud2 )  S>D D+ ;

: DNEGATE    \ d -- d' \ invert sign of double number
          INVERT >R INVERT R> 1 M+ ;

: D- DNEGATE D+ ;


: t19 -1 -1 1 0 D+ 0 0 2 CHECK-DATA S" t19 OK" TYPE ;
: t20 -1 -1 1 0  D- -2 -1 2 CHECK-DATA S" t20 OK" TYPE ;

: t21 1000 1000 1003 UM/MOD 198 -12846362 2 CHECK-DATA S" t21 OK" TYPE ;
: t22 10000 0 3 UM/MOD 1 3333 2 CHECK-DATA S" t22 OK" TYPE ;

: t23 0 5 0 DO 1 + LOOP 5 1 CHECK-DATA S" t23 OK" TYPE ;

: t24 0 5 0 DO 1 + 1 +LOOP 5 1 CHECK-DATA S" t24 OK" TYPE ;
: t25 1 0 ?DO 3 LOOP 3 1 CHECK-DATA S" t25 OK" TYPE ;
: t26 1 1 1 ?DO 3 LOOP 1 1 CHECK-DATA ;

S" src/spf_forthproc_hl.f" INCLUDE
S" src/spf_except.f"       INCLUDE
S" src/spf_print.f"        INCLUDE

: t27_ S" t27 callback" TYPE ;
: t27 ['] t27_ CATCH 0 1 CHECK-DATA ;

: t28_ -10 THROW ;
: t28 ['] t28_ CATCH -10 1 CHECK-DATA ;


: t29 1 2 3  SP@ SP! 1 2 3 3 CHECK-DATA ;
: t30 1 RP@ RP! 1 1 CHECK-DATA S" t30 ok" TYPE ;
: t31 1 1 >R R> DROP 1 1 CHECK-DATA S" t31 ok" TYPE ;
: t32 1 1 >R RDROP 1 1 CHECK-DATA S" t32 ok" TYPE  ;

: t33_ 1 0 / S" t33 ok" TYPE ;
: t33  ['] t33_ CATCH -10 1 CHECK-DATA ;

: t34 1 2 3 ROT 2 3 1 3 CHECK-DATA ;
: t35 1 2 3 4 2SWAP 3 4 1 2 4 CHECK-DATA ;

: POOL-INIT 
    DECIMAL
;

: test 
   POOL-INIT
   12345 .
   t1 t2 t3 t4 t5 t6 t7 t8 t9 t10 t11 t12 t13 t14 t15 t16 t17 t18  t19 t20 t21 
   t22 t23 t24 t25 t26 t27 t28 t29 t30 t31 t32 t33 t34 t35 S" OK" TYPE ;


: fib-iter ( n -- f )
  0 1 ROT 0 ?DO OVER + SWAP LOOP DROP ;
\ ' fib-iter SEE


: fib POOL-INIT 12345 . EXIT S" fib start" TYPE TIMER@ 100000000 fib-iter DROP TIMER@ 2SWAP D- DROP ..  S" fib done" TYPE ;

' test 0 !
