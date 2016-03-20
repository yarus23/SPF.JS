\ Поиск слов в словарях и управление порядком поиска.
\  ОС-независимые определения.
\  Copyright [C] 1992-1999 A.Cherezov ac@forth.org
\  Преобразование из 16-разрядного в 32-разрядный код - 1995-96гг
\  Ревизия - сентябрь 1999

\  Mar.2012 - рефакторинг и исправление в search-order: GET-ORDER и SFIND
\  работали неверное при пустом контексте поиска; добавлено исключение
\  при исчерпании и переполнении. ~pinka


VECT FIND

VECT SEARCH-WORDLIST ( c-addr u wid -- 0 | xt 1 | xt -1 ) \ 94 SEARCH
\ Найти определение, заданное строкой c-addr u в списке слов, идентифицируемом 
\ wid. Если определение не найдено, вернуть ноль.
\ Если определение найдено, вернуть выполнимый токен xt и единицу (1), если 
\ определение немедленного исполнения, иначе минус единицу (-1).

USER-CREATE S-O 16 CELLS TC-USER-ALLOT \ порядок поиска
USER-CREATE S-O| \ верхняя граница области S-O
USER-VALUE CONTEXT    \ CONTEXT @ дает wid1
\ CONTEXT выполняет роль указателя вершины стека контекста
\ (данный стек растет в сторону увеличения адресов)


\ форт-реализация:
\ TODO: convert to javascript
: CDR-BY-NAME ( a u nfa1|0 -- a u nfa2|0 )
  BEGIN  ( a u NFA | a u 0 )
    DUP
  WHILE  ( a u NFA )
    >R 2DUP R@ COUNT COMPARE R> SWAP
  WHILE
    CDR  ( a u NFA2 )
  REPEAT THEN 
;

: SEARCH-WORDLIST-NFA ( c-addr u wid -- 0 | nfaONLY -1 )
    >R 2DUP R@ ROT ROT GET-CACHE-NAME DUP IF R> DROP NIP NIP -1 EXIT ELSE DROP THEN
    R>

    @ CDR-BY-NAME NIP NIP ?DUP 0<>
;

: SEARCH-WORDLIST1
   SEARCH-WORDLIST-NFA 0= IF 0 EXIT THEN
   DUP NAME>
   SWAP ?IMMEDIATE IF 1 EXIT THEN -1
;

' SEARCH-WORDLIST1 ' SEARCH-WORDLIST TC-VECT!



: SFIND ( addr u -- addr u 0 | xt 1 | xt -1 ) \ 94 SEARCH
\ Расширить семантику CORE FIND следующим:
\ Искать определение с именем, заданным строкой addr u.
\ Если определение не найдено после просмотра всех списков в порядке поиска,
\ возвратить addr u и ноль. Если определение найдено, возвратить xt.
\ Если определение немедленного исполнения, вернуть также единицу (1);
\ иначе также вернуть минус единицу (-1). Для данной строки, значения,
\ возвращаемые FIND во время компиляции, могут отличаться от значений,
\ возвращаемых не в режиме компиляции.
  S-O 1- CONTEXT
  DO
    2DUP I @ SEARCH-WORDLIST
    DUP IF 2SWAP 2DROP UNLOOP EXIT THEN DROP
   I S-O = IF LEAVE THEN
   1 CELLS NEGATE
  +LOOP
  0
;

: FIND1 ( c-addr -- c-addr 0 | xt 1 | xt -1 ) \ 94 SEARCH
\ Расширить семантику CORE FIND следующим:
\ Искать определение с именем, заданным строкой со счетчиком c-addr.
\ Если определение не найдено после просмотра всех списков в порядке поиска,
\ возвратить c-addr и ноль. Если определение найдено, возвратить xt.
\ Если определение немедленного исполнения, вернуть также единицу (1);
\ иначе также вернуть минус единицу (-1). Для данной строки, значения,
\ возвращаемые FIND во время компиляции, могут отличаться от значений,
\ возвращаемых не в режиме компиляции.
  DUP >R COUNT SFIND
  DUP 0= IF NIP NIP R> SWAP ELSE RDROP THEN
;

' FIND1 ' FIND TC-VECT!

