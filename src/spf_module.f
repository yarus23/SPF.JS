\ $Id: spf_module.f,v 1.2 2008/03/28 14:38:37 ygreks Exp $
\ 

S" src/web/module.f" INCLUDED

USER CURFILE

: CUT-PATH ( a u -- a u1 )
\ Из строки a u выделить часть от начала до последнего 
\ символа разделителя каталогов (включительно)
\ "some/path/name" -> "some/path/"
\ "some/path/" -> "some/path/"
\ "name" -> ""
\ Исходная строка остается неизменной (r/o).
  CHARS OVER +
  BEGIN 2DUP <> WHILE CHAR- DUP C@ is_path_delimiter UNTIL CHAR+ THEN
  OVER - >CHARS
;

: ModuleDirName ( -- addr u )
  ModuleName CUT-PATH
;

: +ModuleDirName ( addr u -- addr2 u2 )
\ Добавить addr u к "полный_путь_приложения/"
  2>R
  ModuleDirName 2DUP +
  2R> DUP >R ROT SWAP CHAR+ CHARS MOVE 
  R> +
;

: +LibraryDirName ( addr u -- addr2 u2 )
\ Add a u to the spf devel path
  2>R
  S" /devel/" >R PAD R@ CHARS MOVE
  PAD R>
  2DUP +
  2R> DUP >R ROT SWAP CHAR+ CHARS MOVE
  R> +
;

: +LibRootDirName ( addr u -- addr2 u2 )
\ Add a u to the spf devel path
  2>R
  S" /lib/" >R PAD R@ CHARS MOVE
  PAD R>
  2DUP +
  2R> DUP >R ROT SWAP CHAR+ CHARS MOVE
  R> +
;

: SOURCE-NAME ( -- a u )
  CURFILE @ DUP IF ASCIIZ> ELSE 0 THEN
;

