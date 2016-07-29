//This is needed in order to test 404.html, router.js, and api.html

//NPM-Free Server by The Jared Wilcurt
//All you need to run this is an installed copy of Node.JS

//Require in some of the native stuff that comes with Node
var http = require("http");
var url = require("url");
var path = require("path");
var fs = require("fs");
var io = require("socket.io")();

var spf = require('./htdocs/forth.js');
var words = require('./forthnode.js');


//Port number to use
var port = process.argv[2] || 8000;
//Colors for CLI output
var WHT = "\033[39m";
var RED = "\033[91m";
var GRN = "\033[32m";

//Create the server
var app = http.createServer(function (request, response) {

    //The requested URL like http://localhost:8000/file.html
    var uri = url.parse(request.url).pathname;
    //get the file.html from above and then find it from the current folder
    var filename = path.join(process.cwd(), "htdocs/" + uri);

    //Setting up MIME-Types
    var contentTypesByExtension = {
        '.html': "text/html",
        '.css':  "text/css",
        '.js':   "text/javascript",
        ".json": "text/json"
    };

    //Check if the requested file exists
    fs.exists(filename, function(exists) {
        //If it doesn't
        if (!exists) {
            //Output a red error pointing to failed request
            console.log(RED + "FAIL: " + filename);
            //Redirect the browser to the 404 page
            filename = path.join(process.cwd(), '/404.html');
        //If the requested URL is a folder, like http://localhost:8000/catpics
        } else if (fs.statSync(filename).isDirectory()) {
            //Output a green line to the console explaining what folder was requested
            console.log(GRN + "FLDR: " + WHT + filename);
            //redirect the user to the index.html in the requested folder
            filename += '/index.html';
        }

        //Assuming the file exists, read it
        fs.readFile(filename, "binary", function(err, file) {
            //Output a green line to console explaining the file that will be loaded in the browser
            console.log(GRN + "FILE: " + WHT + filename);
            //If there was an error trying to read the file
            if (err) {
                //Put the error in the browser
                response.writeHead(500, {"Content-Type": "text/plain", 'Cache-Control': 'no-cache, private, no-store, must-revalidate'});
                response.write(err + "\n");
                response.end();
                return;
            }

            //Otherwise, declar a headers object and a var for the MIME-Type
            var headers = {};
            var contentType = contentTypesByExtension[path.extname(filename)];
            //If the requested file has a matching MIME-Type
            if (contentType) {
                //Set it in the headers
                headers["Content-Type"] = contentType;
                headers['Cache-Control']  = 'no-cache, private, no-store, must-revalidate';
            }

            //Output the read file to the browser for it to load
            response.writeHead(200, headers);
            response.write(file, "binary");
            response.end();
        });

    });

}).listen(parseInt(port, 10));

var forth_instance;

function start_forth(uri) {
        fs.readFile(path.join(__dirname, uri), function(err, data) {
            if( err ) throw err;

            var fs = new spf.Forth(data, {
               data_space_size: 1000000,
               server: true
            });
            console.log('FORTH image loaded');
            fs.addWords(words.words);
            fs.global.open_files = {};
            fs.global.open_files_count = 0;
            fs.to_eval_queue('S\" ./lib/server.f\" INCLUDED');
            fs.start();
            forth_instance =  fs;

            io.listen(app);
       });
}

start_forth('./forth.img');


io.on('connection', function(socket) {
    // Use socket to communicate with this particular client only, sending it it's own id
    console.log('Connected client ' + socket.id);
    socket.emit('welcome', { message: 'Welcome!', id: socket.id });

    socket.on('spf', function(msg) { 
        console.log(msg);
        if( msg.code ) {
            forth_instance.to_eval_queue(msg.code);
            forth_instance.global.jstack.push(msg);
            forth_instance.start(); // process messages

            if( forth_instance.global.jstack.length )
               msg = forth_instance.global.jstack.pop();
            else msg = {};
            socket.emit('return', msg);
        }
    });
});

//Message to display when server is started
console.log(WHT + "Static file server running at\n  => http://localhost:" + port + "/\nCTRL + C to shutdown");

