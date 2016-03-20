\ $Id: spf_compile.f,v 1.19 2008/04/29 13:38:05 ruv Exp $

\ Компиляция чисел и строк в словарь.
\  ОС-независимые определения.
\  Copyright [C] 1992-1999 A.Cherezov ac@forth.org
\  Преобразование из 16-разрядного в 32-разрядный код - 1995-96гг
\  Ревизия - сентябрь 1999, март 2000


HEX


\ Слова для выравнивания (ALIGN*) в SPF используются для выравнивания
\ кода форт-слов и данных после CREATE


: ALIGN ( -- ) \ 94
\ Если указатель пространства данных не выровнен -
\ выровнять его.
  DP @ ALIGNED DP @ - ALLOT
;


: HERE ( -- addr ) \ 94
\ addr - указатель пространства данных.
  DP @ 
;

: PRIMITIVE,  \ 94 CORE EXT
\ Интерпретация: семантика не определена.
\ Выполнение: ( xt -- )
\ Добавить семантику выполнения определения, представленого xt, к
\ семантике выполнения текущего определения.
  ,
;

: COMPILE,  \ 94 CORE EXT
\ Интерпретация: семантика не определена.
\ Выполнение: ( xt -- )
\ Добавить семантику выполнения определения, представленого xt, к
\ семантике выполнения текущего определения.

   DUP CELL+ @ [ ' EXIT LIT, ] =
   OVER [ PRIMITIVES-END LIT, ] < AND
   IF \ primitive
      2 CELLS + ( skip primitive for colon word case and EXIT ) @ ,
   ELSE \ colon word
      [ ' (DOCOL) LIT, ] , ,
   THEN
;

: RET, ( -> ) \ скомпилировать инструкцию RET
  [ ' EXIT LIT, ] PRIMITIVE,
;


: BRANCH, ( ADDR -> ) \ скомпилировать инструкцию ADDR JMP
  [ ' (BRANCH) LIT, ] PRIMITIVE,
  DUP IF DP @ - CELL+ THEN ,
;


: LIT, ( W -> )
  [ ' (LIT) LIT, ] PRIMITIVE, ,
;

: DLIT, ( D -> )
  SWAP LIT, LIT,
;

: RLIT, ( u -- )
\ Скомпилировать следующую семантику:
\ Положить на стек возвратов литерал u
   [ ' (LIT) LIT, ] PRIMITIVE, ,
   [ ' >R LIT, ] PRIMITIVE,
;

: ?BRANCH, ( ADDR -> ) \ скомпилировать инструкцию ADDR ?BRANCH
  [ ' (?BRANCH) LIT, ] PRIMITIVE,
  DUP IF DP @ - CELL+ THEN ,
;

DECIMAL

: S, ( addr u -- )
\ Зарезервировать u символов пространства данных
\ и поместить туда содержимое u символов из addr.
  CHARS DP @ SWAP DUP ALLOT MOVE
;

: S", ( addr u -- ) 
\ Разместить в пространстве данных строку, заданную addr u, 
\ в виде строки со счетчиком.
  DUP 255 U> IF -18 THROW THEN
  DUP C, S, ALIGN
;

: SLIT, ( a u -- ) 
\ Скомпилировать строку, заданную addr u.
  [ ' (SLIT) LIT, ] PRIMITIVE,
  DUP 255 U> IF -18 THROW THEN
  DUP C, S,
  0 C, ALIGN
;

: ", ( A -> )
\ разместить в пространстве данных строку, заданную адресом A, 
\ в виде строки со счетчиком
  COUNT S",
;

\ orig - a, 1 (short) или a, 2 (near)
\ dest - a, 3

: >MARK ( -> A )
  DP @ CELL- 
;

: <MARK ( -> A )
  HERE
;

: >ORESOLVE1 ( A -> )
    DP @ ( A DP )
    OVER - 1 CELLS +
    SWAP !
;

: >ORESOLVE ( A, N -- )
  DUP 1 = IF   DROP >ORESOLVE1
          ELSE 2 <> IF -2007 THROW THEN \ ABORT" Conditionals not paired"
               >ORESOLVE1
          THEN
;

: >RESOLVE1 ( A -> )
  >ORESOLVE
;

: >RESOLVE ( A, N -- )
  >RESOLVE1
;

: ALIGN-NOP ( n -- )
\ выровнять HERE на n и заполнить NOP
  HERE DUP ROT ALIGN-TO
  OVER - DUP ALLOT 0 FILL
;
