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

var Arduino_socket = dgram.createSocket("udp4");

var Arduino_response = [];

var Arduino_timeout = 0;

Arduino_socket.on('message', function(msg, rinfo) {
  var new_arduino_response = [];
  var statuses = JSON.parse(msg);
  var diff = 0;

  for (var idx in statuses) {
    var status = statuses[idx];

    // hackaroo
    if (idx == 0 && status.state == "MOVING") {
      // fake it closed :(
      status.state = "CLOSED";
    }

    status.id = idx;
    if (Arduino_response.length == 0 || status.state != Arduino_response[idx].state || status.hold_state != Arduino_response[idx].hold_state) {
      diff = 1;
    }
    new_arduino_response.push(status);
  }

  Arduino_response = new_arduino_response;

  // compare old and new state, if there is an update, broadcast it
  if (diff == 1) {
    // different values, tell the clients
    io.sockets.emit('gate_status', Arduino_response);

    // and update more frequently for a bit
    Arduino_timeout = 1000;
    setTimeout(timeout_tick, 5000);
  }
});

function update_gate_info() {
  var message = new Buffer("status:*");
  Arduino_socket.send(message, 0, message.length, 8888, "10.0.1.25", function(err, bytes) {});

  if (Arduino_timeout > 0) {
    setTimeout(update_gate_info, Arduino_timeout);
  }
}

function add_tag(e_id, t_id) {
  var post = { event_id: e_id, tag_id: t_id };

  client.query('SELECT * FROM event_tag_mappings WHERE event_id = ? AND tag_id = ?', [e_id, t_id], function(err, results) {
    if (err) {
      throw err;
      return;
    } else {
      if (results.length == 0) {
        client.query('INSERT into event_tag_mappings set ?', post, function(err2, result) {
          if (err2) {
            throw err2;
          }
          console.log('inserted tag mapping ' + post.event_id + ' -> ' + post.tag_id);
        });
      }
    }
  });
}

function timeout_tick() {
  if (Arduino_timeout > 0 && Arduino_timeout < 5000 ) {
    Arduino_timeout += 500;
    if (Arduino_timeout < 5000) {
      setTimeout(timeout_tick, 5000);
    }
  }
}

function get_date_as_string(dt)
{
  var date_of_interest = dt.getFullYear().toString();

  if ((dt.getMonth() + 1).toString().toString().length == 1) {
    date_of_interest += "0" + (dt.getMonth() + 1).toString().toString();
  } else {
    date_of_interest += (dt.getMonth() + 1).toString();
  }

  if (dt.getDate().toString().length == 1) {
    date_of_interest += "0" + dt.getDate().toString();
  } else {
    date_of_interest += dt.getDate().toString();
  }

  return date_of_interest;
}

function build_events_data(events)
{
  var return_val = '{"camera_data":[';

  var event_txt = '';
  for (var idx in events) {
    var event = events[idx];

    new_event_txt = '{"movie": "' + event.movie + '","pretty_time":"' + event.pretty_time + '","id":"' 
      + event.event_id + '","thumbnail":"' + event.thumbnail + '","pretty_date":"' + event.pretty_date + '"';
    if (event.can_delete) {
      new_event_txt += ',"can_delete":"true"';
    }
    if (event.can_tag) {
      new_event_txt += ',"can_tag":"true"';
    }

    new_event_txt += ',"tags":"' + event.tags + '"';
    
    new_event_txt += '}';
    
    if (event_txt.length > 0) {
      new_event_txt += ',';
    }

    event_txt = new_event_txt + event_txt;
  }

  if (events.length == 0) {
    return "{}";
  } else {
    return_val += event_txt;
    return_val += ']}';

    return return_val;
  }
}

