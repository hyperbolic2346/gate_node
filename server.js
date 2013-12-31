var express = require('express'),
passport = require('passport'),
LocalStrategy = require('passport-local').Strategy,
mysql = require('mysql'),
port = 8888,
app = express(),
dgram = require('dgram'),
config = require('./config.js');

app.use(express.static(__dirname + '/docs'));

global.client = mysql.createConnection(config.get_sql_info());
 
client.connect();

app.use(express.cookieParser(config.get_cookie_secret()));
app.use(express.session({secret: config.get_session_secret()}));

app.use(express.logger());
app.use(express.bodyParser());
app.use(express.methodOverride());

app.use(passport.initialize());
app.use(passport.session());

var arduino_socket = dgram.createSocket("udp4");

arduino_socket.on('message', function(msg, rinfo) {
  console.log('arduino said ' + msg);
});

var message = new Buffer("status:*");
arduino_socket.send(message, 0, message.length, 8888, "10.0.1.25", function(err, bytes) {});

app.get("/", function(req, res) {
  if (req.user) {
    res.statusCode = 200;
    res.end();
  } else {
    console.log("invalid user information");
    res.statusCode = 401;
    res.end();
  }
});

var io = require('socket.io').listen(app.listen(port));

io.set('log level', 1);

app.get("/logout", function(req, res) {
  req.logout();
  res.redirect('/');
});

passport.use(new LocalStrategy(
  function(username, password, done) {
    return check_auth_user(username, password, done);
  }
));

app.post('/login', passport.authenticate('local'), 
  function(req, res) { res.redirect('/'); }
);

app.get('/list', function(req, res) {
  if (!req.user) {
    console.log("invalid user information");
    res.statusCode = 401;
    res.end();
    return;
  }

  var today = new Date();
  var date_of_interest = today.getFullYear().toString() + (today.getMonth() + 1).toString();
  if (today.getDate().toString().length == 1) {
    date_of_interest += "0" + today.getDate().toString();
  } else {
    date_of_interest += today.getDate().toString();
  }

  if (req.param('view_date')) {
    console.log("forcing date to " + req.param('view_date'));
    date_of_interest = req.param('view_date');
  }

  var sql = 'SELECT security_events.event_id, TIME(event_time_stamp) as timefield, event_time_stamp+1 as time_stamp, filename, file_type ' +
        'FROM security_file LEFT JOIN security_events ON security_file.event_id = security_events.event_id ' +
        'WHERE event_time_stamp >= ' + date_of_interest + '000000 ' +
        'AND event_time_stamp <= ' + date_of_interest + '235959 ' +
        'AND deleted = 0 ORDER BY security_events.event_id DESC';

  client.query(sql, function(err, results) {
    if (err) {
      throw err;
    }

    var return_val = '{"camera_data":[';
    var events = new Object;

    for (var i=0; i<results.length; ++i) {
      var result = results[i];
      if (result.file_type == 8) {
        var strtime = result.time_stamp.toString();

        var curr_hour = strtime.substr(8,2);
        var a_p = "";

        if (curr_hour < 12) { a_p = "AM"; } else { a_p = "PM"; }

        if (curr_hour == 0) { curr_hour = 12; }
        if (curr_hour > 12) { curr_hour -= 12; }

        var curr_min = strtime.substr(10,2);
        if (curr_min.length == 1) { curr_min = "0" + curr_min; }

        if (!events[result.event_id]) {
          events[result.event_id] = new Object;
        }

        events[result.event_id]['event_id'] = result.event_id;
        events[result.event_id]['movie'] = result.filename.replace(config.get_file_location(), '/media').slice(0, -4);
        events[result.event_id]['camera'] = result.camera;
        events[result.event_id]['pretty_time'] = curr_hour + ":" + curr_min + " " + a_p;
        events[result.event_id]['event_date'] = strtime.slice(0,8);

        if (!events[result.event_id]['thumbnail']) {
          events[result.event_id]['thumbnail'] = '/media/static';
        }
      } else if (result.file_type == 1) {
        events[result.event_id]['thumbnail'] = result.filename.replace(config.get_file_location(), '/media').slice(0, -4);
      }
    }

    var one = false;
    var event_txt = '';
    for (var idx in events) {
      var event = events[idx];
      if (one) {
        event_txt = ',' + event_txt;
      } else {
        one = true;
      }
      event_txt = '{"movie": "' + event.movie + '","pretty_time":"' + event.pretty_time + '","id":"' + event.event_id + '","thumbnail":"' + event.thumbnail + '"}' + event_txt;
    }

    if (!one) {
      res.send("{}");
    } else {
      return_val += event_txt;
      return_val += ']}';

      res.send(return_val);
    }
  });
});

app.get('/added', function(req, res) {
  if (!req.param('id')) {
    console.log("no incoming id for add request!");
    res.statusCode = 401;
    res.end();
    return;
  }

  if (!req.param('thumbnail') && !req.param('movie')) {
    console.log("no incoming thumbnail or movie!");
    console.log("thumbnail=" + req.param('thumbnail') + ", movie=" + req.param('movie'));
    res.statusCode = 401;
    res.end();
    return;
  }

  var response = {};

  // build a date
  var current_time = new Date();
  var curr_hour = current_time.getHours();
  var a_p = "";

  if (curr_hour < 12) { a_p = "AM"; } else { a_p = "PM"; }

  if (curr_hour == 0) { curr_hour = 12; }
  if (curr_hour > 12) { curr_hour -= 12; }

  var curr_min = current_time.getMinutes();
  if (curr_min.length == 1) { curr_min = "0" + curr_min; }

  response.pretty_time = curr_hour + ":" + curr_min + " " + a_p;

  if (req.param('thumbnail')) {
    response.thumbnail = req.param('thumbnail').slice(0, -4) + ".thumb.jpg";
  }

  if (req.param('movie')) {
    response.movie = req.param('movie');
  }

  response.id = req.param('id');

  io.sockets.emit('added', response);

  res.statusCode = 200;
  res.end();
});

app.get('/delete', function(req, res) {
  if (!req.param('id')) {
    console.log("no incoming id for delete request!");
    return;
  }

  var sql = 'UPDATE security_events set deleted=1 WHERE event_id="' + req.param('id') + '"';
  console.log(sql);

  client.query(sql, function(err, results) {
    if (err) {
      throw err;
      res.statusCode = 401;
      res.end();
    } else {
      // notify the other clients this id is gone
      io.sockets.emit('deleted', req.param('id'));

      res.statusCode = 200;
      res.end();
    }
  });
});

app.get('/gate_status', function(req, res) {
  if (!req.user) {
    console.log("invalid user information");
    res.statusCode = 401;
    res.end();
    return;
  }

  res.send("{}");
});

function check_auth_user(username, password, done) {
  var sql="SELECT * FROM users WHERE username = '" + username
          + "' AND password = '" + password + "'";
  console.log(sql);
  client.query(sql, function(err, results) {
    if (err) {
      throw err;
    }

    if (results.length > 0) {
      var result = results[0];
      //serialize the query result save whole data as session in req.user[] array  
      passport.serializeUser(function(res, done) {
        done(null,result);
      });
 
      passport.deserializeUser(function(id, done) {
        done(null,result);
      });

      //console.log(JSON.stringify(results));
      //console.log(results[0]['member_id']);
      console.log("User " + result.username + " logged in.");
      return done(null, result);
    } else {
      console.log("User " + result.username + " login fail.");
      return done(null, false);
    }
  });
}

console.log("Listening on port " + port);
