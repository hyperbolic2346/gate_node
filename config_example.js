function get_sql_info() {
   return {
    host: '127.0.0.1',
    user: 'motion',
    password: 'amazing_password',
    database: 'dbname'};
}

function get_cookie_secret() {
  return 'super_secret_cookie_secret';
}

function get_session_secret() {
  return 'session_secret_magic_val';
}

function get_file_location() {
  return '/camera/directory';
}

function control_gate() {
  return false;
}

exports.get_sql_info = get_sql_info;
exports.get_cookie_secret = get_cookie_secret;
exports.get_session_secret = get_session_secret;
exports.get_file_location = get_file_location;
exports.control_gate = control_gate;
