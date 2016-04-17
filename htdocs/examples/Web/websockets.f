
js.f


: ConnectToServer ( J: addr -- wordlist )
    IO.connect
;


J" localhost:8000" ConnectToServer \ ALSO CONTEXT !

\ hello