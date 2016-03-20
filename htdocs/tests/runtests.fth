\ ANS Forth tests - run all tests

\ Adjust the file paths as appropriate to your system
\ Select the appropriate test harness, either the simple tester.fr
\ or the more complex tester.fs 

CR .( Running ANS Forth test programs, version 0.10) CR

S" lib/case.f" INCLUDED
S" lib/tools.f" INCLUDED
S" lib/core-ext.f" INCLUDED

S" tests/tester.fr" INCLUDED

\   S" ttester.fs" INCLUDED
	S" tests/core.fr" INCLUDED

        S" tests/coreplustest.fth" INCLUDED
	S" tests/coreexttest.fth" INCLUDED
	S" tests/memorytest.fth" INCLUDED
	S" tests/doubletest.fth" INCLUDED
\	S" tests/filetest.fth" INCLUDED
	S" tests/searchordertest.fth" INCLUDED
	S" tests/stringtest.fth" INCLUDED
	S" tests/exceptiontest.fth" INCLUDED
	S" tests/toolstest.fth" INCLUDED
CR CR .( Forth tests completed ) CR CR


