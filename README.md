SPF.JS
======

The advanced FORTH environment in web, written in javascript. 100% ANS 94 compatible, SP-FORTH compatible.
Features will include:

- write FORTH system in FORTH itself, not javascript
- ultra speed near to speed of pure javascript
- JIT compiler
- ability to use FORTH code from node.js to write server side FORTH applications
- web console written in FORTH
- ability to compile 16-bit version for testing embedded devices
- ability to save and load binary FORTH image
- ability to write javascript code within a FORTH code
- ability to multitasking via web worker
- fQuery like library
- ability to make standalone programs via webkit+nodejs

status:

- 100% virtual machine
- 100%  target compiler
- 100%  ANS 94 wordset
- 50%   web console

Just run a http server (for Windows I recommend miniweb) , point it to htdocs directory and load it in browser and look at console.
Or start local FORTH system with help of node.js

Dmitry Yakimov aka (~day)
write me at yarus23@gmail.com

license is Public domain and apache 2.0 as you wish
