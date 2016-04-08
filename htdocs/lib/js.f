: NOTFOUND \ просто для сокращения asciiz литералов "zzz" = S" zzz" DROP
  OVER C@ [CHAR] " =
  IF NIP >IN @ SWAP - 0 MAX >IN !
     POSTPONE S" STATE @ 0= IF JEVAL ELSE POSTPONE JEVAL THEN
  ELSE NOTFOUND THEN
;


: -> ( "js method or property" -- J: value )
  NextWord POSTPONE SLITERAL
  STATE @ 0= IF JFETCH ELSE POSTPONE JFETCH THEN
; IMMEDIATE

: Dom.$ Dom.$ ; \ make normal forth word for postpone

: TickStr ( str -- 'str' )
    <# [CHAR] ' HOLD HOLDS [CHAR] ' HOLD 0. #>
;

: $
    NextWord
    TickStr
    STATE @ IF POSTPONE SLITERAL  POSTPONE JEVAL  POSTPONE Dom.$
            ELSE JEVAL Dom.$
            THEN
; IMMEDIATE

: J" ( str -- J: str )
    [CHAR] " PARSE
    TickStr
    STATE @ IF POSTPONE SLITERAL POSTPONE JEVAL
            ELSE JEVAL
            THEN
; IMMEDIATE
