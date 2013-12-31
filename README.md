Using node.js to read from the mysql database written from motion.
Motion is a camera motion detection program that stores videos and images from interesting events on camera.

media is a symbolic link to the directory where the filenames are stored in the db. The prefix defined in the config file will be replaced with
/media for web links.

node libraries required:
========================

 * express
 * mysql
 * passport
 * passport-local
 * socket.io

Startup
-------
install/build node.js

use npm to install dependencies

copy config_example.js to config.js
edit values to your situation

run the server.js file
