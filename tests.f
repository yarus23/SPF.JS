\ ANS Forth tests - run all tests

\ Adjust the file paths as appropriate to your system
\ Select the appropriate test harness, either the simple tester.fr
\ or the more complex tester.fs 

CR .( Running ANS Forth test programs, version 0.10) CR

S" htdocs/lib/case.f" INCLUDED
S" htdocs/lib/tools.f" INCLUDED
S" htdocs/lib/core-ext.f" INCLUDED

S" htdocs/tests/tester.fr" INCLUDED

\   S" ttester.fs" INCLUDED
	S" htdocs/tests/core.fr" INCLUDED

        S" htdocs/tests/coreplustest.fth" INCLUDED
	S" htdocs/tests/coreexttest.fth" INCLUDED
	S" htdocs/tests/memorytest.fth" INCLUDED
	S" htdocs/tests/doubletest.fth" INCLUDED
	S" htdocs/tests/searchordertest.fth" INCLUDED
	S" htdocs/tests/stringtest.fth" INCLUDED
	S" htdocs/tests/exceptiontest.fth" INCLUDED
	S" htdocs/tests/toolstest.fth" INCLUDED
    S" htdocs/tests/filetest.fth" INCLUDED
CR CR .( Forth tests completed ) CR CR