: DEFINITIONS ( -- ) \ 94 SEARCH
\ Сделать списком компиляции тот же список слов, что и первый список в порядке 
\ поиска. Имена последующих определений будут помещаться в список компиляции.
\ Последующие изменения порядка поиска не влияют на список компиляции.
  CONTEXT @ SET-CURRENT
;

: GET-ORDER ( -- widn ... wid1 n ) \ 94 SEARCH
\ Возвращает количество списков слов в порядке поиска - n и идентификаторы 
\ widn ... wid1, идентифицирующие эти списки слов. wid1 - идентифицирует список 
\ слов, который просматривается первым, и widn - список слов, просматриваемый 
\ последним. Порядок поиска не изменяется.
  CONTEXT @ 0= IF 0 EXIT THEN

  CONTEXT 1+ S-O DO I @ 1 CELLS +LOOP
  CONTEXT S-O - 1 CELLS / 1+
;

: FORTH ( -- ) \ 94 SEARCH EXT
\ Преобразовать порядок поиска, состоящий из widn, ...wid2, wid1 (где wid1 
\ просматривается первым) в widn,... wid2, widFORTH-WORDLIST.
  FORTH-WORDLIST CONTEXT !
;

: ONLY ( -- ) \ 94 SEARCH EXT
  S-O TO CONTEXT
  FORTH
;

: SET-ORDER ( widn ... wid1 n -- ) \ 94 SEARCH
\ Установить порядок поиска на списки, идентифицируемые widn ... wid1.
\ Далее список слов wid1 будет просматриваться первым, и список слов widn
\ - последним. Если n ноль - очистить порядок поиска. Если минус единица,
\ установить порядок поиска на зависящий от реализации минимальный список
\ поиска.
\ Минимальный список поиска должен включать слова FORTH-WORDLIST и SET-ORDER.
\ Система должна допускать значения n как минимум 8.
   DUP IF DUP -1 = IF DROP ONLY EXIT THEN
          DUP 1- CELLS S-O + TO CONTEXT
          0 DO CONTEXT I CELLS - ! LOOP
       ELSE DROP S-O TO CONTEXT  CONTEXT 0! THEN
;

: ALSO! ( wid -- )
  CONTEXT CELL+ DUP S-O| U< IF DUP TO CONTEXT ! EXIT THEN
  -49 THROW
;
: ALSO ( -- ) \ 94 SEARCH EXT
\ Преобразовать порядок поиска, состоящий из widn, ...wid2, wid1 (где wid1 
\ просматривается первым) в widn,... wid2, wid1, wid1. Неопределенная ситуация 
\ возникает, если в порядке поиска слишком много списков.
  CONTEXT @ ALSO!
;
: PREVIOUS ( -- ) \ 94 SEARCH EXT
\ Преобразовать порядок поиска, состоящий из widn, ...wid2, wid1 (где wid1 
\ просматривается первым) в widn,... wid2. Неопределенная ситуация возникает,
\ если порядок поиска был пуст перед выполнением PREVIOUS.
  CONTEXT DUP S-O U> IF CELL- TO CONTEXT EXIT THEN
  -50 THROW
;


: VOC-NAME. ( wid -- ) \ напечатать имя списка слов, если он именован
  DUP FORTH-WORDLIST = IF DROP S" FORTH" TYPE EXIT THEN
  DUP CELL+ @ DUP IF ID. DROP ELSE DROP S" <NONAME>:" TYPE U. THEN
;

: ORDER ( -- ) \ 94 SEARCH EXT
\ Показать списки в порядке поиска, от первого просматриваемого списка до 
\ последнего. Также показать список слов, куда помещаются новые определения.
\ Формат изображения зависит от реализации.
\ ORDER может быть реализован с использованием слов форматного преобразования
\ чисел. Следовательно он может разрушить перемещаемую область, 
\ идентифицируемую #>.
  GET-ORDER S" Context: " TYPE
  0 ?DO ( DUP .) VOC-NAME. SPACE LOOP CR
  S" Current: " TYPE GET-CURRENT VOC-NAME. CR
;

: LATEST ( -> NFA )
  CURRENT @ @
;
