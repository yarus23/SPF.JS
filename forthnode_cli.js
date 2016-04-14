var spf = require('./htdocs/forth.js');
var words = require('./forthnode.js');
var fs = require('fs');
var path = require('path');

function start_forth(uri) {
        fs.readFile(path.join(__dirname, uri), function(err, data) {
            if( err ) throw err;

            var fs = new spf.Forth(data, {
               data_space_size: 1000000
            });
            console.log('FORTH image loaded');
            fs.addWords(words.words);
            fs.global.open_files = {};
            fs.global.open_files_count = 0;
            fs.start();
       });
}

start_forth('./forth.img');