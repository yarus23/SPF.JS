
-10 VALUE  H-STDIN 
-11 VALUE  H-STDOUT
-12 VALUE  H-STDERR
  0 VALUE  H-STDLOG

JS: TYPE

VECT DUMP

S" src/spf_double.f" INCLUDED
S" src/spf_forthproc_hl.f" INCLUDED

S" src/web/spf_web_io.f" INCLUDED
S" src/spf_except.f"       INCLUDED
S" src/spf_con_io.f"       INCLUDED

S" src/spf_print.f"        INCLUDED
S" src/spf_module.f"       INCLUDED
S" src/compiler/spf_parser.f"        INCLUDED

S" src/compiler/spf_read_source.f"   INCLUDED
S" src/compiler/spf_compile0.f"       INCLUDED
S" src/compiler/spf_compile.f"       INCLUDED
S" src/compiler/spf_wordlist.f"      INCLUDED


S" src/compiler/spf_error.f" INCLUDED
S" src/compiler/spf_find.f" INCLUDED
S" src/compiler/spf_translate.f"    INCLUDED
S" src/compiler/spf_immed_loop.f" INCLUDED

S" src/web/spf_web_memory.f"        INCLUDED
S" src/compiler/spf_defwords.f"     INCLUDED
S" src/compiler/spf_immed_control.f" INCLUDED
S" src/compiler/spf_immed_lit.f" INCLUDED
S" src/compiler/spf_immed_transl.f" INCLUDED
S" src/compiler/spf_literal.f" INCLUDED
S" src/compiler/spf_words.f" INCLUDED

S" src/spf_js_bridge.f"       INCLUDED

: SAVE ( addr u )
  R/W CREATE-FILE THROW >R
  IMAGE-BEGIN HERE OVER -
  R@ WRITE-FILE THROW
  R> CLOSE-FILE THROW
;

4 CONSTANT CELL

: CELLS CELL * ;
: <> = 0= ;

\ ' NOOP         ' <PRE>      TC-VECT!
\ ' FIND1        ' FIND       TC-VECT!
\ ' ?LITERAL2    ' ?LITERAL   TC-VECT!
\ ' ?SLITERAL2   ' ?SLITERAL  TC-VECT!
\ ' OK1          ' OK         TC-VECT!
\ ' (ABORT1")    ' (ABORT")   TC-VECT!
' QUIT      ' <MAIN>           TC-VECT!

VARIABLE ACTUAL-DEPTH			\ STACK RECORD
CREATE ACTUAL-RESULTS 80 ALLOT

  
4 CONSTANT  ALIGN-BYTES-CONSTANT
' ?SLITERAL2   ' ?SLITERAL  TC-VECT!

: FATAL-HANDLER1 ( err -- )
    DECIMAL
    
    ." UNHANDLED EXCEPTION: " DUP . CR
    ." RETURN STACK: " CR 
    R0 @ RP@ DUMP-TRACE  ERROR  CR 
    0 HALT
;

' FATAL-HANDLER1 ' FATAL-HANDLER TC-VECT!

: POOL-INIT
    DECIMAL
    SP@ S0 !
    RP@ R0 !
    CELL ALIGN-BYTES !
    ATIB TO TIB
    0 TO SOURCE-ID
    0 TO SOURCE-ID-XT
    S-O TO CONTEXT FORTH DEFINITIONS
    POSTPONE [
    HANDLER 0!
    CURSTR 0!
    CURFILE 0!
    INCLUDE-DEPTH 0!
    TRUE WARNING !
    12 C-SMUDGE !
    ALIGN-BYTES-CONSTANT ALIGN-BYTES !
    DOS-LINES
    UPDATE-VOCS-CACHE
;

: EMPTY-STACK S0 @ SP! ;

DECIMAL

: PLATFORM ( -- a u ) S" WEB" ;
   
: (TITLE)
  ." SP-FORTH - ANS FORTH 94 for " PLATFORM TYPE CR
  ." Open source project at http://spf.sf.net" CR
  ." Russian FIG at http://www.forth.org.ru ; Started by A.Cherezov" CR
  ." Adapted to JS by Dmitry Yakimov; yarus23@gmail.com" CR
;

: (OPTIONS) ( -- )
  ['] INTERPRET CATCH PROCESS-ERR THROW
;

JS: COMMANDLINE-OPTIONS

: OPTIONS ( -> ) \ interpret command line
   COMMANDLINE-OPTIONS ['] (OPTIONS) EVALUATE-WITH
;

: INIT 
   POOL-INIT SERVER?
   IF
      ['] JS-READ-LINE TO SOURCE-ID-XT
      1 TO SOURCE-ID
      ['] NOOP TO OK
   ELSE
      (TITLE) ['] OPTIONS CATCH ERROR
   THEN <MAIN>
;;

0 VALUE IMAGE-BASE

TC-VOC-LIST _VOC-LIST !
HERE ' (DP) CELL+ CELL+ !
' INIT 0 !
' FATAL-HANDLER 3 CELLS !

REPORT