function process_event_sql_result(sql_result, req, callback)
{
  var events = new Object;

  var num_events = sql_result.length;
  var num_files_read = 0;
  var num_tags_read = 0;

  if (num_events == 0) {
    callback(build_events_data(events));
    return;
  }

  for (var i=0; i<num_events; ++i) {
    var result = sql_result[i];

    if (!events[result.event_id]) {
      events[result.event_id] = {};
    }

    events[result.event_id]['event_id'] = result.event_id;

    var strtime = result.time_stamp.toString();
    
    var curr_hour = strtime.substr(8,2);
    var a_p = "";
    
    if (curr_hour < 12) { a_p = "AM"; } else { a_p = "PM"; }
    
    if (curr_hour == 0) { curr_hour = 12; }
    if (curr_hour > 12) { curr_hour -= 12; }
    
    var curr_min = strtime.substr(10,2);
    if (curr_min.length == 1) { curr_min = "0" + curr_min; }

    events[result.event_id]['camera'] = result.camera;
    events[result.event_id]['pretty_time'] = curr_hour + ":" + curr_min + " " + a_p;
    events[result.event_id]['event_date'] = strtime.slice(0,8);
    events[result.event_id]['pretty_date'] = strtime.slice(4,2) + '/' + strtime.slice(6,2) + '/' + strtime.slice(0, 4);

    if (req.user.access_level == 0) {
      events[result.event_id]['can_delete'] = true;
      events[result.event_id]['can_tag'] = true;
    }

    events[result.event_id]['tags'] = "";
    
    // find files for these events
    var file_sql = 'SELECT event_id, filename, file_type FROM security_file WHERE event_id = ?';
    client.query(file_sql, result.event_id, function(err, file_results) {
      if (err) {
        throw err;
      }

      for (var j=0; j<file_results.length; ++j) {
        var file_result = file_results[j];

        if (file_result.file_type == 8) {
                events[file_result.event_id]['movie'] = file_result.filename.replace(config.get_file_location(), '/media').slice(0, -4);
          
                if (!events[file_result.event_id]['thumbnail']) {
                  events[file_result.event_id]['thumbnail'] = '/media/static';
                }
        } else if (file_result.file_type == 1) {
                events[file_result.event_id]['thumbnail'] = file_result.filename.replace(config.get_file_location(), '/media').slice(0, -4);
        }
      }

      num_files_read++;
      if (num_files_read == num_events && num_tags_read == num_events) {
        callback(build_events_data(events));
      }
    });

    // find tags for these events
    var tag_sql = 'SELECT tag_val, event_id FROM event_tag_mappings LEFT JOIN tags ON tags.tag_id = event_tag_mappings.tag_id ' +
                  'WHERE event_id = ?';
    client.query(tag_sql, result.event_id, function(err, tag_results) {
      if (err) {
        throw err;
      }

      for (var j=0; j<tag_results.length; ++j) {
        events[tag_results[j].event_id]['tags'] += tag_results[j].tag_val;

        if (j + 1 != tag_results.length) {
          events[tag_results[j].event_id]['tags'] += " ";
        }
      }

      num_tags_read++;
      if (num_files_read == num_events && num_tags_read == num_events) {
        callback(build_events_data(events));
      }
    });
  }
}

function generate_list_of_events_for_tag(tag_id, req, callback)
{
  var sql = 'SELECT security_events.event_id, TIME(event_time_stamp) as timefield, ' +
    'event_time_stamp+1 as time_stamp, camera FROM event_tag_mappings ' +
    'LEFT JOIN security_events ON event_tag_mappings.event_id = security_events.event_id ' +
    'WHERE event_tag_mappings.tag_id  = ? AND deleted = 0 ORDER BY event_time_stamp DESC';

  client.query(sql, [tag_id], function(err, results) {
    if (err) {
      throw err;
    }

    process_event_sql_result(results, req, callback);
  });
}

function generate_list_of_events(date_of_interest, req, callback)
{
  var sql = 'SELECT event_id, TIME(event_time_stamp) as timefield, ' +
    'event_time_stamp+1 as time_stamp, camera FROM security_events ' +
    'WHERE event_time_stamp >= ? AND event_time_stamp <= ? ' +
    'AND deleted = 0 ORDER BY event_time_stamp DESC';

  client.query(sql, [date_of_interest + '000000', date_of_interest + '235959'], function(err, results) {
    if (err) {
      throw err;
    }

    process_event_sql_result(results, req, callback);
  });
}

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

var Num_clients = 0;

io.sockets.on('connection', function (socket) {
  if (Num_clients == 0 && config.control_gate()) {
    // first client, start timeout
    Arduino_timeout = 5000;
    setTimeout(update_gate_info, Arduino_timeout);
    console.log("starting gate polling");
  }

  Num_clients++;

  socket.on('disconnect', function () {
    if (Num_clients == 1 && config.control_gate()) {
      // no more clients, no more status updates
      Arduino_timeout = 0;
      console.log("stopping gate polling");
    }

    Num_clients--;
  });
});

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

  if (req.param('tag')) {
    // we want a list of tags, not everything from today
    generate_list_of_events_for_tag(req.param('tag'), req, function(return_val) {
      res.send(return_val);
    });
  } else {
    var date_of_interest = get_date_as_string(new Date());

    if (req.param('view_date')) {
      date_of_interest = req.param('view_date');
    }

    generate_list_of_events(date_of_interest, req, function(return_val) {
      res.send(return_val);
    });
  }
});

app.get('/list-tags', function(req, res) {
  if (!req.user) {
    console.log("invalid user information");
    res.statusCode = 401;
    res.end();
    return;
  }

  var sql = 'SELECT tags.tag_id as id, tag_val AS val, COUNT( * ) AS count FROM event_tag_mappings ' +
            'LEFT JOIN tags ON tags.tag_id = event_tag_mappings.tag_id ' +
            'GROUP BY event_tag_mappings.tag_id ORDER BY count DESC';

  client.query(sql, function(err, tag_results) {
    if (err) {
      throw err;
    }

    var return_val = '[';

    for (var i=0; i<tag_results.length; ++i) {
      var tag = tag_results[i];
      if (return_val.length > 1) {
        return_val += ',';
      }
      return_val += JSON.stringify(tag);
    }
    return_val += ']';

    res.send(return_val);
  });
});

