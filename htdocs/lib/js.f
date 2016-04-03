: NOTFOUND \ просто для сокращения asciiz литералов "zzz" = S" zzz" DROP
  OVER C@ [CHAR] " =
  IF NIP >IN @ SWAP - 0 MAX >IN !
     POSTPONE S" STATE @ 0= IF JEVAL ELSE POSTPONE JEVAL THEN
  ELSE NOTFOUND THEN
;


: -> ( "js method or property" -- js_value )
  NextWord POSTPONE SLITERAL
  STATE @ 0= IF JFETCH ELSE POSTPONE JFETCH THEN
; IMMEDIATE

: Dom.$ Dom.$ ; \ make normal forth word for postpone

: $
    NextWord
    <# [CHAR] ' HOLD HOLDS [CHAR] ' HOLD 0. #>
    STATE @ IF POSTPONE SLITERAL  POSTPONE JEVAL  POSTPONE Dom.$
            ELSE JEVAL Dom.$
            THEN
; IMMEDIATE