app.get('/valid_user', function(req, res) {
  if (!req.user) {
    console.log("invalid user information");
    res.statusCode = 401;
    res.end();
  } else {
    res.statusCode = 200;
    res.end();
  }
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

  var curr_min = current_time.getMinutes().toString();
  if (curr_min.length == 1) { curr_min = "0" + curr_min; }

  response.pretty_time = curr_hour + ":" + curr_min + " " + a_p;

  response.event_date = get_date_as_string(current_time);

  if (req.param('thumbnail')) {
    response.thumbnail = req.param('thumbnail').slice(0, -4);
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
  if (!req.user || req.user.access_level != 0) {
    console.log("invalid user information");
    res.statusCode = 401;
    res.end();
    return;
  }

  if (!req.param('id')) {
    console.log("no incoming id for delete request!");
    return;
  }

  client.query('UPDATE security_events set deleted=1 WHERE ?', {event_id: req.param('id')}, function(err, results) {
    if (err) {
      throw err;
      res.statusCode = 401;
      res.end();
    } else {
      var find_sql = 'SELECT event_time_stamp+1 AS time_stamp FROM security_events WHERE ?';

      client.query(find_sql, {event_id: req.param('id')}, function(err, results) {
        if (err) {
          throw err;
          res.statusCode = 401;
          res.end();
        } else {
          // notify the other clients this id is gone
          var response = {};

          response.event_date = results[0].time_stamp.toString().slice(0,8);

          response.id = req.param('id');

          io.sockets.emit('deleted', response);

          res.statusCode = 200;
          res.end();
        }
      });
    }
  });
});

app.get('/update_tag', function(req, res) {
  if (!req.user || req.user.access_level != 0) {
    console.log("invalid user information");
    res.statusCode = 401;
    res.end();
    return;
  }

  if (!req.param('id')) {
    console.log("no incoming id for tag request!");
    return;
  }

  var existing_tag_query = 'SELECT tag_val, tags.tag_id from event_tag_mappings LEFT JOIN tags ON tags.tag_id = event_tag_mappings.tag_id WHERE ?';
  client.query(existing_tag_query, {event_id: req.param('id')}, function(err, results) {
    if (err) {
      throw err;
      res.statusCode = 401;
      res.end();
      return;
    } else {
      var existing_tags = {};
      for (var idx in results) {
        existing_tags[results[idx].tag_val] = results[idx].tag_id;
      }

      if (req.param('val')) {
        var words = req.param('val').split(" ");

        for (var idx in words) {
          var tag_word = words[idx];
          console.log(' - ' + tag_word);

          // first see if there is a tag_id for this, if not create one
          if (existing_tags[tag_word]) {
            // existing, remove it from the list and ignore
            delete existing_tags[tag_word];
            console.log('   - existing');
          } else {
            console.log('   - creating');
            (function (_tag_word) {
              // not in the list, see if the have a tag for it
              client.query('SELECT tag_id from tags WHERE ?', {tag_val: _tag_word}, function(err, results) {
                if (err) {
                  throw err;
                  res.statusCode = 401;
                  res.end();
                  return;
                } else {
                  if (results.length >= 1) {
                    // found the tag_id, so just add it to our list
                    add_tag(req.param('id'), results[0].tag_id);
                  } else {
                    // no tag currently, so we make one
                    var post = { tag_val: _tag_word };

                    client.query('INSERT into tags set ?', post, function(err2, result) {
                      if (err2) {
                        throw err2;
                        res.statusCode = 401;
                        res.end();
                        return;
                      } else {
                        add_tag(req.param('id'), result.insertId);
                      }
                    });
                  }
                }
              });
            })(tag_word);
          }
        }
      }

      // now see if we have anything removed
      for (var idx in existing_tags) {
        var params = [existing_tags[idx], req.param('id')];
        client.query('DELETE FROM event_tag_mappings WHERE tag_id = ? AND event_id = ?', params, function(err2, result) {
          if (err2) {
            throw err2;
            res.statusCode = 401;
            res.end();
            return;
          }

          // see if we need to nuke this now unused tag
          var params = [existing_tags[idx]];
          client.query('SELECT COUNT(*) as num_used FROM event_tag_mappings WHERE tag_id = ?', params, function(err3, count_result) {
            if (err3) {
              throw err3;
              res.statusCode = 401;
              res.end();
              return;
            }

            if (count_result.length > 0 && count_result[0].num_used == 0) {
              // ok, so nuke him
              var params = [existing_tags[idx]];
              client.query('DELETE FROM tags WHERE tag_id = ?', params, function(err4, nuke_result) {
                if (err4) {
                  throw err4;
                  res.statusCode = 401;
                  res.end();
                  return;
                }
              });
            }
          });
        });
      }
    }
  });

  res.statusCode = 200;
  res.end();
});

app.get('/gate_status', function(req, res) {
  if (!req.user) {
    console.log("invalid user information");
    res.statusCode = 401;
    res.end();
    return;
  }

  res.send(Arduino_response);
});

function check_auth_user(username, password, done) {
  var sql="SELECT * FROM users WHERE username = ? AND password = ?";
  client.query(sql, [username, password], function(err, results) {
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

      console.log("User " + result.username + " logged in.");
      return done(null, result);
    } else {
      console.log("User " + username + " login fail.");
      return done(null, false);
    }
  });
}

console.log("Listening on port " + port);
